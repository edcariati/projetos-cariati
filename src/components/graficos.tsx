import { ReactNode, useEffect, useRef, useState } from 'react';

/** Gráficos em SVG próprio (sem bibliotecas): barras finas, grade discreta, dica ao passar o mouse e tabela alternativa. */

export const SERIE = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'];
export const STATUS_COR: Record<string, string> = { ok: 'var(--st-good)', atrasada: 'var(--st-warning)', grave: 'var(--st-serious)', critica: 'var(--st-critical)' };
export const STATUS_ROTULO: Record<string, string> = { ok: 'No prazo', atrasada: 'Atrasada', grave: 'Muito atrasada', critica: 'Crítica' };
export const STATUS_ICONE: Record<string, string> = { ok: '✓', atrasada: '▲', grave: '▲▲', critica: '⬣' };

export function useLargura<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    setW(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export const fmtN = (n: number, d = 0) => n.toLocaleString('pt-BR', { maximumFractionDigits: d });

/** escala "bonita": topo arredondado e ticks limpos */
export function escala(max: number, ticks = 4) {
  if (max <= 0) return { topo: 1, passos: [0, 1] };
  const bruto = max / ticks, mag = Math.pow(10, Math.floor(Math.log10(bruto)));
  const f = bruto / mag, passo = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  const topo = Math.ceil(max / passo) * passo, passos: number[] = [];
  for (let v = 0; v <= topo + 1e-9; v += passo) passos.push(+v.toFixed(6));
  return { topo, passos };
}

interface Dica { x: number; y: number; titulo: string; linhas: { cor?: string; rotulo: string; valor: string }[] }
function DicaView({ d, largura }: { d: Dica | null; largura: number }) {
  if (!d) return null;
  const direita = d.x > largura * 0.6;
  return (
    <div className="viz-dica" role="status" style={{ left: d.x, top: d.y, transform: `translate(${direita ? 'calc(-100% - 12px)' : '12px'}, -50%)` }}>
      <div className="viz-dica-t">{d.titulo}</div>
      {d.linhas.map((l, i) => (
        <div key={i} className="viz-dica-l">
          {l.cor && <i style={{ background: l.cor }} />}<b>{l.valor}</b><span>{l.rotulo}</span>
        </div>
      ))}
    </div>
  );
}

export function Legenda({ itens }: { itens: { rotulo: string; cor: string; tipo?: 'caixa' | 'linha' }[] }) {
  if (itens.length < 2) return null;
  return (
    <ul className="viz-leg">
      {itens.map((i) => (
        <li key={i.rotulo}><i className={i.tipo ?? 'caixa'} style={{ background: i.cor }} />{i.rotulo}</li>
      ))}
    </ul>
  );
}

/** Cartão com título, alternância gráfico/tabela e rodapé de leitura. */
export function Cartao({ titulo, sub, children, tabela, largo, nota }: {
  titulo: string; sub?: string; children: ReactNode; largo?: boolean; nota?: ReactNode;
  tabela?: { cab: string[]; linhas: (string | number)[][] };
}) {
  const [ver, setVer] = useState(false);
  return (
    <section className={`card viz-card${largo ? ' largo' : ''}`}>
      <header className="viz-cab">
        <div><h2>{titulo}</h2>{sub && <p className="mudo pequeno">{sub}</p>}</div>
        {tabela && <button className="link viz-alt" onClick={() => setVer(!ver)} aria-pressed={ver}>{ver ? 'Ver gráfico' : 'Ver tabela'}</button>}
      </header>
      {ver && tabela ? (
        <div className="viz-tab"><table>
          <thead><tr>{tabela.cab.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>{tabela.linhas.map((l, i) => <tr key={i}>{l.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
        </table></div>
      ) : children}
      {nota && <p className="viz-nota mudo pequeno">{nota}</p>}
    </section>
  );
}

/** Colunas agrupadas, uma ou mais séries, com linha de referência opcional (mesma unidade). */
export function Colunas({ rotulos, series, linha, altura = 220, unidade = '' }: {
  rotulos: string[]; series: { nome: string; valores: number[]; cor: string }[];
  linha?: { nome: string; valores: number[] }; altura?: number; unidade?: string;
}) {
  const [ref, w] = useLargura<HTMLDivElement>();
  const [dica, setDica] = useState<Dica | null>(null);
  const [foco, setFoco] = useState<number | null>(null);
  const m = { t: 12, r: 12, b: 26, l: 36 }, W = Math.max(w, 260), H = altura;
  const max = Math.max(1, ...series.flatMap((s) => s.valores), ...(linha?.valores ?? []));
  const { topo, passos } = escala(max);
  const iw = W - m.l - m.r, ih = H - m.t - m.b, n = rotulos.length;
  const faixa = iw / Math.max(n, 1), ns = series.length;
  const bw = Math.min(24, Math.max(4, (faixa * 0.72) / ns - 2));
  const y = (v: number) => m.t + ih - (v / topo) * ih;
  const passoRot = Math.ceil(n / Math.max(2, Math.floor(iw / 44)));
  const mostrar = (i: number, cx: number) => {
    setFoco(i);
    setDica({ x: cx, y: m.t + 24, titulo: rotulos[i], linhas: [
      ...series.map((s) => ({ cor: s.cor, rotulo: s.nome, valor: `${fmtN(s.valores[i], 1)}${unidade}` })),
      ...(linha ? [{ cor: 'var(--ink2)', rotulo: linha.nome, valor: `${fmtN(linha.valores[i], 1)}${unidade}` }] : []),
    ] });
  };
  return (
    <div className="viz-wrap" ref={ref} onPointerLeave={() => { setDica(null); setFoco(null); }}>
      {w > 0 && (
        <svg width={W} height={H} role="img" aria-label="Gráfico de colunas">
          {passos.map((p) => (
            <g key={p}><line x1={m.l} x2={W - m.r} y1={y(p)} y2={y(p)} className={p === 0 ? 'viz-eixo' : 'viz-grade'} />
              <text x={m.l - 6} y={y(p)} className="viz-tick" textAnchor="end" dominantBaseline="central">{fmtN(p, 1)}</text></g>
          ))}
          {rotulos.map((r, i) => {
            const cx = m.l + faixa * i + faixa / 2, x0 = cx - (bw * ns + 2 * (ns - 1)) / 2;
            return (
              <g key={i} tabIndex={0} onPointerMove={() => mostrar(i, cx)} onFocus={() => mostrar(i, cx)} onBlur={() => { setDica(null); setFoco(null); }}>
                <rect x={m.l + faixa * i} y={m.t} width={faixa} height={ih} fill="transparent" />
                {foco === i && <rect x={m.l + faixa * i + 2} y={m.t} width={faixa - 4} height={ih} className="viz-foco" />}
                {series.map((s, k) => {
                  const h = Math.max(0, (s.valores[i] / topo) * ih), bx = x0 + k * (bw + 2);
                  return h > 0 ? <path key={k} d={`M${bx} ${m.t + ih} V${m.t + ih - h + Math.min(4, h)} Q${bx} ${m.t + ih - h} ${bx + Math.min(4, bw / 2)} ${m.t + ih - h} H${bx + bw - Math.min(4, bw / 2)} Q${bx + bw} ${m.t + ih - h} ${bx + bw} ${m.t + ih - h + Math.min(4, h)} V${m.t + ih} Z`} fill={s.cor} /> : null;
                })}
                {i % passoRot === 0 && <text x={cx} y={H - 8} className="viz-tick" textAnchor="middle">{r}</text>}
              </g>
            );
          })}
          {linha && (
            <g>
              <polyline fill="none" stroke="var(--ink2)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                points={linha.valores.map((v, i) => `${m.l + faixa * i + faixa / 2},${y(v)}`).join(' ')} />
              {linha.valores.map((v, i) => (i === n - 1 || foco === i) ? <circle key={i} cx={m.l + faixa * i + faixa / 2} cy={y(v)} r={4} fill="var(--ink2)" stroke="var(--card)" strokeWidth={2} /> : null)}
            </g>
          )}
        </svg>
      )}
      <DicaView d={dica} largura={W} />
    </div>
  );
}

/** Linhas (até 4 séries) com cursor vertical que mostra todas as séries na mesma data. */
export function Linhas({ rotulos, series, altura = 220, area, unidade = '' }: {
  rotulos: string[]; series: { nome: string; valores: number[]; cor: string }[]; altura?: number; area?: boolean; unidade?: string;
}) {
  const [ref, w] = useLargura<HTMLDivElement>();
  const [foco, setFoco] = useState<number | null>(null);
  const m = { t: 12, r: 16, b: 26, l: 36 }, W = Math.max(w, 260), H = altura;
  const max = Math.max(1, ...series.flatMap((s) => s.valores));
  const { topo, passos } = escala(max);
  const iw = W - m.l - m.r, ih = H - m.t - m.b, n = rotulos.length;
  const x = (i: number) => m.l + (n <= 1 ? iw / 2 : (iw * i) / (n - 1));
  const y = (v: number) => m.t + ih - (v / topo) * ih;
  const passoRot = Math.ceil(n / Math.max(2, Math.floor(iw / 48)));
  const achar = (cx: number) => Math.max(0, Math.min(n - 1, Math.round(((cx - m.l) / iw) * (n - 1))));
  const dica: Dica | null = foco === null ? null : { x: x(foco), y: m.t + 24, titulo: rotulos[foco], linhas: series.map((s) => ({ cor: s.cor, rotulo: s.nome, valor: `${fmtN(s.valores[foco], 1)}${unidade}` })) };
  return (
    <div className="viz-wrap" ref={ref} onPointerLeave={() => setFoco(null)}>
      {w > 0 && (
        <svg width={W} height={H} role="img" aria-label="Gráfico de linhas" tabIndex={0}
          onPointerMove={(e) => setFoco(achar(e.clientX - e.currentTarget.getBoundingClientRect().left))}
          onKeyDown={(e) => { if (e.key === 'ArrowRight') setFoco(Math.min(n - 1, (foco ?? -1) + 1)); if (e.key === 'ArrowLeft') setFoco(Math.max(0, (foco ?? 1) - 1)); }}
          onBlur={() => setFoco(null)}>
          {passos.map((p) => (
            <g key={p}><line x1={m.l} x2={W - m.r} y1={y(p)} y2={y(p)} className={p === 0 ? 'viz-eixo' : 'viz-grade'} />
              <text x={m.l - 6} y={y(p)} className="viz-tick" textAnchor="end" dominantBaseline="central">{fmtN(p, 1)}</text></g>
          ))}
          {rotulos.map((r, i) => i % passoRot === 0 ? <text key={i} x={x(i)} y={H - 8} className="viz-tick" textAnchor="middle">{r}</text> : null)}
          {foco !== null && <line x1={x(foco)} x2={x(foco)} y1={m.t} y2={m.t + ih} className="viz-cursor" />}
          {series.map((s) => {
            const pts = s.valores.map((v, i) => `${x(i)},${y(v)}`).join(' ');
            return (
              <g key={s.nome}>
                {area && series.length === 1 && <polygon points={`${x(0)},${y(0)} ${pts} ${x(n - 1)},${y(0)}`} fill={s.cor} opacity={0.1} />}
                <polyline points={pts} fill="none" stroke={s.cor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                <circle cx={x(n - 1)} cy={y(s.valores[n - 1] ?? 0)} r={4} fill={s.cor} stroke="var(--card)" strokeWidth={2} />
                {foco !== null && <circle cx={x(foco)} cy={y(s.valores[foco])} r={4} fill={s.cor} stroke="var(--card)" strokeWidth={2} />}
              </g>
            );
          })}
        </svg>
      )}
      <DicaView d={dica} largura={W} />
    </div>
  );
}

export interface LinhaBarra {
  rotulo: string; sub?: string; valor: number; cor?: string; ref?: number; texto?: string; ico?: string; href?: string;
  empilhado?: { valor: number; cor: string; nome: string }[]; dica?: string;
}
/** Barras horizontais finas com valor na ponta e marca de referência opcional (mesma unidade). */
export function BarrasH({ linhas, unidade = '', refNome = 'Referência', max: maxFixo, onAbrir }: {
  linhas: LinhaBarra[]; unidade?: string; refNome?: string; max?: number; onAbrir?: (l: LinhaBarra) => void;
}) {
  const [ref, w] = useLargura<HTMLDivElement>();
  const [dica, setDica] = useState<Dica | null>(null);
  const rowH = 36, m = { t: 4, r: 64, b: 4 };
  const lw = Math.min(180, Math.max(110, w * 0.4)), W = Math.max(w, 260), H = m.t + m.b + linhas.length * rowH;
  const max = maxFixo ?? Math.max(1, ...linhas.map((l) => Math.max(l.valor, l.ref ?? 0)));
  const { topo } = escala(max, 4);
  const iw = W - lw - m.r;
  const x = (v: number) => lw + (v / topo) * iw;
  const corta = (s: string, px: number) => { const c = Math.floor(px / 6.4); return s.length > c ? s.slice(0, Math.max(1, c - 1)) + '…' : s; };
  return (
    <div className="viz-wrap" ref={ref} onPointerLeave={() => setDica(null)}>
      {w > 0 && (
        <svg width={W} height={H} role="img" aria-label="Gráfico de barras">
          <line x1={lw} x2={lw} y1={m.t} y2={H - m.b} className="viz-eixo" />
          {linhas.map((l, i) => {
            const cy = m.t + i * rowH + rowH / 2, base = lw;
            const segs = l.empilhado ?? [{ valor: l.valor, cor: l.cor ?? 'var(--s1)', nome: l.rotulo }];
            let acc = 0;
            const mostrar = (px: number) => setDica({ x: px, y: cy, titulo: l.rotulo + (l.sub ? ` · ${l.sub}` : ''), linhas: l.dica ? [{ rotulo: l.dica, valor: `${fmtN(l.valor, 1)}${unidade}` }] : [...segs.map((s) => ({ cor: s.cor, rotulo: s.nome, valor: `${fmtN(s.valor, 1)}${unidade}` })), ...(l.ref !== undefined ? [{ cor: 'var(--ink2)', rotulo: refNome, valor: `${fmtN(l.ref, 1)}${unidade}` }] : [])] });
            return (
              <g key={i} tabIndex={0} className={onAbrir ? 'viz-link' : undefined} onClick={() => onAbrir?.(l)}
                onPointerMove={() => mostrar(Math.min(W - 20, x(Math.max(l.valor, 0)) + 8))} onFocus={() => mostrar(lw + 40)} onBlur={() => setDica(null)}>
                <rect x={0} y={cy - rowH / 2} width={W} height={rowH} fill="transparent" />
                <text x={lw - 8} y={cy - (l.sub ? 6 : 0)} className="viz-rot" textAnchor="end" dominantBaseline="central">{corta(l.rotulo, lw - 14)}</text>
                {l.sub && <text x={lw - 8} y={cy + 8} className="viz-tick" textAnchor="end" dominantBaseline="central">{corta(l.sub, lw - 14)}</text>}
                {segs.map((s, k) => {
                  const x0 = base + (acc / topo) * iw, wd = (s.valor / topo) * iw; acc += s.valor;
                  if (wd <= 0) return null;
                  const ult = k === segs.length - 1 || segs.slice(k + 1).every((q) => q.valor <= 0), r = Math.min(4, wd);
                  const gap = k > 0 ? 2 : 0;
                  return <path key={k} fill={s.cor} d={ult ? `M${x0 + gap} ${cy - 8} H${x0 + wd - r} Q${x0 + wd} ${cy - 8} ${x0 + wd} ${cy - 8 + r} V${cy + 8 - r} Q${x0 + wd} ${cy + 8} ${x0 + wd - r} ${cy + 8} H${x0 + gap} Z` : `M${x0 + gap} ${cy - 8} H${x0 + wd} V${cy + 8} H${x0 + gap} Z`} />;
                })}
                {l.ref !== undefined && <line x1={x(l.ref)} x2={x(l.ref)} y1={cy - 13} y2={cy + 13} stroke="var(--ink)" strokeWidth={2} />}
                <text x={Math.min(Math.max(x(l.valor), l.ref !== undefined ? x(l.ref) : 0), W - m.r) + 8} y={cy} className="viz-val" dominantBaseline="central">{l.ico ? `${l.ico} ` : ''}{l.texto ?? `${fmtN(l.valor, 1)}${unidade}`}</text>
              </g>
            );
          })}
        </svg>
      )}
      <DicaView d={dica} largura={W} />
    </div>
  );
}

/** Mapa de calor: linhas × colunas, uma só cor (rampa sequencial). */
export function Calor({ linhas, colunas, valores, unidade = '' }: { linhas: string[]; colunas: string[]; valores: number[][]; unidade?: string }) {
  const [ref, w] = useLargura<HTMLDivElement>();
  const [dica, setDica] = useState<Dica | null>(null);
  const max = Math.max(1, ...valores.flat()), lw = Math.min(110, Math.max(70, w * 0.22)), W = Math.max(w, 260);
  const n = colunas.length, cw = (W - lw - 4) / Math.max(n, 1), ch = 28, H = linhas.length * ch + 24;
  const passoRot = Math.ceil(n / Math.max(2, Math.floor((W - lw) / 44)));
  const passo = (v: number) => (v <= 0 ? 0 : Math.min(5, 1 + Math.floor((v / max) * 5 - 1e-9)));
  return (
    <div className="viz-wrap" ref={ref} onPointerLeave={() => setDica(null)}>
      {w > 0 && (
        <svg width={W} height={H} role="img" aria-label="Mapa de calor">
          {linhas.map((l, i) => (
            <g key={l}>
              <text x={lw - 8} y={i * ch + ch / 2} className="viz-rot" textAnchor="end" dominantBaseline="central">{l.length > 14 ? l.slice(0, 13) + '…' : l}</text>
              {colunas.map((c, j) => (
                <rect key={j} x={lw + j * cw + 1} y={i * ch + 1} width={Math.max(2, cw - 2)} height={ch - 2} rx={4} tabIndex={0}
                  className={`viz-cel p${passo(valores[i][j])}`}
                  onPointerMove={() => setDica({ x: lw + j * cw + cw / 2, y: i * ch + ch / 2, titulo: `${l} · ${c}`, linhas: [{ rotulo: 'horas', valor: `${fmtN(valores[i][j], 1)}${unidade}` }] })}
                  onFocus={() => setDica({ x: lw + j * cw + cw / 2, y: i * ch + ch / 2, titulo: `${l} · ${c}`, linhas: [{ rotulo: 'horas', valor: `${fmtN(valores[i][j], 1)}${unidade}` }] })}
                  onBlur={() => setDica(null)} />
              ))}
            </g>
          ))}
          {colunas.map((c, j) => j % passoRot === 0 ? <text key={j} x={lw + j * cw + cw / 2} y={linhas.length * ch + 14} className="viz-tick" textAnchor="middle">{c}</text> : null)}
        </svg>
      )}
      <DicaView d={dica} largura={W} />
    </div>
  );
}

/** Mini gráfico de tendência para os cartões de indicador. */
export function Mini({ valores, cor = 'var(--s1)' }: { valores: number[]; cor?: string }) {
  if (valores.length < 2) return null;
  const W = 96, H = 28, max = Math.max(...valores), min = Math.min(...valores), span = max - min || 1;
  const pts = valores.map((v, i) => `${(i / (valores.length - 1)) * (W - 8) + 2},${H - 4 - ((v - min) / span) * (H - 8)}`);
  const ult = pts[pts.length - 1].split(',');
  return (
    <svg className="viz-mini" width={W} height={H} aria-hidden="true">
      <polyline points={pts.join(' ')} fill="none" stroke="var(--ink3)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={0.55} />
      <circle cx={ult[0]} cy={ult[1]} r={4} fill={cor} stroke="var(--card)" strokeWidth={2} />
    </svg>
  );
}

/** Medidor de uma razão contra um limite: preenchimento muda de cor conforme a gravidade. */
export function Medidor({ valor, max, aviso = 0.7, perigo = 0.9, rotulo }: { valor: number; max: number; aviso?: number; perigo?: number; rotulo?: string }) {
  const r = max ? valor / max : 0;
  const cor = r >= perigo ? 'var(--st-critical)' : r >= aviso ? 'var(--st-warning)' : 'var(--s1)';
  return (
    <div className="viz-med" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={valor} aria-label={rotulo}>
      <i style={{ width: `${Math.min(100, r * 100)}%`, background: cor }} />
    </div>
  );
}
