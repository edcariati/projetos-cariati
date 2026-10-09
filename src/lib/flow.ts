import { supabase } from './supabase';
import type { Cliente, EtapaModelo, ProjetoEtapa } from './types';
import { cronometroAtivo, pararCronometro } from './tempo';

export const MAX_RODADAS = 3;
export const MAX_DIAS_PAUSA = 180;

async function log(projeto_id: string, tipo: string, texto: string, etapa_codigo?: string) {
  await supabase.from('historico').insert({ projeto_id, tipo, texto, etapa_codigo: etapa_codigo ?? null });
}

/** Conclui a etapa e inicia a próxima etapa aplicável. A última etapa (24) finaliza o projeto. */
export async function concluirEtapa(
  projetoId: string, etapa: ProjetoEtapa, modelos: EtapaModelo[], etapas: ProjetoEtapa[],
) {
  const agora = new Date().toISOString();
  const [{ error }] = await Promise.all([
    supabase.from('projeto_etapas').update({ status: 'concluida', concluida_em: agora }).eq('id', etapa.id),
    cronometroAtivo().then((r) => (r && r.projeto_id === projetoId && r.etapa_codigo === etapa.etapa_codigo ? pararCronometro() : undefined)),
  ]);
  if (error) throw error;
  const registroConcluida = log(projetoId, 'etapa_concluida', 'Etapa concluída', etapa.etapa_codigo);

  const ordem = new Map(modelos.map((m) => [m.codigo, m]));
  const atual = ordem.get(etapa.etapa_codigo)!;
  const habitese = atual.fase === 6;   // o Habite-se segue em linha própria, em paralelo ao fluxo principal
  const proxima = etapas
    .filter((e) => (habitese ? ordem.get(e.etapa_codigo)!.fase === 6 : ordem.get(e.etapa_codigo)!.fase <= 4) && ordem.get(e.etapa_codigo)!.ordem > atual.ordem)
    .filter((e) => e.status === 'pendente')
    .sort((a, b) => ordem.get(a.etapa_codigo)!.ordem - ordem.get(b.etapa_codigo)!.ordem)[0];

  if (proxima) {
    await Promise.all([
      registroConcluida,
      supabase.from('projeto_etapas').update({ status: 'em_andamento', iniciada_em: agora }).eq('id', proxima.id),
      log(projetoId, 'etapa_iniciada', 'Etapa iniciada', proxima.etapa_codigo),
    ]);
    return;
  }
  await registroConcluida;
  if (etapa.etapa_codigo === '24') {
    await Promise.all([supabase.from('projetos').update({ status: 'finalizado' }).eq('id', projetoId), log(projetoId, 'nota', 'Projeto finalizado')]);
  } else if (etapa.etapa_codigo === 'H3') {
    await log(projetoId, 'nota', 'Habite-se concluído', 'H3');
    // se o projeto principal já estava encerrado e foi reaberto só para o Habite-se, volta a finalizado
    if (etapas.find((e) => e.etapa_codigo === '24')?.status === 'concluida') {
      await supabase.from('projetos').update({ status: 'finalizado' }).eq('id', projetoId);
    }
  }
}

/** Reabre uma etapa já concluída (etapas aprovadas só voltam por reabertura explícita). */
export async function reabrirEtapa(projetoId: string, etapa: ProjetoEtapa) {
  await supabase.from('projeto_etapas')
    .update({ status: 'em_andamento', concluida_em: null }).eq('id', etapa.id);
  await log(projetoId, 'nota', 'Etapa reaberta — revisar as etapas seguintes', etapa.etapa_codigo);
}

/** Estudo → [agendamento, apresentação] que vêm depois dele. */
export const SEQUENCIA_APRESENTACAO: Record<string, [string, string]> = { '07': ['08', '09'], '11': ['12', '13'] };

/**
 * Registra uma rodada de ajuste no estudo (planta baixa ou fachada); as horas seguintes ficam nesta etapa, que é a da revisão.
 * destino 'apresentar': nova apresentação — a etapa de estudo volta a andamento e, ao concluir, o fluxo passa de novo pelo agendamento e pela reunião.
 * destino 'analise': o estudo vai ao cliente para análise — cria a tarefa “Enviar para análise do cliente” na fila do Administrativo.
 */
