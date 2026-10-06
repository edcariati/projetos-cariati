import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import Icone from './Icone';

const reduzido = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Número que “sobe” até o valor final. Aceita texto como “12 h”, “85%” ou “3 de 12”: anima só o primeiro número. */
export function Contador({ valor, dur = 650 }: { valor: string | number; dur?: number }) {
  const txt = String(valor);
  const m = /^(\D*?)(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?|\d+\.\d+)(.*)$/s.exec(txt);
  const ok = !!m && !(m[2].includes('.') && !/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(m[2]));
  const alvo = ok ? Number(m![2].replace(/\./g, '').replace(',', '.')) : 0;
  const dec = ok ? (m![2].split(',')[1] ?? '').length : 0;
  const [n, setN] = useState(reduzido() ? alvo : 0);
  useEffect(() => {
    if (!ok || reduzido()) { setN(alvo); return; }
    let raf = 0; const t0 = performance.now();
    const passo = (t: number) => { const p = Math.min(1, (t - t0) / dur); setN(alvo * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(passo); };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [alvo, ok, dur]);
  if (!ok) return <>{txt}</>;
  return <>{m![1]}{n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })}{m![3]}</>;
}

/** Medidor circular luminoso: o indicador principal da tela (anéis, escala, brilho e pulso suave). */
export function Anel({ valor, max = 100, rotulo, sub, tam = 220, formato }: { valor: number; max?: number; rotulo: string; sub?: string; tam?: number; formato?: string }) {
  const pct = Math.max(0, Math.min(1, max ? valor / max : 0));
  const R = 70, C = 2 * Math.PI * R;
  const [desenha, setDesenha] = useState(reduzido());
  useEffect(() => { const t = setTimeout(() => setDesenha(true), 60); return () => clearTimeout(t); }, []);
  const id = useRef('g' + Math.random().toString(36).slice(2, 8)).current;
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const a = (i / 60) * Math.PI * 2, forte = i % 5 === 0, r1 = forte ? 90 : 93, r2 = 97;
    return <line key={i} x1={100 + Math.sin(a) * r1} y1={100 - Math.cos(a) * r1} x2={100 + Math.sin(a) * r2} y2={100 - Math.cos(a) * r2} className={forte ? 'anel-tick forte' : 'anel-tick'} />;
  });
  const texto = formato ?? `${Math.round(pct * 100)}%`;
  return (
    <figure className="anel" style={{ width: tam, height: tam }} role="img" aria-label={`${rotulo}: ${texto}${sub ? `, ${sub}` : ''}`}>
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFC23C" /><stop offset=".55" stopColor="#FF9F1C" /><stop offset="1" stopColor="#FF6B35" /></linearGradient>
          <radialGradient id={id + 'h'}><stop offset="0" stopColor="#FF9F1C" stopOpacity=".28" /><stop offset="1" stopColor="#FF9F1C" stopOpacity="0" /></radialGradient>
        </defs>
        <circle className="anel-halo" cx="100" cy="100" r="98" fill={`url(#${id}h)`} />
        {ticks}
        <circle cx="100" cy="100" r="84" className="anel-fino" strokeDasharray="2 5" />
        <circle cx="100" cy="100" r={R} className="anel-trilho" />
        <circle cx="100" cy="100" r={R} className="anel-arco" stroke={`url(#${id})`} strokeDasharray={C} strokeDashoffset={desenha ? C * (1 - pct) : C} transform="rotate(-90 100 100)" />
        <circle cx="100" cy="100" r="56" className="anel-viol" />
        <circle cx="100" cy="100" r="50" className="anel-fino" />
      </svg>
      <figcaption>
        <b><Contador valor={texto} dur={900} /></b>
        <span>{rotulo}</span>
        {sub && <em>{sub}</em>}
      </figcaption>
    </figure>
  );
}

/** Orbe violeta com ícone: módulos, atalhos e avisos. */
export function Orbe({ n, tam = 44 }: { n: string; tam?: number }) {
  return <span className="orbe" style={{ width: tam, height: tam }} aria-hidden="true"><Icone n={n} tam={Math.round(tam * 0.46)} /></span>;
}

/** Carregando: blocos com brilho deslizante no lugar do conteúdo. */
export function Esqueleto({ tipo = 'linhas', n = 4 }: { tipo?: 'linhas' | 'cartoes' | 'kpis'; n?: number }) {
  if (tipo === 'kpis') return <div className="kpis esq-kpis">{Array.from({ length: n }, (_, i) => <div className="esq esq-kpi" key={i} />)}</div>;
  if (tipo === 'cartoes') return <div className="esq-cartoes">{Array.from({ length: n }, (_, i) => <div className="esq esq-cartao" key={i} />)}</div>;
  return <div className="esq-linhas">{Array.from({ length: n }, (_, i) => <div className="esq esq-linha" style={{ width: `${92 - (i % 3) * 14}%` }} key={i} />)}</div>;
}
export function Carregando({ tipo = 'linhas', n, texto = 'Carregando…' }: { tipo?: 'linhas' | 'cartoes' | 'kpis'; n?: number; texto?: string }) {
  return <div role="status" aria-busy="true" className="carregando-bloco"><span className="sr">{texto}</span><Esqueleto tipo={tipo} n={n ?? (tipo === 'linhas' ? 4 : 3)} /></div>;
}

/** Estado vazio: ilustração leve, o que significa e o próximo passo. */
export function Vazio({ titulo, texto, acao, icone = 'vazio' }: { titulo: string; texto?: string; acao?: { rotulo: string; to?: string; onClick?: () => void }; icone?: string }) {
  return (
    <div className="vazio" role="status">
      <span className="vazio-orbe" aria-hidden="true"><Icone n={icone} tam={30} /></span>
      <b>{titulo}</b>
      {texto && <p className="mudo">{texto}</p>}
      {acao && (acao.to ? <Link className="primario btn" to={acao.to}>{acao.rotulo}</Link> : <button className="primario" onClick={acao.onClick}>{acao.rotulo}</button>)}
    </div>
  );
}

/** Mensagem de erro humana, com o que fazer em seguida. */
export function Erro({ children, aoTentar }: { children: ReactNode; aoTentar?: () => void }) {
  return (
    <div className="erro-bloco" role="alert"><Icone n="alerta" /><div>{children}</div>{aoTentar && <button onClick={aoTentar}>Tentar de novo</button>}</div>
  );
}
