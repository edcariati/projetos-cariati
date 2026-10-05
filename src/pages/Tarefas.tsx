import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';
import { SETOR, fmtData } from '../lib/labels';
import { usePerfil } from '../lib/perfil';
import { GrupoTarefas, carregarTarefas } from '../lib/tarefas';
import Checklist from '../components/Checklist';
import { REF_PADRAO } from '../lib/kpis';
import { Medidor } from '../components/graficos';

type Vista = 'checklists' | 'lista' | 'quadro';
const VISTAS: [Vista, string][] = [['checklists', 'Checklists'], ['lista', 'Lista'], ['quadro', 'Quadro']];

/** Fluxo de trabalho do profissional: as tarefas dos protocolos, já provisionadas e atribuídas a ele. */
export default function Tarefas() {
  const eu = usePerfil();
  const admin = eu.perfil === 'admin';
  const [pessoas, setPessoas] = useState<Profile[]>([]);
  const [alvoId, setAlvoId] = useState(eu.id);
  const [grupos, setGrupos] = useState<GrupoTarefas[] | null>(null);
  const [vista, setVista] = useState<Vista>('checklists');
  const [mostrarTudo, setMostrarTudo] = useState<Record<string, boolean>>({});
  const todas = alvoId === 'todas';

  useEffect(() => {
    supabase.from('profiles').select('*').neq('perfil', 'cliente').eq('ativo', true).order('nome')
      .then(({ data }) => setPessoas((data as Profile[]) ?? []));
  }, []);
  const alvo = pessoas.find((p) => p.id === alvoId) ?? (alvoId === eu.id ? eu : null);

  const carregar = useCallback(async () => { if (todas) setGrupos(await carregarTarefas('todas')); else if (alvo) setGrupos(await carregarTarefas(alvo)); }, [alvo, todas]);
  useEffect(() => { carregar(); }, [carregar]);

  const nomes = new Map(pessoas.map((p) => [p.id, p.nome]));
  const agora = grupos?.filter((g) => g.status === 'em_andamento') ?? [];
  const atrasadas = grupos?.filter((g) => g.status === 'concluida') ?? [];
  const aSeguir = grupos?.filter((g) => g.status === 'pendente') ?? [];
  const itensAgora = agora.reduce((s, g) => s + g.pendentes, 0);
  const fila = alvo && !todas && (alvo.setor === 'administrativo' || alvo.setor === 'comercial');
  const atrasada = (g: GrupoTarefas) => g.diasNaEtapa !== null && g.diasNaEtapa > (REF_PADRAO[g.etapa.codigo] ?? 7);
  const quem = (g: GrupoTarefas) => [...new Set(g.tarefas.map((t) => (t.responsavel_id ? nomes.get(t.responsavel_id) ?? '—' : `Fila ${SETOR[t.setor_fila ?? 'administrativo']}`)))].join(', ');
  const total = (g: GrupoTarefas) => g.itens.length;
  const Situacao = ({ g }: { g: GrupoTarefas }) => (
    g.status === 'concluida' ? <span className="situ atrasada">▲ Pendência em etapa concluída</span>
      : g.status === 'pendente' ? <span className="mudo">A seguir</span>
      : atrasada(g) ? <span className="situ grave">▲ Atrasada · {Math.round(g.diasNaEtapa!)} d</span> : <span className="situ ok">✓ Em andamento</span>
  );

  const Grupo = ({ g, aberto }: { g: GrupoTarefas; aberto: boolean }) => (
    <section className="card tarefa-grupo" key={g.projeto.id + g.etapa.codigo}>
      <div className="grupo-h">
        <h3><Link to={`/projetos/${g.projeto.id}`}>{g.projeto.nome}</Link></h3>
        <span className="mudo pequeno">{g.projeto.clientes?.nome} · etapa {g.etapa.codigo} · {g.etapa.titulo}</span>
      </div>
      <Checklist etapa={g.etapa.codigo} tarefas={g.tarefas} itens={g.itens} nomes={nomes} editavel
        meuId={eu.id} podeAtribuir={admin} pessoas={pessoas} onChange={carregar} aberto={aberto} titulo={`${g.pendentes} item(ns) a fazer`} />
    </section>
  );

  return (
    <>
      <div className="titulo"><h1>{todas ? 'Todas as tarefas' : alvoId === eu.id ? 'Minhas tarefas' : `Tarefas de ${alvo?.nome ?? ''}`}</h1></div>
      <p className="mudo">
        As tarefas dos protocolos nascem sozinhas quando o projeto é aberto e já chegam atribuídas: o responsável pelo projeto, o profissional da especialidade na equipe ou a fila do setor
        {fila ? ` (${SETOR[alvo!.setor]}). Use “Assumir” para pegar uma tarefa da fila.` : '.'}
      </p>
      <div className="filtros filtros-linha">
        {admin && (
          <select id="tarefas-pessoa" value={alvoId} onChange={(e) => { setGrupos(null); setAlvoId(e.target.value); }}>
            <option value="todas">Todas as pessoas</option>
            {pessoas.map((p) => <option key={p.id} value={p.id}>{p.id === eu.id ? `${p.nome} (eu)` : p.nome}</option>)}
          </select>
        )}
        <div className="seg vistas" role="radiogroup" aria-label="Visualização">
          {VISTAS.map(([k, v]) => <button key={k} role="radio" aria-checked={vista === k} className={vista === k ? 'on' : ''} onClick={() => setVista(k)}>{v}</button>)}
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><b>{itensAgora}</b><span>itens a fazer agora</span></div>
        <div className="kpi"><b>{agora.length}</b><span>etapas em andamento</span></div>
        <div className="kpi"><b className={atrasadas.length ? 'alerta' : ''}>{atrasadas.length}</b><span>pendências em etapas concluídas</span></div>
        <div className="kpi"><b>{aSeguir.length}</b><span>etapas a seguir</span></div>
      </div>

      {grupos === null && <p className="mudo">Carregando…</p>}
      {grupos && grupos.length === 0 && <section className="card"><p className="mudo">Nenhuma tarefa para {todas ? 'os projetos visíveis' : alvoId === eu.id ? 'você' : alvo?.nome} no momento.</p></section>}

      {vista === 'lista' && grupos && grupos.length > 0 && (
        <div className="viz-tab card"><table className="tab-projetos">
          <thead><tr><th>Projeto</th><th>Etapa</th><th>Situação</th><th>Responsáveis</th><th>Itens</th></tr></thead>
          <tbody>
            {grupos.map((g) => (
              <tr key={g.projeto.id + g.etapa.codigo}>
                <td><Link to={`/projetos/${g.projeto.id}`}><b>{g.projeto.nome}</b></Link><div className="mudo pequeno">{g.projeto.clientes?.nome}</div></td>
                <td>{g.etapa.codigo} · {g.etapa.rotulo}</td>
                <td><Situacao g={g} /></td>
                <td>{quem(g)}</td>
                <td><span className="viz-pct"><Medidor valor={total(g) - g.pendentes} max={Math.max(1, total(g))} aviso={2} perigo={2} rotulo="Itens feitos" /><em>{total(g) - g.pendentes}/{total(g)}</em></span></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}

      {vista === 'quadro' && grupos && grupos.length > 0 && (
        <div className="quadro">
          {([['A seguir', aSeguir, 'var(--ink3)'], ['Agora', agora, 'var(--s1)'], ['Pendências em etapas concluídas', atrasadas, 'var(--amber)']] as [string, GrupoTarefas[], string][]).map(([titulo, itens, cor]) => (
            <section className="coluna" key={titulo}>
              <header><i style={{ background: cor }} /><b>{titulo}</b><span className="badge">{itens.length}</span></header>
              <div className="coluna-corpo">
                {itens.length === 0 && <p className="mudo pequeno">Nada aqui.</p>}
 {(mostrarTudo[titulo] ? itens : itens.slice(0, 10)).map((g) => (
                  <Link key={g.projeto.id + g.etapa.codigo} className="cartao-quadro" to={`/projetos/${g.projeto.id}`}>
                    <b>{g.projeto.nome}</b>
                    <span className="mudo pequeno">{g.etapa.codigo} · {g.etapa.titulo}</span>
                    <span className="pequeno">{g.pendentes} de {total(g)} item(ns) a fazer</span>
                    <span className="rodape-cartao"><span className="mudo pequeno">{quem(g)}</span><Situacao g={g} /></span>
                  </Link>
                ))}
                {itens.length > 10 && <button onClick={() => setMostrarTudo({ ...mostrarTudo, [titulo]: !mostrarTudo[titulo] })}>{mostrarTudo[titulo] ? 'Mostrar menos' : `Mostrar mais (${itens.length - 10})`}</button>}
              </div>
            </section>
          ))}
        </div>
      )}

      {vista === 'checklists' && agora.length > 0 && <><h2>Agora</h2>{agora.map((g) => <Grupo key={g.projeto.id + g.etapa.codigo} g={g} aberto />)}</>}
      {vista === 'checklists' && atrasadas.length > 0 && <><h2>Pendências em etapas já concluídas</h2>{atrasadas.map((g) => <Grupo key={g.projeto.id + g.etapa.codigo} g={g} aberto />)}</>}
      {vista === 'checklists' && aSeguir.length > 0 && <>
        <h2>A seguir</h2>
        <p className="mudo pequeno">Já provisionadas; liberam quando a etapa começar.{grupos && ` Mais antiga: ${fmtData(aSeguir[0].projeto.created_at)}.`}</p>
        {aSeguir.map((g) => <Grupo key={g.projeto.id + g.etapa.codigo} g={g} aberto={false} />)}
      </>}
    </>
  );
}
