import { supabase } from './supabase';
import type { EtapaModelo, Profile, Protocolo } from './types';
import { buscarTudo } from './banco';
import type { Bruto, ItemK, ProjetoK, TempoK } from './kpis';

/** Tudo que os painéis de gestão precisam: projetos com etapas, tempos, checklists concluídos, equipe e protocolos. */
export async function carregarBruto(): Promise<Bruto> {
  const desde = new Date(Date.now() - 740 * 86_400_000).toISOString();
  const projetos = await buscarTudo<ProjetoK>((de, ate) =>
    supabase.from('projetos').select('*, clientes(nome,codigo), profiles(nome), projeto_etapas(etapa_codigo,status,iniciada_em,concluida_em,rodadas_ajuste)')
      .order('created_at', { ascending: false }).range(de, ate));
  const tempos = await buscarTudo<TempoK>((de, ate) =>
    supabase.from('tempos').select('projeto_id,etapa_codigo,usuario_id,iniciado_em,finalizado_em').order('iniciado_em').range(de, ate));
  const itens = await buscarTudo<ItemK>((de, ate) =>
    supabase.from('projeto_tarefa_itens').select('feito_em,feito_por').not('feito_em', 'is', null).gte('feito_em', desde).order('feito_em').range(de, ate));
  const [m, p, pr] = await Promise.all([
    supabase.from('etapa_modelos').select('*').order('ordem'),
    supabase.from('profiles').select('*').eq('ativo', true),
    supabase.from('protocolos').select('*, projetos(nome, clientes(nome))').order('prazo', { ascending: true, nullsFirst: false }),
  ]);
  return { projetos, tempos, itens, modelos: (m.data as EtapaModelo[]) ?? [], pessoas: (p.data as Profile[]) ?? [], protocolos: (pr.data as Protocolo[]) ?? [] };
}
