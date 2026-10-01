import { fmtDur } from './labels';

export const dataLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const somaDias = (d: string, n: number) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return dataLocal(x); };

/** Dias úteis (segunda a sexta) já encerrados no período: hoje só conta no dia seguinte. Feriados entram como lançamento manual. */
export function listaDiasUteis(ini: string, fim: string, hoje = new Date()): string[] {
  const ontem = somaDias(dataLocal(hoje), -1);
  const limite = ontem < fim ? ontem : fim;
  const out: string[] = [];
  for (let d = ini; d <= limite; d = somaDias(d, 1)) {
    const w = new Date(d + 'T12:00:00').getDay();
    if (w !== 0 && w !== 6) out.push(d);
  }
  return out;
}

/** +2 h 15 min / −1 h 05 min */
export const fmtSaldo = (seg: number) => (Math.abs(seg) < 60 ? '0 min' : (seg < 0 ? '−' : '+') + fmtDur(Math.abs(seg)));

export function periodo(chave: string, hoje = new Date()): { ini: string; fim: string } {
  const h = dataLocal(hoje);
  if (chave === 'mes') return { ini: h.slice(0, 8) + '01', fim: h };
  if (chave === 'mes_anterior') {
    const ult = new Date(hoje.getFullYear(), hoje.getMonth(), 0), pri = new Date(ult.getFullYear(), ult.getMonth(), 1);
    return { ini: dataLocal(pri), fim: dataLocal(ult) };
  }
  if (chave === '7d') return { ini: somaDias(h, -6), fim: h };
  return { ini: somaDias(h, -29), fim: h };   // 30d
}

/** Busca em páginas de 1000 linhas (limite padrão do Supabase). */
export async function buscarTudo<T>(pagina: (de: number, ate: number) => PromiseLike<{ data: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data } = await pagina(de, de + 999);
    const lote = (data as T[]) ?? [];
    out.push(...lote);
    if (lote.length < 1000) return out;
  }
}

export function baixarCsv(nome: string, linhas: (string | number)[][]) {
  const texto = '\ufeff' + linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
  a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
