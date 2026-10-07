import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Tempo } from './types';
import { invalidarBruto } from './carga';

const EVENTO = 'cronometro-mudou';
export const avisarMudanca = () => { invalidarBruto(); window.dispatchEvent(new Event(EVENTO)); };
export const aoMudar = (fn: () => void) => {
  window.addEventListener(EVENTO, fn);
  return () => window.removeEventListener(EVENTO, fn);
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
export async function iniciarCronometro(projetoId: string, etapa: string) {
  const { error } = await supabase.rpc('iniciar_cronometro', { p_projeto: projetoId, p_etapa: etapa });
  if (error) throw error;
  avisarMudanca();
}

export async function pararCronometro() {
  const { error } = await supabase.rpc('parar_cronometro');
  if (error) throw error;
  avisarMudanca();
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
