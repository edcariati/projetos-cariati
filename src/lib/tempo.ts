import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Tempo } from './types';
import { invalidarBruto } from './carga';

const EVENTO = 'cronometro-mudou';
/** `ativo`: o novo cronômetro (ou null se parou), já conhecido; a tela se atualiza na hora e depois confirma no servidor. */
export const avisarMudanca = (ativo?: Tempo | null) => { invalidarBruto(); window.dispatchEvent(new CustomEvent(EVENTO, { detail: ativo })); };
export const aoMudar = (fn: (ativo?: Tempo | null) => void) => {
  const h = (e: Event) => fn((e as CustomEvent<Tempo | null | undefined>).detail);
  window.addEventListener(EVENTO, h);
  return () => window.removeEventListener(EVENTO, h);
};

export const segundosEntre = (ini: string, fim: string | null, agora = Date.now()) =>
  Math.max(0, ((fim ? new Date(fim).getTime() : agora) - new Date(ini).getTime()) / 1000);

/** Cronômetro que está rodando para a pessoa logada (no máximo um). */
export async function cronometroAtivo(): Promise<Tempo | null> {
  const { data: s } = await supabase.auth.getSession();   // lê a sessão local, sem ir à rede
  const uid = s.session?.user.id;
  if (!uid) return null;
  const { data } = await supabase.from('tempos').select('*, projetos(nome)')
    .eq('usuario_id', uid).is('finalizado_em', null).limit(1);
  return ((data as Tempo[]) ?? [])[0] ?? null;
}

/** Inicia o cronômetro desta etapa; se houver outro rodando, ele é parado antes. */
export async function iniciarCronometro(projetoId: string, etapa: string, tarefaId?: string) {
  let r = await supabase.rpc('iniciar_cronometro', tarefaId ? { p_projeto: projetoId, p_etapa: etapa, p_tarefa: tarefaId } : { p_projeto: projetoId, p_etapa: etapa });
  if (r.error && tarefaId && /p_tarefa|function|schema cache/i.test(r.error.message)) r = await supabase.rpc('iniciar_cronometro', { p_projeto: projetoId, p_etapa: etapa });   // banco sem a migração 0020: cronometra a etapa
  if (r.error) throw r.error;
  avisarMudanca((r.data as Tempo | null) ?? undefined);
}

/** Para o cronômetro em andamento no horário informado (ex.: ele ficou ligado depois que a pessoa saiu). */
export async function pararEmHorario(id: string, fim: Date) {
  const { error } = await supabase.from('tempos').update({ finalizado_em: fim.toISOString() }).eq('id', id);
  if (error) throw error;
  avisarMudanca();
}

/** Lança um tempo à mão (esqueceu de ligar, cronômetro perdido, queda de rede). */
export async function lancarTempo(projetoId: string, etapa: string, inicio: Date, fim: Date, nota?: string, tarefaId?: string) {
  if (fim <= inicio) throw new Error('O fim precisa ser depois do início.');
  if (fim.getTime() > Date.now() + 60_000) throw new Error('Não dá para lançar tempo no futuro.');
  const base = { projeto_id: projetoId, etapa_codigo: etapa, iniciado_em: inicio.toISOString(), finalizado_em: fim.toISOString() };
  let r = await supabase.from('tempos').insert({ ...base, manual: true, nota: nota || null, tarefa_id: tarefaId ?? null });
  if (r.error && /manual|nota|tarefa_id|schema cache|column/i.test(r.error.message)) r = await supabase.from('tempos').insert(base);   // banco sem a migração 0020
  if (r.error) throw r.error;
  avisarMudanca();
}

export async function ajustarTempo(id: string, inicio: Date, fim: Date) {
  if (fim <= inicio) throw new Error('O fim precisa ser depois do início.');
  const { error } = await supabase.from('tempos').update({ iniciado_em: inicio.toISOString(), finalizado_em: fim.toISOString() }).eq('id', id);
  if (error) throw error;
  avisarMudanca();
}

export async function excluirTempo(id: string) {
  const { error } = await supabase.from('tempos').delete().eq('id', id);
  if (error) throw error;
  avisarMudanca();
}

/** Acima disso um cronômetro ligado provavelmente ficou esquecido. */
export const LIMITE_ESQUECIDO_SEG = 8 * 3600;

export async function pararCronometro() {
  const { error } = await supabase.rpc('parar_cronometro');
  if (error) throw error;
  avisarMudanca(null);
}

/** Tempos das etapas de vários projetos de uma vez (uma busca só), mais o cronômetro em andamento. Atualiza quando um cronômetro inicia ou para. */
export function useTemposDe(projetoIds: string[]) {
  const chave = [...new Set(projetoIds)].sort().join(',');
  const [dados, setDados] = useState<{ fechado: Map<string, number>; ativo: Tempo | null }>({ fechado: new Map(), ativo: null });
  const carregar = useCallback(async () => {
    const ids = chave ? chave.split(',') : [];
    if (!ids.length) { setDados({ fechado: new Map(), ativo: await cronometroAtivo() }); return; }
    const [t, a] = await Promise.all([
      supabase.from('tempos').select('projeto_id,etapa_codigo,iniciado_em,finalizado_em').in('projeto_id', ids).not('finalizado_em', 'is', null),
      cronometroAtivo(),
    ]);
    const m = new Map<string, number>();
    for (const x of (t.data as Pick<Tempo, 'projeto_id' | 'etapa_codigo' | 'iniciado_em' | 'finalizado_em'>[]) ?? []) {
      const k = `${x.projeto_id}|${x.etapa_codigo}`; m.set(k, (m.get(k) ?? 0) + segundosEntre(x.iniciado_em, x.finalizado_em));
    }
    setDados({ fechado: m, ativo: a });
  }, [chave]);
  useEffect(() => { carregar(); return aoMudar(carregar); }, [carregar]);
  return dados;
}
