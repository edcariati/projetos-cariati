import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { carregarBruto } from '../lib/carga';
import type { Bruto } from '../lib/kpis';
import { PRESETS, VISOES, Visao, calcularHoras, evolucaoProjeto, intervalo } from '../lib/gestaohoras';
import { baixarCsv } from '../lib/banco';
import { fmtData } from '../lib/labels';
import { usePerfil } from '../lib/perfil';
import AbasHoras from '../components/AbasHoras';
import { BarrasH, Cartao, Colunas, Legenda, Linhas, Medidor, SERIE, fmtN } from '../components/graficos';

const nivel = (pct: number | null) => (pct === null ? 'ok' : pct > 200 ? 'critica' : pct > 150 ? 'grave' : pct > 100 ? 'atrasada' : 'ok');
const COR: Record<string, string> = { ok: 'var(--s1)', atrasada: 'var(--st-warning)', grave: 'var(--st-serious)', critica: 'var(--st-critical)' };
const ICO: Record<string, string> = { ok: '', atrasada: '▲', grave: '▲▲', critica: '⬣' };
const TXT: Record<string, string> = { ok: 'var(--ink)', atrasada: 'var(--amber)', grave: 'var(--ruim)', critica: 'var(--ruim)' };
const h = (n: number) => `${fmtN(n, 1)} h`;

