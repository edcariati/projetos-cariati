import { supabase } from './supabase';
import type { EtapaModelo, ProjetoEtapa } from './types';
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
  const rodando = await cronometroAtivo();
  if (rodando && rodando.projeto_id === projetoId && rodando.etapa_codigo === etapa.etapa_codigo) await pararCronometro();
  const { error } = await supabase.from('projeto_etapas')
    .update({ status: 'concluida', concluida_em: agora }).eq('id', etapa.id);
  if (error) throw error;
  await log(projetoId, 'etapa_concluida', 'Etapa concluída', etapa.etapa_codigo);

  const ordem = new Map(modelos.map((m) => [m.codigo, m]));
  const atual = ordem.get(etapa.etapa_codigo)!;
  const proxima = etapas
    .filter((e) => ordem.get(e.etapa_codigo)!.fase <= 4 && ordem.get(e.etapa_codigo)!.ordem > atual.ordem)
    .filter((e) => e.status === 'pendente')
    .sort((a, b) => ordem.get(a.etapa_codigo)!.ordem - ordem.get(b.etapa_codigo)!.ordem)[0];

  if (proxima) {
    await supabase.from('projeto_etapas')
      .update({ status: 'em_andamento', iniciada_em: agora }).eq('id', proxima.id);
    await log(projetoId, 'etapa_iniciada', 'Etapa iniciada', proxima.etapa_codigo);
  } else if (etapa.etapa_codigo === '24') {
    await supabase.from('projetos').update({ status: 'finalizado' }).eq('id', projetoId);
    await log(projetoId, 'nota', 'Projeto finalizado');
  }
}

/** Reabre uma etapa já concluída (etapas aprovadas só voltam por reabertura explícita). */
export async function reabrirEtapa(projetoId: string, etapa: ProjetoEtapa) {
  await supabase.from('projeto_etapas')
    .update({ status: 'em_andamento', concluida_em: null }).eq('id', etapa.id);
  await log(projetoId, 'nota', 'Etapa reaberta — revisar as etapas seguintes', etapa.etapa_codigo);
}

export async function registrarRodada(projetoId: string, etapa: ProjetoEtapa) {
  const n = etapa.rodadas_ajuste + 1;
  await supabase.from('projeto_etapas').update({ rodadas_ajuste: n }).eq('id', etapa.id);
  await log(projetoId, 'ajuste',
    n > MAX_RODADAS ? `Rodada de ajuste ${n} — acima do limite contratual (custo adicional)` : `Rodada de ajuste ${n} de ${MAX_RODADAS}`,
    etapa.etapa_codigo);
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
