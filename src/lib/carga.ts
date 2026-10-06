import { supabase } from './supabase';
import type { EtapaModelo, Profile, Protocolo } from './types';
import { buscarTudo } from './banco';
import { Bruto, ItemK, ProjetoK, TempoK, refEtapas } from './kpis';
import { montarCronograma, montarEventos } from './cronograma';

/** Tudo que os painéis de gestão precisam: projetos com etapas, tempos, checklists concluídos, equipe e protocolos. */
let cache: { em: number; dados: Promise<Bruto> } | null = null;
/** Busca tudo em paralelo. Reabrir a tela em até 60 s reaproveita o resultado; `forcar` busca de novo. */
export function carregarBruto(forcar = false): Promise<Bruto> {
  if (!forcar && cache && Date.now() - cache.em < 60_000) return cache.dados;
  const desde = new Date(Date.now() - 740 * 86_400_000).toISOString();
  const dados = Promise.all([
    buscarTudo<ProjetoK>((de, ate) =>
      supabase.from('projetos').select('*, clientes(nome,codigo), profiles(nome), projeto_etapas(etapa_codigo,status,iniciada_em,concluida_em,rodadas_ajuste)')
        .order('created_at', { ascending: false }).range(de, ate)),
    buscarTudo<TempoK>((de, ate) =>
      supabase.from('tempos').select('projeto_id,etapa_codigo,usuario_id,iniciado_em,finalizado_em').order('iniciado_em').range(de, ate)),
    buscarTudo<ItemK>((de, ate) =>
      supabase.from('projeto_tarefa_itens').select('feito_em,feito_por').not('feito_em', 'is', null).gte('feito_em', desde).order('feito_em').range(de, ate)),
    supabase.from('etapa_modelos').select('*').order('ordem'),
    supabase.from('profiles').select('*').eq('ativo', true),
    supabase.from('protocolos').select('*, projetos(nome, clientes(nome))').order('prazo', { ascending: true, nullsFirst: false }),
  ]).then(([projetos, tempos, itens, m, p, pr]) => ({
    projetos, tempos, itens, modelos: (m.data as EtapaModelo[]) ?? [], pessoas: (p.data as Profile[]) ?? [], protocolos: (pr.data as Protocolo[]) ?? [],
  }));
  cache = { em: Date.now(), dados };
  dados.catch(() => { cache = null; });
  return dados;
}
/** Descarta o cache depois de gravar algo que muda os números dos painéis. */
export const invalidarBruto = () => { cache = null; };

/** Dados do cronograma e do calendário: projetos com etapas, modelos de etapa e protocolos. */
export async function carregarCronograma() {
  const [projetos, m, pr] = await Promise.all([
    buscarTudo<ProjetoK>((de, ate) => supabase.from('projetos').select('*, clientes(nome,codigo), profiles(nome), projeto_etapas(etapa_codigo,status,iniciada_em,concluida_em,rodadas_ajuste)').order('created_at', { ascending: false }).range(de, ate)),
    supabase.from('etapa_modelos').select('*').order('ordem'),
    supabase.from('protocolos').select('*, projetos(nome, clientes(nome))'),
  ]);
  const modelos = (m.data as EtapaModelo[]) ?? [];
  const ref = refEtapas(projetos);
  const crono = montarCronograma(projetos, modelos, ref);
  return { crono, eventos: montarEventos(crono, (pr.data as Protocolo[]) ?? []) };
}
