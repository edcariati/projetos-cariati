import { supabase } from './supabase';
import type { Tempo } from './types';

const EVENTO = 'cronometro-mudou';
export const avisarMudanca = () => window.dispatchEvent(new Event(EVENTO));
export const aoMudar = (fn: () => void) => {
  window.addEventListener(EVENTO, fn);
  return () => window.removeEventListener(EVENTO, fn);
};

export const segundosEntre = (ini: string, fim: string | null, agora = Date.now()) =>
  Math.max(0, ((fim ? new Date(fim).getTime() : agora) - new Date(ini).getTime()) / 1000);

/** Cronômetro que está rodando para a pessoa logada (no máximo um). */
export async function cronometroAtivo(): Promise<Tempo | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data } = await supabase.from('tempos').select('*, projetos(nome)')
    .eq('usuario_id', u.user.id).is('finalizado_em', null).limit(1);
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
