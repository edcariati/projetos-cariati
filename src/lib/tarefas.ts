import { supabase } from './supabase';
import type { EtapaModelo, Profile, Projeto, ProjetoEtapa, ProjetoItem, ProjetoTarefa } from './types';

export interface GrupoTarefas {
  projeto: Projeto & { clientes?: { nome: string } | null };
  etapa: EtapaModelo;
  status: ProjetoEtapa['status'];
  tarefas: ProjetoTarefa[];
  itens: ProjetoItem[];
  pendentes: number;
}

/** Fila de trabalho de um profissional: tarefas atribuídas a ele e, se for do Administrativo ou Comercial, a fila do setor. */
export async function carregarTarefas(alvo: Profile): Promise<GrupoTarefas[]> {
  const consultas = [supabase.from('projeto_tarefas').select('*').eq('responsavel_id', alvo.id)];
  if (alvo.setor === 'administrativo' || alvo.setor === 'comercial') {
    consultas.push(supabase.from('projeto_tarefas').select('*').is('responsavel_id', null).eq('setor_fila', alvo.setor));
  }
  const lotes = await Promise.all(consultas);
  const tarefas = lotes.flatMap((l) => (l.data as ProjetoTarefa[]) ?? []);
  if (!tarefas.length) return [];

  const projIds = [...new Set(tarefas.map((t) => t.projeto_id))];
  const [it, pr, et, mo] = await Promise.all([
    supabase.from('projeto_tarefa_itens').select('*').in('tarefa_id', tarefas.map((t) => t.id)).order('ordem'),
    supabase.from('projetos').select('*, clientes(nome)').in('id', projIds),
    supabase.from('projeto_etapas').select('*').in('projeto_id', projIds),
    supabase.from('etapa_modelos').select('*').order('ordem'),
  ]);
  const itens = (it.data as ProjetoItem[]) ?? [];
  const projetos = (pr.data as GrupoTarefas['projeto'][]) ?? [];
  const etapas = (et.data as ProjetoEtapa[]) ?? [];
  const modelos = (mo.data as EtapaModelo[]) ?? [];

  const grupos: GrupoTarefas[] = [];
  for (const p of projetos.filter((x) => x.status === 'ativo')) {
    for (const codigo of [...new Set(tarefas.filter((t) => t.projeto_id === p.id).map((t) => t.etapa_codigo))]) {
      const status = etapas.find((e) => e.projeto_id === p.id && e.etapa_codigo === codigo)?.status;
      const etapa = modelos.find((m) => m.codigo === codigo);
      if (!status || status === 'nao_aplicavel' || !etapa) continue;
      const ts = tarefas.filter((t) => t.projeto_id === p.id && t.etapa_codigo === codigo);
      const is = itens.filter((i) => ts.some((t) => t.id === i.tarefa_id));
      const pendentes = is.filter((i) => !i.feito).length;
      if (pendentes > 0 || status === 'em_andamento') grupos.push({ projeto: p, etapa, status, tarefas: ts, itens: is, pendentes });
    }
  }
  return grupos.sort((a, b) => a.etapa.ordem - b.etapa.ordem);
}
