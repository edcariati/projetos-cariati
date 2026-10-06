import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface Indice { projetos: { id: string; nome: string; cliente: string }[]; clientes: { id: string; nome: string }[] }
let cache: { em: number; dados: Indice } | null = null;
let carga: Promise<Indice> | null = null;

/** Nomes de projetos e clientes para a busca global e as trilhas de navegação (1 busca a cada 2 min). */
export function carregarIndice(): Promise<Indice> {
  if (cache && Date.now() - cache.em < 120000) return Promise.resolve(cache.dados);
  carga ??= Promise.all([
    supabase.from('projetos').select('id,nome,clientes(nome)').order('nome'),
    supabase.from('clientes').select('id,nome').order('nome'),
  ]).then(([p, c]) => {
    const dados: Indice = {
      projetos: ((p.data as unknown as { id: string; nome: string; clientes?: { nome: string } | null }[]) ?? []).map((x) => ({ id: x.id, nome: x.nome, cliente: x.clientes?.nome ?? '' })),
      clientes: (c.data as { id: string; nome: string }[]) ?? [],
    };
    cache = { em: Date.now(), dados }; carga = null; return dados;
  }, () => { carga = null; return { projetos: [], clientes: [] }; });
  return carga;
}
export function invalidarIndice() { cache = null; }
export function useIndice(ativo = true) {
  const [i, setI] = useState<Indice | null>(cache?.dados ?? null);
  useEffect(() => { if (ativo) carregarIndice().then(setI); }, [ativo]);
  return i;
}