export async function registrarRodada(projetoId: string, etapa: ProjetoEtapa, destino?: 'apresentar' | 'analise', etapas: ProjetoEtapa[] = []) {
  const n = etapa.rodadas_ajuste + 1;
  const agora = new Date().toISOString();
  await supabase.from('projeto_etapas').update({ rodadas_ajuste: n, ...(etapa.status === 'concluida' ? { status: 'em_andamento', concluida_em: null, iniciada_em: agora } : {}) }).eq('id', etapa.id);
  await log(projetoId, 'ajuste',
    n > MAX_RODADAS ? `Rodada de ajuste ${n} — acima do limite contratual (custo adicional)` : `Rodada de ajuste ${n} de ${MAX_RODADAS}`,
    etapa.etapa_codigo);
  const seq = SEQUENCIA_APRESENTACAO[etapa.etapa_codigo];
  if (destino === 'apresentar' && seq) {
    for (const cod of seq) {
      const e = etapas.find((x) => x.etapa_codigo === cod);
      if (e && e.status !== 'nao_aplicavel') await supabase.from('projeto_etapas').update({ status: 'pendente', concluida_em: null, iniciada_em: null }).eq('id', e.id);
    }
    await log(projetoId, 'nota', `Revisão ${n}: nova apresentação — após o ajuste seguem o agendamento (${seq[0]}) e a reunião (${seq[1]}), avisando o Administrativo.`, etapa.etapa_codigo);
  } else if (destino === 'analise') {
    const { data: t } = await supabase.from('projeto_tarefas').select('ordem').eq('projeto_id', projetoId).eq('etapa_codigo', etapa.etapa_codigo).order('ordem', { ascending: false }).limit(1);
    const ordem = ((t as { ordem: number }[]) ?? [])[0]?.ordem ?? 0;
    const nova = await supabase.from('projeto_tarefas').insert({ projeto_id: projetoId, etapa_codigo: etapa.etapa_codigo, ordem: ordem + 1, titulo: `Enviar o estudo (revisão ${n}) ao cliente para análise`, prioridade: 'Alta', setor_fila: 'administrativo', descricao: 'Criada ao registrar a rodada: o Administrativo envia o estudo e registra o retorno do cliente.' }).select('id').single();
    if (nova.data) await supabase.from('projeto_tarefa_itens').insert({ tarefa_id: nova.data.id, projeto_id: projetoId, ordem: 1, texto: null });
    await log(projetoId, 'nota', `Revisão ${n}: estudo segue ao cliente para análise — tarefa enviada à fila do Administrativo.`, etapa.etapa_codigo);
  }
}

async function abrirChecklist(projetoId: string, etapa: string) {
  const { error } = await supabase.rpc('instanciar_tarefas_etapa', { p_projeto: projetoId, p_etapa: etapa });
  if (error) throw error;
}

/** tipo: 'P1' pausa a pedido do cliente · 'P2' pausa por falta de retorno (tentativas de contato) */
export async function pausarProjeto(projetoId: string, motivo: string, tipo: 'P1' | 'P2') {
  const rodando = await cronometroAtivo();
  if (rodando && rodando.projeto_id === projetoId) await pararCronometro();
  const hoje = new Date().toISOString().slice(0, 10);
  await supabase.from('projetos').update({ status: 'pausado', pausado_em: hoje, motivo_pausa: motivo }).eq('id', projetoId);
  await log(projetoId, 'pausa', motivo);
  await abrirChecklist(projetoId, tipo);
}

export async function retomarProjeto(projetoId: string) {
  await supabase.from('projetos').update({ status: 'ativo', pausado_em: null, motivo_pausa: null }).eq('id', projetoId);
  await log(projetoId, 'retomada', 'Projeto retomado — reanalisar e replanejar antes de seguir');
  await abrirChecklist(projetoId, 'P3');
}

export async function rescindirProjeto(projetoId: string) {
  await supabase.from('projetos').update({ status: 'rescindido' }).eq('id', projetoId);
  await log(projetoId, 'nota', 'Rescisão por ausência de retomada (pausa acima de 180 dias)');
  await abrirChecklist(projetoId, 'P4');
}

export const diasDePausa = (pausado_em: string | null) =>
  pausado_em ? Math.floor((Date.now() - new Date(pausado_em + 'T12:00:00').getTime()) / 86_400_000) : 0;

/** Inicia o Habite-se (após a regularização ou com a obra pronta). Reabre o projeto no quadro se já estava finalizado. */
export async function iniciarHabitese(projetoId: string) {
  const { error } = await supabase.rpc('iniciar_habitese', { p_projeto: projetoId });
  if (error) throw error;
}

/** Etapa 01 (coleta inicial): marca os itens que o cadastro do cliente já traz, para o projeto chegar adiantado. */
export async function preencherEtapa01(projetoId: string, c: Partial<Cliente> | undefined | null, meuId: string) {
  if (!c) return;
  const tem = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== '';
  const regras: [RegExp, boolean][] = [
    [/inten[cç][aã]o/i, tem(c.obra_intencao)], [/metragem/i, tem(c.obra_metragem)], [/nome completo/i, tem(c.nome)],
    [/telefone/i, tem(c.telefone) || tem(c.whatsapp)], [/e-?mail/i, tem(c.email)],
    [/endere[cç]o atual/i, tem(c.end_logradouro)], [/endere[cç]o da obra/i, tem(c.obra_logradouro)],
    [/^lote/i, tem(c.obra_lote)], [/^quadra/i, tem(c.obra_quadra)],
  ];
  const { data: tarefa } = await supabase.from('projeto_tarefas').select('id').eq('projeto_id', projetoId).eq('etapa_codigo', '01').limit(1).maybeSingle();
  if (!tarefa) return;
  const { data: itens } = await supabase.from('projeto_tarefa_itens').select('id,texto,feito').eq('tarefa_id', tarefa.id);
  const agora = new Date().toISOString();
  for (const it of (itens ?? []) as { id: string; texto: string | null; feito: boolean }[]) {
    if (it.feito || !it.texto) continue;
    if (regras.some(([re, ok]) => ok && re.test(it.texto!))) {
      await supabase.from('projeto_tarefa_itens').update({ feito: true, feito_por: meuId, feito_em: agora }).eq('id', it.id);
    }
  }
}
