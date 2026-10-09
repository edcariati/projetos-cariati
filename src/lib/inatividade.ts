import { useEffect } from 'react';
import { supabase } from './supabase';

/** Sai da conta depois de alguns minutos sem uso (computador de uso compartilhado, tela esquecida aberta). */
export function useSairPorInatividade(minutos = 30) {
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const reinicia = () => { clearTimeout(t); t = setTimeout(() => { supabase.auth.signOut(); }, minutos * 60_000); };
    const eventos = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
    eventos.forEach((e) => addEventListener(e, reinicia, { passive: true }));
    reinicia();
    return () => { clearTimeout(t); eventos.forEach((e) => removeEventListener(e, reinicia)); };
  }, [minutos]);
}