/** Gestão de horas: previsto × realizado por projeto, profissional ou etapa, com evolução no período. */
export default function GestaoHoras() {
  const eu = usePerfil();
  const admin = eu.perfil === 'admin';
  const nav = useNavigate();
  const [bruto, setBruto] = useState<Bruto | null>(null);
  const [erro, setErro] = useState('');
  const [visao, setVisao] = useState<Visao>('projeto');
  const [preset, setPreset] = useState('90d');
  const [datas, setDatas] = useState<{ ini: string; fim: string } | null>(null);
  const [somenteAtivos, setSomenteAtivos] = useState(true);
  const [projetoId, setProjetoId] = useState('');

  const carregar = useCallback(async () => {
    try { setBruto(await carregarBruto()); setErro(''); } catch (e) { setErro((e as Error).message); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const primeiro = useMemo(() => bruto?.tempos[0]?.iniciado_em ?? null, [bruto]);
  const { ini, fim } = preset === 'custom' && datas ? datas : intervalo(preset, primeiro);
  const r = useMemo(() => (bruto ? calcularHoras(bruto, visao, ini, fim, { somenteAtivos, projetoId: visao === 'etapa' ? '' : projetoId }) : null), [bruto, visao, ini, fim, somenteAtivos, projetoId]);
  const evo = useMemo(() => (bruto && projetoId && visao === 'projeto' ? evolucaoProjeto(bruto, projetoId) : null), [bruto, projetoId, visao]);

  if (erro) return <div className="card"><p className="erro">{erro}</p><button onClick={carregar}>Tentar de novo</button></div>;
  if (!bruto || !r) return <><AbasHoras /><p className="mudo">Carregando horas…</p></>;

  const projetosComHoras = bruto.projetos.filter((p) => bruto.tempos.some((t) => t.projeto_id === p.id));
  const nv = nivel(r.pct);
  const top = r.linhas.slice(0, 12);
  const gran = r.gran === 'semana' ? 'Semana' : 'Mês';
  const salvarPadrao = async (codigo: string, valor: string) => {
    const n = Number(valor.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) return;
    await supabase.from('etapa_modelos').update({ horas_padrao: n }).eq('codigo', codigo);
    carregar();
  };
  const exportar = () => baixarCsv(`gestao-horas-${visao}-${ini}-${fim}.csv`, [
    ['Nome', r.rotuloEstimada, r.rotuloRealizada, 'Restantes', 'Percentual', 'No período'],
    ...r.linhas.map((l) => [l.nome, l.estimadas.toFixed(1), l.realizadas.toFixed(1), l.restantes.toFixed(1), l.pct === null ? '' : l.pct.toFixed(0) + '%', l.noPeriodo.toFixed(1)]),
  ]);

  return (
    <div className="viz">
      <AbasHoras />
      <div className="titulo"><h1>Gestão de horas</h1><button onClick={exportar}>Exportar CSV</button></div>

      <div className="viz-filtros" role="group" aria-label="Filtros">
        <label>Visualizar por
          <select id="horas-visao" value={visao} onChange={(e) => { setVisao(e.target.value as Visao); setProjetoId(''); }}>
            {VISOES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Período
          <select id="horas-periodo" value={preset} onChange={(e) => { setPreset(e.target.value); if (e.target.value === 'custom') setDatas({ ini, fim }); }}>
            {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.rotulo}</option>)}
          </select>
        </label>
        {preset === 'custom' && (<>
          <label>Inicial<input type="date" value={ini} max={fim} onChange={(e) => setDatas({ ini: e.target.value, fim })} /></label>
          <label>Final<input type="date" value={fim} min={ini} onChange={(e) => setDatas({ ini, fim: e.target.value })} /></label>
        </>)}
        {visao !== 'etapa' && (
          <label>Projeto
            <select id="horas-projeto" value={projetoId} onChange={(e) => setProjetoId(e.target.value)}>
              <option value="">Todos os projetos</option>
              {projetosComHoras.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </label>
        )}
        {visao === 'projeto' && <label className="check"><input type="checkbox" checked={somenteAtivos} onChange={(e) => setSomenteAtivos(e.target.checked)} />Só em andamento</label>}
      </div>
      <p className="mudo pequeno" style={{ marginTop: -4 }}>{fmtData(ini)} a {fmtData(fim)}</p>

      <div className="viz-tiles">
        <div className="viz-tile"><span className="viz-tile-r">{r.rotuloEstimada === 'Estimadas' ? 'Horas estimadas' : r.rotuloEstimada}</span><div className="viz-tile-v"><b>{h(r.estimadas)}</b></div></div>
        <div className="viz-tile"><span className="viz-tile-r">{r.rotuloRealizada === 'Realizadas' ? 'Horas realizadas' : r.rotuloRealizada}</span><div className="viz-tile-v"><b>{h(r.realizadas)}</b></div></div>
        <div className="viz-tile"><span className="viz-tile-r">Horas restantes</span><div className="viz-tile-v"><b style={{ color: r.restantes < 0 ? 'var(--ruim)' : undefined }}>{h(r.restantes)}</b></div>
          <span className="viz-tile-s">{r.restantes < 0 ? '▲ acima do previsto' : 'dentro do previsto'}</span></div>
        <div className="viz-tile"><span className="viz-tile-r">Percentual realizado</span><div className="viz-tile-v"><b style={{ color: TXT[nv] }}>{r.pct === null ? '—' : `${fmtN(r.pct, 0)}%`}</b></div>
          <span className="viz-tile-s">{nv === 'ok' ? '✓ dentro da estimativa' : `${ICO[nv]} passou de 100%`}</span></div>
      </div>

      <div className="viz-grid">
        <Cartao titulo={`Realizadas × ${r.rotuloEstimada.toLowerCase()}`} sub={`${VISOES.find(([k]) => k === visao)![1]}: ${top.length} de ${r.linhas.length}, do maior percentual ao menor; a marca preta é a referência`} nota={r.nota}
          tabela={{ cab: ['Nome', r.rotuloEstimada, r.rotuloRealizada, 'Percentual'], linhas: r.linhas.map((l) => [l.nome, fmtN(l.estimadas, 1), fmtN(l.realizadas, 1), l.pct === null ? '—' : `${fmtN(l.pct, 0)}%`]) }}>
          {top.length === 0 ? <p className="mudo">Sem horas no período.</p> : (
            <BarrasH unidade=" h" refNome={r.rotuloEstimada} onAbrir={(l) => l.href && nav(l.href)}
              linhas={top.map((l) => { const n = nivel(l.pct); return { rotulo: l.nome, sub: l.sub, valor: l.realizadas, ref: l.estimadas, cor: COR[n], ico: ICO[n] || undefined, texto: `${fmtN(l.realizadas, 0)} h${l.pct === null ? '' : ` · ${fmtN(l.pct, 0)}%`}`, href: l.href }; })} />
          )}
        </Cartao>

        {evo ? (
          <Cartao titulo="Evolução do projeto" sub={`${bruto.projetos.find((p) => p.id === projetoId)?.nome}: horas acumuladas × estimativa`} nota="Quando a linha de horas cruza a da estimativa, o projeto passou do previsto."
            tabela={{ cab: [gran, 'Acumulado', 'Estimado'], linhas: evo.rotulos.map((x, i) => [x, fmtN(evo.acumulado[i], 1), fmtN(evo.estimado[i], 1)]) }}>
            <Legenda itens={[{ rotulo: 'Horas acumuladas', cor: SERIE[0], tipo: 'linha' }, { rotulo: 'Estimativa', cor: SERIE[1], tipo: 'linha' }]} />
            <Linhas unidade=" h" rotulos={evo.rotulos} series={[{ nome: 'Horas acumuladas', valores: evo.acumulado, cor: SERIE[0] }, { nome: 'Estimativa', valores: evo.estimado, cor: SERIE[1] }]} />
          </Cartao>
        ) : (
          <Cartao titulo="Evolução das horas" sub={`Por ${r.gran === 'semana' ? 'semana' : 'mês'}${r.serieMeta ? ', com a meta de horas' : ''}`}
            tabela={{ cab: [gran, 'Horas', ...(r.serieMeta ? ['Meta'] : [])], linhas: r.baldes.map((b, i) => [b.rotulo, fmtN(r.serieHoras[i], 1), ...(r.serieMeta ? [fmtN(r.serieMeta[i], 1)] : [])]) }}
            nota={visao === 'projeto' ? 'Escolha um projeto no filtro para ver as horas acumuladas contra a estimativa dele.' : undefined}>
            {r.serieMeta && <Legenda itens={[{ rotulo: 'Horas realizadas', cor: SERIE[0] }, { rotulo: 'Meta de horas', cor: 'var(--ink2)', tipo: 'linha' }]} />}
            <Colunas unidade=" h" rotulos={r.baldes.map((b) => b.rotulo)} series={[{ nome: 'Horas realizadas', valores: r.serieHoras, cor: SERIE[0] }]} linha={r.serieMeta ? { nome: 'Meta de horas', valores: r.serieMeta } : undefined} />
          </Cartao>
        )}

        <section className="card viz-card largo">
          <header className="viz-cab"><div><h2>Detalhamento</h2><p className="mudo pequeno">{r.linhas.length} linha{r.linhas.length === 1 ? '' : 's'}</p></div></header>
          <div className="viz-tab"><table>
            <thead><tr><th>{VISOES.find(([k]) => k === visao)![1]}</th><th>{r.rotuloEstimada}</th><th>{r.rotuloRealizada}</th><th>Restantes</th><th>Percentual</th>{visao === 'projeto' && <th>No período</th>}</tr></thead>
            <tbody>
              {r.linhas.map((l) => { const n = nivel(l.pct); return (
                <tr key={l.id}>
                  <td>{l.href ? <Link to={l.href}>{l.nome}</Link> : l.nome}{l.sub && <span className="mudo pequeno"> · {l.sub}</span>}{l.origem === 'manual' && <span className="etiqueta" style={{ marginLeft: 6 }}>estimativa manual</span>}</td>
                  <td>{visao === 'etapa' && admin
                    ? <input className="num-edit" type="number" min={0} step={0.5} defaultValue={l.estimadas} aria-label={`Horas padrão da etapa ${l.nome}`} onBlur={(e) => e.target.value !== String(l.estimadas) && salvarPadrao(l.id, e.target.value)} />
                    : fmtN(l.estimadas, 1)}</td>
                  <td>{fmtN(l.realizadas, 1)}</td>
                  <td style={{ color: l.restantes < 0 ? 'var(--ruim)' : undefined }}>{l.restantes < 0 ? '▲ ' : ''}{fmtN(l.restantes, 1)}</td>
                  <td><span className="viz-pct"><Medidor valor={Math.min(l.pct ?? 0, 100)} max={100} aviso={0.85} perigo={1} rotulo="Percentual" /><em style={{ color: TXT[n] }}>{ICO[n] ? `${ICO[n]} ` : ''}{l.pct === null ? '—' : `${fmtN(l.pct, 0)}%`}</em></span></td>
                  {visao === 'projeto' && <td>{fmtN(l.noPeriodo, 1)}</td>}
                </tr>
              ); })}
            </tbody>
          </table></div>
        </section>
      </div>
    </div>
  );
}
