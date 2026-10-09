import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { aoMudar } from './tempo';

export type ItensPorEtapa = Map<string, { feitos: number; total: number }>;   // chave: "projetoId|etapa"

/** Itens de checklist de todos os projetos visíveis, agrupados por etapa (uma busca só). */
export function useItensPorEtapa(): ItensPorEtapa {
  const [m, setM] = useState<ItensPorEtapa>(new Map());
  useEffect(() => {
    let vivo = true;
    supabase.from('projeto_tarefa_itens').select('projeto_id,feito,projeto_tarefas(etapa_codigo)').then(({ data }) => {
      if (!vivo) return;
      const r: ItensPorEtapa = new Map();
      for (const i of (data as unknown as { projeto_id: string; feito: boolean; projeto_tarefas: { etapa_codigo: string } | null }[]) ?? []) {
        const cod = i.projeto_tarefas?.etapa_codigo; if (!cod) continue;
        const k = `${i.projeto_id}|${cod}`; const x = r.get(k) ?? { feitos: 0, total: 0 };
        x.total += 1; if (i.feito) x.feitos += 1; r.set(k, x);
      }
      setM(r);
    });
    return () => { vivo = false; };
  }, []);
  return m;
}

/**
 * Percentual do projeto: etapa concluída vale 1; etapa em andamento vale a fração de itens do checklist já marcados (no máximo 0,95 até concluir);
 * etapa pendente vale 0. Sem itens, só conta quando concluída.
 */
export function percentualProjeto(projetoId: string, etapas: { etapa_codigo: string; status: string }[], itens: ItensPorEtapa): number {
  if (!etapas.length) return 0;
  let soma = 0;
  for (const e of etapas) {
    if (e.status === 'concluida') { soma += 1; continue; }
    if (e.status !== 'em_andamento') continue;
    const x = itens.get(`${projetoId}|${e.etapa_codigo}`);
    if (x && x.total > 0) soma += Math.min(0.95, x.feitos / x.total);
  }
  return Math.round((soma / etapas.length) * 100);
}
