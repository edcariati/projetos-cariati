import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLargura } from './graficos';
import type { Crono, Seg } from '../lib/cronograma';

const fmt = (t: number) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

/** Cronograma em barras: uma linha por projeto, etapas feitas (cinza), atual (azul ou alerta) e previstas (tracejadas). */
export default function Cronograma({ crono }: { crono: Crono }) {
  const [ref, w] = useLargura<HTMLDivElement>();
  const nav = useNavigate();
  const [dica, setDica] = useState<{ x: number; y: number; s: Seg } | null>(null);
  const lw = Math.min(170, Math.max(100, w * 0.26)), W = Math.max(w, 320), rowH = 36, topo = 30;
  const H = topo + crono.linhas.length * rowH + 22;
  const t0 = crono.inicio, t1 = crono.fim, iw = W - lw - 12;
  const x = (t: number) => lw + ((t - t0) / (t1 - t0)) * iw;
  const hoje = Date.now();
  // marcas do eixo: início de cada mês
  const marcas: number[] = [];
  for (let d = new Date(t0); d.getTime() <= t1; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) { const m = new Date(d.getFullYear(), d.getMonth(), 1).getTime(); if (m >= t0) marcas.push(m); }
  const corta = (s: string, px: number) => { const c = Math.floor(px / 6.6); return s.length > c ? s.slice(0, Math.max(1, c - 1)) + '…' : s; };

  return (
    <div className="viz-wrap" ref={ref} onPointerLeave={() => setDica(null)}>
      {w > 0 && (
        <svg width={W} height={H} role="img" aria-label="Cronograma dos projetos em andamento">
          {marcas.map((m) => (
            <g key={m}><line x1={x(m)} x2={x(m)} y1={topo - 6} y2={H - 4} className="viz-grade" />
              <text x={x(m) + 4} y={14} className="viz-tick">{new Date(m).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })}</text></g>
          ))}
          {crono.linhas.map((l, i) => {
            const cy = topo + i * rowH + rowH / 2;
            return (
              <g key={l.projeto.id}>
                <text x={lw - 8} y={cy} className="viz-rot" textAnchor="end" dominantBaseline="central" style={{ cursor: 'pointer' }} onClick={() => nav(`/projetos/${l.projeto.id}`)}>{corta(l.projeto.nome, lw - 14)}</text>
                {l.segs.map((s) => {
                  const xa = x(s.ini), wd = Math.max(3, x(s.fim) - x(s.ini) - 1);
                  const cor = s.tipo === 'feita' ? 'var(--ink3)' : s.atrasada ? 'var(--st-serious)' : 'var(--s1)';
                  return (
                    <rect key={s.etapa + s.tipo} x={xa} y={cy - 8} width={wd} height={16} rx={4} tabIndex={0}
                      fill={cor} fillOpacity={s.tipo === 'feita' ? 0.45 : s.tipo === 'prevista' ? 0.18 : 0.95}
                      stroke={s.tipo === 'prevista' ? cor : 'none'} strokeWidth={s.tipo === 'prevista' ? 1.5 : 0} strokeDasharray={s.tipo === 'prevista' ? '4 3' : undefined}
                      onPointerMove={(e) => { const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setDica({ x: e.clientX - r.left, y: cy, s }); }}
                      onFocus={() => setDica({ x: xa + wd / 2, y: cy, s })} onBlur={() => setDica(null)} onClick={() => nav(`/projetos/${l.projeto.id}`)} style={{ cursor: 'pointer' }} />
                  );
                })}
                {l.segs.filter((s) => s.atrasada).map((s) => <text key={'a' + s.etapa} x={x(s.fim) + 4} y={cy} className="viz-val" dominantBaseline="central" fill="var(--ruim)">▲</text>)}
              </g>
            );
          })}
          <line x1={x(hoje)} x2={x(hoje)} y1={topo - 8} y2={H - 16} stroke="var(--ink)" strokeWidth={1.5} />
          <text x={x(hoje)} y={H - 4} className="viz-tick" textAnchor="middle" style={{ fontWeight: 600 }}>hoje</text>
        </svg>
      )}
      {dica && (
        <div className="viz-dica" role="status" style={{ left: dica.x, top: dica.y, transform: `translate(${dica.x > W * 0.6 ? 'calc(-100% - 12px)' : '12px'}, -50%)` }}>
          <div className="viz-dica-t">{dica.s.projeto.nome}</div>
          <div className="viz-dica-l"><b>Etapa {dica.s.etapa}</b><span>{dica.s.rotulo}</span></div>
          <div className="viz-dica-l"><span>{fmt(dica.s.ini)} → {fmt(dica.s.fim)}</span></div>
          <div className="viz-dica-l"><span>{dica.s.tipo === 'feita' ? 'Concluída' : dica.s.tipo === 'prevista' ? `Previsto (${Math.round(dica.s.ref)} d)` : dica.s.atrasada ? `▲ Atrasada: prazo era ${fmt(dica.s.prazo!)}` : `Em andamento, prazo ${fmt(dica.s.prazo!)}`}</span></div>
        </div>
      )}
      <ul className="viz-leg" style={{ marginTop: 8 }}>
        <li><i className="caixa" style={{ background: 'var(--ink3)', opacity: 0.5 }} />Concluída</li>
        <li><i className="caixa" style={{ background: 'var(--s1)' }} />Em andamento</li>
        <li><i className="caixa" style={{ background: 'var(--st-serious)' }} />▲ Atrasada</li>
        <li><i className="caixa" style={{ background: 'transparent', border: '1.5px dashed var(--s1)' }} />Prevista</li>
      </ul>
    </div>
  );
}
