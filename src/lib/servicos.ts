import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { TipoEstudo } from './types';
import { PADRAO, type Catalogo, type Categoria, type Item, type Perfil } from './catalogoPadrao';

export { PADRAO, NOTA_PARCEIRO, idServico } from './catalogoPadrao';
export type { Catalogo, Categoria, Item, Perfil };

/** Etapas do fluxo que valem para todo projeto (o arquitetônico é o serviço-base). */
export const ETAPAS_BASE = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '20', '21', '22', '23', '24'];

/* ---------- catálogo em uso (banco, com o padrão como reserva) ---------- */
let atual: Catalogo = PADRAO;
let carregadoEm = 0;
const ouvintes = new Set<() => void>();
export const catalogo = () => atual;

export async function carregarCatalogo(forcar = false): Promise<Catalogo> {
  if (!forcar && Date.now() - carregadoEm < 60000) return atual;
  const [c, i, p] = await Promise.all([
    supabase.from('servico_categorias').select('*').order('ordem'),
    supabase.from('servico_itens').select('*').order('ordem'),
    supabase.from('perfis_cliente').select('*').order('ordem'),
  ]);
  carregadoEm = Date.now();
  if (c.error || i.error || p.error || !c.data?.length) { atual = PADRAO; }
  else {
    const itens = (i.data ?? []) as { id: string; categoria_id: string; nome: string; ativo: boolean; premium?: boolean }[];
    atual = {
      doBanco: true,
      categorias: (c.data as { id: string; nome: string; etapas: string[]; execucao?: 'escritorio' | 'parceiro'; ativo: boolean }[]).map((x) => ({ id: x.id, nome: x.nome, etapas: x.etapas ?? [], execucao: x.execucao ?? 'escritorio', ativo: x.ativo, itens: itens.filter((y) => y.categoria_id === x.id).map((y) => ({ id: y.id, nome: y.nome, ativo: y.ativo, premium: !!y.premium })) })),
      perfis: ((p.data ?? []) as (Omit<Perfil, 'area_min' | 'area_max'> & { area_min: number | null; area_max: number | null })[]).map((x) => ({ ...x, area_min: x.area_min === null ? null : Number(x.area_min), area_max: x.area_max === null ? null : Number(x.area_max), entregas: x.entregas ?? [] })),
    };
  }
  ouvintes.forEach((f) => f());
  return atual;
}
export const invalidarCatalogo = () => { carregadoEm = 0; };

/** Catálogo atual (e recarrega quando o administrador altera). */
export function useCatalogo(): Catalogo {
  const [c, setC] = useState(atual);
  useEffect(() => {
    const f = () => setC(atual);
    ouvintes.add(f); carregarCatalogo().then(f);
    return () => { ouvintes.delete(f); };
  }, []);
  return c;
}

export const perfilPorId = (id: string | null | undefined) => atual.perfis.find((p) => p.id === id);
export function nomeServico(id: string) {
  const cat = atual.categorias.find((c) => id.startsWith(c.id + '-'));
  const item = cat?.itens.find((x) => x.id === id);
  return { categoria: cat?.nome ?? '', nome: item?.nome ?? id };
}

/** Perfil sugerido pela metragem (os marcados para não sugerir, como D e E, ficam de fora). */
export function perfilSugerido(m2: number): string | null {
  if (!Number.isFinite(m2) || m2 <= 0) return null;
  return atual.perfis.find((p) => p.ativo && p.sugerir && p.area_min !== null && m2 >= p.area_min && (p.area_max === null || m2 < p.area_max))?.id ?? null;
}

export const ESTUDOS: { id: TipoEstudo; nome: string; desc: string }[] = [
  { id: 'padrao', nome: 'Construção nova', desc: 'Briefing, estudo de planta baixa e estudo de fachada, cada um com apresentação e aceite.' },
  { id: 'ampliacao', nome: 'Ampliação', desc: 'Parte do que já existe: estudo de ampliação em vez do estudo completo.' },
  { id: 'mais_projetos', nome: '+ Projetos (perfil D e E)', desc: 'Projeto a partir do croqui do cliente, sem estudo de fachada.' },
];

/** Marcas do projeto (as mesmas do “Novo projeto”) a partir do perfil e dos serviços escolhidos. */
export function flagsDe(ids: string[], perfil?: string | null) {
  const dasCats = (etapa: string) => atual.categorias.filter((c) => c.etapas.includes(etapa)).map((c) => c.id);
  const em = (etapa: string, excecoes: string[] = []) => ids.some((i) => !excecoes.includes(i) && dasCats(etapa).some((c) => i.startsWith(c + '-')));
  const aprov = (perfilPorId(perfil)?.entregas ?? []).some((e) => /prefeitura/i.test(e));
  return {
    legal: em('16', ['prefeitura-06']) || ids.some((i) => ['arq-09', 'arq-10', 'arq-13'].includes(i)) || aprov,
    interiores: em('17'),
    complementares: em('19') || ids.some((i) => i.startsWith('caixa-02')),
    habitese: ids.includes('prefeitura-06') || em('H1'),
  };
}

/** Etapas do fluxo que o projeto vai ter com o perfil e os serviços escolhidos. */
export function etapasDe(ids: string[], perfil?: string | null): string[] {
  const f = flagsDe(ids, perfil);
  const extra = [...(f.legal ? ['16'] : []), ...(f.interiores ? ['17', '18'] : []), ...(f.complementares ? ['19'] : []), ...(f.habitese ? ['H1', 'H2', 'H3'] : [])];
  return [...ETAPAS_BASE, ...extra];
}

/** Categorias contratadas que ainda não têm etapas próprias no fluxo (viram só marca no cadastro). */
export const semFluxo = (ids: string[]) => atual.categorias.filter((c) => !c.etapas.length && c.id !== 'arq' && ids.some((i) => i.startsWith(c.id + '-')));

/** Tipos de aprovação escolhidos (podem ser vários, ex.: unificação + residencial). Guardados como texto separado por “ + ”. */
export const lerAprovacoes = (t: string | null | undefined) => (t ?? '').split('+').map((x) => x.trim()).filter(Boolean);
export const juntarAprovacoes = (a: string[]) => a.join(' + ');
/** Serviços que entram sozinhos no pacote Premium. */
export const idsPremium = () => atual.categorias.flatMap((c) => c.itens.filter((x) => x.ativo && x.premium).map((x) => x.id));
