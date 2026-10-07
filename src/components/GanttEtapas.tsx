import { useState } from 'react';
import { useLargura } from './graficos';
import type { LinhaCrono, Seg } from '../lib/cronograma';
import { fmtDur } from '../lib/labels';

const fmt = (t: number) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

/** Gantt de um projeto: uma barra por etapa (feitas com as datas reais, atual com o prazo de referência e as próximas projetadas). */
export default function GanttEtapas({ linha, inicio, fim, segundos, parceiro }: { linha: LinhaCrono; inicio: number; fim: number; segundos?: Map<string, number>; parceiro?: Set<string> }) {
  const [ref, w] = useLargura<HTMLDivElement>();
  const [dica, setDica] = useState<{ x: number; y: number; s: Seg } | null>(null);
  const segs = [...linha.segs].sort((a, b) => a.ini - b.ini || a.etapa.localeCompare(b.etapa));
  const lw = Math.min(190, Math.max(110, w * 0.3)), W = Math.max(w, 340), rowH = 30, topo = 28;
  const H = topo + segs.length * rowH + 22;
  const t0 = Math.min(inicio, ...segs.map((s) => s.ini)), t1 = Math.max(fim, ...segs.map((s) => s.fim)), iw = W - lw - 12;
  const x = (t: number) => lw + ((t - t0) / (t1 - t0 || 1)) * iw;
  const hoje = Date.now();
  const marcas: number[] = [];
  for (let d = new Date(t0); d.getTime() <= t1; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) { const m = new Date(d.getFullYear(), d.getMonth(), 1).getTime(); if (m >= t0) marcas.push(m); }
  const corta = (s: string, px: number) => { const c = Math.floor(px / 6.6); return s.length > c ? s.slice(0, Math.max(1, c - 1)) + '…' : s; };
  return (
    <div className="viz-wrap" ref={ref} onPointerLeave={() => setDica(null)}>
      {w > 0 && (
        <svg width={W} height={H} role="img" aria-label={`Gantt das etapas de ${linha.projeto.nome}`}>
          {marcas.map((m) => (<g key={m}><line x1={x(m)} x2={x(m)} y1={topo - 6} y2={H - 6} className="viz-grade" /><text x={x(m) + 4} y={14} className="viz-tick">{new Date(m).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })}</text></g>))}
          {segs.map((s, i) => {
            const cy = topo + i * rowH + rowH / 2, xa = x(s.ini), wd = Math.max(4, x(s.fim) - x(s.ini) - 1);
            const cor = s.tipo === 'feita' ? 'var(--ink3)' : s.atrasada ? 'var(--st-serious)' : parceiro?.has(s.etapa) ? 'var(--s3)' : 'var(--s1)';
            const h = segundos?.get(s.etapa);
            return (
              <g key={s.etapa + s.tipo}>
                <text x={lw - 8} y={cy} className="viz-rot" textAnchor="end" dominantBaseline="central">{corta(`${s.etapa} ${s.rotulo}`, lw - 12)}</text>
                <rect x={xa} y={cy - 8} width={wd} height={16} rx={4} tabIndex={0} fill={cor} fillOpacity={s.tipo === 'feita' ? 0.45 : s.tipo === 'prevista' ? 0.18 : 0.95}
                  stroke={s.tipo === 'prevista' ? cor : 'none'} strokeWidth={s.tipo === 'prevista' ? 1.5 : 0} strokeDasharray={s.tipo === 'prevista' ? '4 3' : undefined}
                  onPointerMove={(e) => { const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setDica({ x: e.clientX - r.left, y: cy, s }); }}
                  onFocus={() => setDica({ x: xa + wd / 2, y: cy, s })} onBlur={() => setDica(null)} />
                {h ? <text x={Math.min(W - 40, x(s.fim) + 6)} y={cy} className="viz-val" dominantBaseline="central">{fmtDur(h)}</text> : null}
              </g>
            );
          })}
          <line x1={x(hoje)} x2={x(hoje)} y1={topo - 8} y2={H - 16} stroke="var(--ink)" strokeWidth={1.5} />
          <text x={x(hoje)} y={H - 4} className="viz-tick" textAnchor="middle" style={{ fontWeight: 600 }}>hoje</text>
        </svg>
      )}
      {dica && (
        <div className="viz-dica" role="status" style={{ left: dica.x, top: dica.y, transform: `translate(${dica.x > W * 0.6 ? 'calc(-100% - 12px)' : '12px'}, -50%)` }}>
          <div className="viz-dica-l"><b>Etapa {dica.s.etapa}</b><span>{dica.s.rotulo}</span></div>
          <div className="viz-dica-l"><span>{fmt(dica.s.ini)} → {fmt(dica.s.fim)}</span></div>
          <div className="viz-dica-l"><span>{dica.s.tipo === 'feita' ? 'Concluída' : dica.s.tipo === 'prevista' ? `Previsto (${Math.round(dica.s.ref)} d)` : dica.s.atrasada ? '▲ Atrasada' : 'Em andamento'}</span></div>
          {segundos?.get(dica.s.etapa) ? <div className="viz-dica-l"><span>Tempo registrado: {fmtDur(segundos.get(dica.s.etapa)!)}</span></div> : null}
        </div>
      )}
      <ul className="viz-leg" style={{ marginTop: 8 }}>
        <li><i className="caixa" style={{ background: 'var(--ink3)', opacity: 0.5 }} />Concluída</li>
        <li><i className="caixa" style={{ background: 'var(--s1)' }} />Em andamento</li>
        {parceiro && parceiro.size > 0 && <li><i className="caixa" style={{ background: 'var(--s3)' }} />Parceiro executa</li>}
        <li><i className="caixa" style={{ background: 'var(--st-serious)' }} />▲ Atrasada</li>
        <li><i className="caixa" style={{ background: 'transparent', border: '1.5px dashed var(--s1)' }} />Prevista</li>
      </ul>
    </div>
  );
}
