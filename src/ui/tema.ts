import { useEffect, useState } from 'react';

export type Tema = 'dark' | 'light';
const CHAVE = 'tema-cariati';

export function temaSalvo(): Tema {
  try { const t = localStorage.getItem(CHAVE); if (t === 'light' || t === 'dark') return t; } catch { /* sem armazenamento */ }
  return 'dark';
}
export function aplicarTema(t: Tema) {
  document.documentElement.setAttribute('data-theme', t);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0B0D14' : '#F3F4FA');
}
export function useTema(): [Tema, () => void] {
  const [t, setT] = useState<Tema>(() => (document.documentElement.getAttribute('data-theme') as Tema) || temaSalvo());
  useEffect(() => { aplicarTema(t); try { localStorage.setItem(CHAVE, t); } catch { /* ignora */ } }, [t]);
  return [t, () => setT((x) => (x === 'dark' ? 'light' : 'dark'))];
}
