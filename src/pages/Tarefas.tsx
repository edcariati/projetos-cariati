import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';
import { SETOR, fmtData } from '../lib/labels';
import { usePerfil } from '../lib/perfil';
import { GrupoTarefas, carregarTarefas } from '../lib/tarefas';
import Checklist from '../components/Checklist';

/** Fluxo de trabalho do profissional: as tarefas dos protocolos, já provisionadas e atribuídas a ele. */
export default function Tarefas() {
  const eu = usePerfil();
  const admin = eu.perfil === 'admin';
  const [pessoas, setPessoas] = useState<Profile[]>([]);
  const [alvoId, setAlvoId] = useState(eu.id);
  const [grupos, setGrupos] = useState<GrupoTarefas[] | null>(null);

  useEffect(() => {
    supabase.from('profiles').select('*').neq('perfil', 'cliente').eq('ativo', true).order('nome')
      .then(({ data }) => setPessoas((data as Profile[]) ?? []));
  }, []);
  const alvo = pessoas.find((p) => p.id === alvoId) ?? (alvoId === eu.id ? eu : null);

  const carregar = useCallback(async () => { if (alvo) setGrupos(await carregarTarefas(alvo)); }, [alvo]);
  useEffect(() => { carregar(); }, [carregar]);

  const nomes = new Map(pessoas.map((p) => [p.id, p.nome]));
  const agora = grupos?.filter((g) => g.status === 'em_andamento') ?? [];
  const atrasadas = grupos?.filter((g) => g.status === 'concluida') ?? [];
  const aSeguir = grupos?.filter((g) => g.status === 'pendente') ?? [];
  const itensAgora = agora.reduce((s, g) => s + g.pendentes, 0);
  const fila = alvo && (alvo.setor === 'administrativo' || alvo.setor === 'comercial');

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
      <div className="titulo"><h1>{alvoId === eu.id ? 'Minhas tarefas' : `Tarefas de ${alvo?.nome ?? ''}`}</h1></div>
      <p className="mudo">
        As tarefas dos protocolos nascem sozinhas quando o projeto é aberto e já chegam atribuídas: o responsável pelo projeto, o profissional da especialidade na equipe ou a fila do setor
        {fila ? ` (${SETOR[alvo!.setor]}). Use “Assumir” para pegar uma tarefa da fila.` : '.'}
      </p>
      {admin && (
        <div className="filtros">
          <select id="tarefas-pessoa" value={alvoId} onChange={(e) => { setGrupos(null); setAlvoId(e.target.value); }}>
            {pessoas.map((p) => <option key={p.id} value={p.id}>{p.id === eu.id ? `${p.nome} (eu)` : p.nome}</option>)}
          </select>
        </div>
      )}

      <div className="kpis">
        <div className="kpi"><b>{itensAgora}</b><span>itens a fazer agora</span></div>
        <div className="kpi"><b>{agora.length}</b><span>etapas em andamento</span></div>
        <div className="kpi"><b className={atrasadas.length ? 'alerta' : ''}>{atrasadas.length}</b><span>pendências em etapas concluídas</span></div>
        <div className="kpi"><b>{aSeguir.length}</b><span>etapas a seguir</span></div>
      </div>

      {grupos === null && <p className="mudo">Carregando…</p>}
      {grupos && grupos.length === 0 && <section className="card"><p className="mudo">Nenhuma tarefa para {alvoId === eu.id ? 'você' : alvo?.nome} no momento.</p></section>}

      {agora.length > 0 && <><h2>Agora</h2>{agora.map((g) => <Grupo key={g.projeto.id + g.etapa.codigo} g={g} aberto />)}</>}
      {atrasadas.length > 0 && <><h2>Pendências em etapas já concluídas</h2>{atrasadas.map((g) => <Grupo key={g.projeto.id + g.etapa.codigo} g={g} aberto />)}</>}
      {aSeguir.length > 0 && <>
        <h2>A seguir</h2>
        <p className="mudo pequeno">Já provisionadas; liberam quando a etapa começar.{grupos && ` Mais antiga: ${fmtData(aSeguir[0].projeto.created_at)}.`}</p>
        {aSeguir.map((g) => <Grupo key={g.projeto.id + g.etapa.codigo} g={g} aberto={false} />)}
      </>}
    </>
  );
}
