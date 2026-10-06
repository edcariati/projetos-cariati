import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { EtapaModelo, ProjetoStatus } from '../lib/types';
import { FASES, PROJETO_STATUS, TIPO_ESTUDO, fmtData } from '../lib/labels';
import { usePerfil } from '../lib/perfil';
import { Atraso, ProjetoK, etapasAbertas, refEtapas } from '../lib/kpis';
import { STATUS_ICONE, STATUS_ROTULO } from '../components/graficos';
import { Carregando, Vazio } from '../ui/Holo';

type Vista = 'cartoes' | 'quadro' | 'lista';
const VISTAS: [Vista, string][] = [['cartoes', 'Cartões'], ['quadro', 'Quadro'], ['lista', 'Lista']];
const iniciais = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
const lerVista = (): Vista => { try { return (localStorage.getItem('vista-projetos') as Vista) || 'cartoes'; } catch { return 'cartoes'; } };

function etiquetas(p: ProjetoK): string[] {
  return [TIPO_ESTUDO[p.tipo_estudo], ...(p.tem_legal ? ['Legal'] : []), ...(p.tem_interiores ? ['Interiores'] : []),
    ...(p.tem_complementares ? ['Complementares'] : []), ...(p.tem_habitese ? ['Habite-se'] : [])];
}
const OPCOES_ETIQUETA = ['Estudo padrão', 'Ampliação', '+ Projetos', 'Legal', 'Interiores', 'Complementares', 'Habite-se'];

function Avatares({ nomes }: { nomes: string[] }) {
  if (!nomes.length) return <span className="mudo">—</span>;
  return (
    <span className="avatares" title={nomes.join(', ')}>
      {nomes.slice(0, 3).map((n) => <i key={n} className="avatar" aria-label={n}>{iniciais(n)}</i>)}
      {nomes.length > 3 && <i className="avatar mais">+{nomes.length - 3}</i>}
    </span>
  );
}

