import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Evento } from '../lib/cronograma';

const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const ICO: Record<string, string> = { etapa: '●', protocolo: '◆', entrega: '★' };
const maiusc = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Calendário mensal com os prazos das etapas, dos protocolos e a entrega prevista de cada projeto. */
export default function Calendario({ eventos }: { eventos: Evento[] }) {
  const [ref, setRef] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [aberto, setAberto] = useState<string | null>(null);
  const dias = useMemo(() => {
    const ini = new Date(ref); ini.setDate(1 - ((ref.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(ini); d.setDate(ini.getDate() + i); return d; });
  }, [ref]);
  const porDia = useMemo(() => { const m = new Map<string, Evento[]>(); for (const e of eventos) m.set(e.data, [...(m.get(e.data) ?? []), e]); return m; }, [eventos]);
  const hoje = iso(new Date());
  const doDia = aberto ? porDia.get(aberto) ?? [] : [];
  const mes = ref.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const mover = (n: number) => { setAberto(null); setRef(new Date(ref.getFullYear(), ref.getMonth() + n, 1)); };

  return (
    <div className="calendario">
      <div className="cal-topo">
        <button onClick={() => mover(-1)} aria-label="Mês anterior">‹</button>
        <b>{maiusc(mes)}</b>
        <button onClick={() => mover(1)} aria-label="Próximo mês">›</button>
        <button className="link" onClick={() => { const d = new Date(); setRef(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Hoje</button>
      </div>
      <div className="cal-grade" role="grid">
        {DIAS.map((d) => <div key={d} className="cal-dia-nome" role="columnheader">{d}</div>)}
        {dias.map((d) => {
          const k = iso(d), evs = porDia.get(k) ?? [], fora = d.getMonth() !== ref.getMonth();
          return (
            <button key={k} role="gridcell" className={`cal-dia${fora ? ' fora' : ''}${k === hoje ? ' hoje' : ''}${aberto === k ? ' sel' : ''}`} onClick={() => setAberto(aberto === k ? null : k)} aria-label={`${d.toLocaleDateString('pt-BR')}: ${evs.length} evento(s)`}>
              <span className="cal-num">{d.getDate()}</span>
              {evs.slice(0, 2).map((e, i) => <span key={i} className={`cal-ev ${e.tipo}${e.vencido ? ' vencido' : ''}`}>{ICO[e.tipo]} {e.titulo}</span>)}
              {evs.length > 2 && <span className="cal-mais">+{evs.length - 2}</span>}
            </button>
          );
        })}
      </div>
      {aberto && (
        <div className="cal-detalhe card">
          <h3>{maiusc(new Date(aberto + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }))}</h3>
          {doDia.length === 0 ? <p className="mudo">Nada marcado neste dia.</p> : (
            <ul className="lista">{doDia.map((e, i) => (
              <li key={i}><Link to={`/projetos/${e.projetoId}`}><b>{e.titulo}</b><span className={`etapa ${e.vencido ? 'alerta' : ''}`}>{ICO[e.tipo]} {e.vencido ? '▲ ' : ''}{e.sub}</span></Link></li>
            ))}</ul>
          )}
        </div>
      )}
      <ul className="viz-leg" style={{ marginTop: 8 }}>
        <li>● Prazo da etapa atual</li><li>◆ Prazo de protocolo</li><li>★ Entrega prevista</li><li style={{ color: 'var(--ruim)' }}>▲ Vencido</li>
      </ul>
    </div>
  );
}