export default function Projetos() {
  const [projetos, setProjetos] = useState<ProjetoK[]>([]);
  const [modelos, setModelos] = useState<EtapaModelo[]>([]);
  const [equipe, setEquipe] = useState<{ projeto_id: string; profiles: { nome: string } | null }[]>([]);
  const [filtro, setFiltro] = useState<ProjetoStatus | 'todos'>('ativo');
  const [busca, setBusca] = useState('');
  const [etiqueta, setEtiqueta] = useState('');
  const [soAtrasados, setSoAtrasados] = useState(false);
  const [vista, setVistaState] = useState<Vista>(lerVista);
  const eu = usePerfil();
  const [params, setParams] = useSearchParams();
  const resp = params.get('resp') ?? '';
  const setVista = (v: Vista) => { setVistaState(v); try { localStorage.setItem('vista-projetos', v); } catch { /* sem armazenamento */ } };

  useEffect(() => {
    supabase.from('projetos').select('*, clientes(nome,codigo), profiles(nome), projeto_etapas(etapa_codigo,status,iniciada_em,concluida_em,rodadas_ajuste)')
      .order('created_at', { ascending: false }).then(({ data }) => setProjetos((data as ProjetoK[]) ?? []));
    supabase.from('etapa_modelos').select('*').order('ordem').then(({ data }) => setModelos((data as EtapaModelo[]) ?? []));
    supabase.from('projeto_equipe').select('projeto_id, profiles(nome)').then(({ data }) => setEquipe((data as unknown as typeof equipe) ?? []));
  }, []);

  const ref = useMemo(() => refEtapas(projetos), [projetos]);
  const atraso = useMemo(() => {
    const m = new Map<string, Atraso>();
    for (const a of etapasAbertas(projetos, ref)) if (a.nivel !== 'ok' && !m.has(a.projeto.id)) m.set(a.projeto.id, a);
    return m;
  }, [projetos, ref]);

  const responsaveis = [...new Map(projetos.filter((p) => p.responsavel_id && p.profiles?.nome).map((p) => [p.responsavel_id!, p.profiles!.nome])).entries()];
  const lista = projetos.filter((p) =>
    (filtro === 'todos' || p.status === filtro) && (!resp || p.responsavel_id === resp) && (!etiqueta || etiquetas(p).includes(etiqueta)) && (!soAtrasados || atraso.has(p.id)) &&
    `${p.nome} ${p.clientes?.nome ?? ''} ${p.clientes?.codigo ?? ''}`.toLowerCase().includes(busca.toLowerCase()));

  const etapaAtual = (p: ProjetoK) => modelos.find((m) => m.codigo === [...p.projeto_etapas].filter((e) => e.status === 'em_andamento')
    .sort((a, b) => (modelos.find((x) => x.codigo === a.etapa_codigo)?.ordem ?? 0) - (modelos.find((x) => x.codigo === b.etapa_codigo)?.ordem ?? 0))[0]?.etapa_codigo);
  const pessoasDe = (p: ProjetoK) => [...new Set([p.profiles?.nome, ...equipe.filter((e) => e.projeto_id === p.id).map((e) => e.profiles?.nome)].filter(Boolean) as string[])];
  const Situacao = ({ p }: { p: ProjetoK }) => {
    const a = atraso.get(p.id);
    return a ? <span className={`situ ${a.nivel}`}>{STATUS_ICONE[a.nivel]} {STATUS_ROTULO[a.nivel]} · {Math.round(a.dias)} d</span> : p.status === 'ativo' ? <span className="situ ok">✓ No prazo</span> : <span className="mudo">—</span>;
  };

  const colunas = useMemo(() => {
    const base: { chave: string; titulo: string; cor: string; itens: ProjetoK[] }[] = [1, 2, 3, 4, 6].map((f, i) => ({
      chave: 'f' + f, titulo: `${f === 6 ? '' : f + '. '}${FASES[f]}`, cor: ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--ink3)'][i],
      itens: lista.filter((p) => p.status === 'ativo' && etapaAtual(p)?.fase === f),
    }));
    base.push({ chave: 'pausa', titulo: 'Pausados', cor: 'var(--amber)', itens: lista.filter((p) => p.status === 'pausado') });
    base.push({ chave: 'fim', titulo: 'Finalizados e encerrados', cor: 'var(--ink3)', itens: lista.filter((p) => p.status === 'finalizado' || p.status === 'rescindido' || (p.status === 'ativo' && !etapaAtual(p))) });
    return base.filter((c) => c.itens.length > 0 || ['f1', 'f2', 'f3', 'f4'].includes(c.chave));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista, modelos]);

  return (
    <>
      <div className="titulo"><h1>Projetos</h1><Link className="primario btn" to="/projetos/novo">+ Novo projeto</Link></div>
      <div className="filtros">
        <input placeholder="Buscar projeto, cliente ou código…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select id="filtro-status" value={filtro} onChange={(e) => setFiltro(e.target.value as ProjetoStatus | 'todos')}>
          <option value="todos">Todos</option>
          {Object.entries(PROJETO_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="filtros filtros-linha">
        <select id="filtro-etiqueta" value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} aria-label="Etiqueta">
          <option value="">Todas as etiquetas</option>
          {OPCOES_ETIQUETA.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        {eu.perfil === 'admin' && responsaveis.length > 0 && (
          <select id="filtro-responsavel" value={resp} onChange={(e) => setParams(e.target.value ? { resp: e.target.value } : {})}>
            <option value="">Todos os responsáveis</option>
            {responsaveis.map(([rid, nome]) => <option key={rid} value={rid}>{nome}</option>)}
          </select>
        )}
        <label className="check"><input type="checkbox" checked={soAtrasados} onChange={(e) => setSoAtrasados(e.target.checked)} />Só atrasados</label>
        <div className="seg vistas" role="radiogroup" aria-label="Visualização">
          {VISTAS.map(([k, v]) => <button key={k} role="radio" aria-checked={vista === k} className={vista === k ? 'on' : ''} onClick={() => setVista(k)}>{v}</button>)}
        </div>
      </div>
      <p className="mudo pequeno">{lista.length} projeto{lista.length === 1 ? '' : 's'}{atraso.size ? ` · ${[...atraso.keys()].filter((id) => lista.some((p) => p.id === id)).length} com etapa atrasada` : ''}</p>

      {vista === 'cartoes' && (
        <ul className="cards">
          {lista.map((p) => {
            const aplic = p.projeto_etapas.filter((e) => e.status !== 'nao_aplicavel' && modelos.find((m) => m.codigo === e.etapa_codigo)?.fase !== 5);
            const feitas = aplic.filter((e) => e.status === 'concluida').length;
            const atual = etapaAtual(p);
            const pct = aplic.length ? Math.round((feitas / aplic.length) * 100) : 0;
            return (
              <li key={p.id}><Link className="card item" to={`/projetos/${p.id}`}>
                <div><b>{p.nome}</b><span className={`tag ${p.status}`}>{PROJETO_STATUS[p.status]}</span></div>
                <div className="mudo">{p.clientes?.nome}{p.profiles?.nome ? ` · ${p.profiles.nome}` : ''}</div>
                <div className="barra"><i style={{ width: `${pct}%` }} /></div>
                <div className="mudo pequeno">{pct}% · {atual ? `Etapa ${atual.codigo} — ${atual.titulo}` : '—'}</div>
                {atraso.has(p.id) && <div className="pequeno"><Situacao p={p} /></div>}
              </Link></li>
            );
          })}
          {lista.length === 0 && <Vazio titulo="Nenhum projeto encontrado" texto="Limpe os filtros ou comece um projeto novo." icone="projetos" acao={{ rotulo: '+ Novo projeto', to: '/projetos/novo' }} />}
        </ul>
      )}

      {vista === 'quadro' && (
        <div className="quadro" role="list">
          {colunas.map((c) => (
            <section className="coluna" key={c.chave} role="listitem" aria-label={c.titulo}>
              <header><i style={{ background: c.cor }} /><b>{c.titulo}</b><span className="badge">{c.itens.length}</span></header>
              <div className="coluna-corpo">
                {c.itens.length === 0 && <p className="mudo pequeno">Nenhum projeto.</p>}
                {c.itens.map((p) => (
                  <Link key={p.id} className="cartao-quadro" to={`/projetos/${p.id}`}>
                    <b>{p.clientes?.codigo ? `${p.clientes.codigo} · ` : ''}{p.nome}</b>
                    <span className="mudo pequeno">{p.clientes?.nome}</span>
                    <span className="etiquetas">{etiquetas(p).map((e) => <span className="etiqueta" key={e}>{e}</span>)}</span>
                    {etapaAtual(p) && <span className="pequeno" style={{ color: 'var(--blue)' }}>Etapa {etapaAtual(p)!.codigo} · {etapaAtual(p)!.rotulo}</span>}
                    <span className="rodape-cartao"><span className="mudo pequeno">{fmtData(p.created_at)}</span><Situacao p={p} /><Avatares nomes={pessoasDe(p)} /></span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {vista === 'lista' && (
        <div className="viz-tab card"><table className="tab-projetos">
          <thead><tr><th>Projeto</th><th>Cliente</th><th>Etapa atual</th><th>Etiquetas</th><th>Criado em</th><th>Situação</th><th>Responsáveis</th></tr></thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id}>
                <td><Link to={`/projetos/${p.id}`}><b>{p.nome}</b></Link><div className="mudo pequeno">{p.clientes?.codigo}</div></td>
                <td>{p.clientes?.nome}</td>
                <td>{p.status !== 'ativo' ? <span className={`tag ${p.status}`}>{PROJETO_STATUS[p.status]}</span> : etapaAtual(p) ? `${etapaAtual(p)!.codigo} · ${etapaAtual(p)!.rotulo}` : '—'}</td>
                <td><span className="etiquetas">{etiquetas(p).map((e) => <span className="etiqueta" key={e}>{e}</span>)}</span></td>
                <td>{fmtData(p.created_at)}</td>
                <td><Situacao p={p} /></td>
                <td><Avatares nomes={pessoasDe(p)} /></td>
              </tr>
            ))}
          </tbody>
        </table>{lista.length === 0 && <Vazio titulo="Nenhum projeto encontrado" texto="Limpe os filtros ou comece um projeto novo." icone="projetos" acao={{ rotulo: '+ Novo projeto', to: '/projetos/novo' }} />}</div>
      )}
    </>
  );
}
