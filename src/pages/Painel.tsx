import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { EtapaModelo, Projeto, Protocolo } from '../lib/types';
import { FASES, diasAte, fmtData, statusProtocolo } from '../lib/labels';
import { MAX_DIAS_PAUSA, diasDePausa } from '../lib/flow';
import { usePerfil } from '../lib/perfil';
import { GrupoTarefas, carregarTarefas } from '../lib/tarefas';
import { Carregando, Contador, Orbe, Vazio } from '../ui/Holo';

export default function Painel() {
  const eu = usePerfil();
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [modelos, setModelos] = useState<EtapaModelo[]>([]);
  const [protocolos, setProtocolos] = useState<Protocolo[]>([]);
  const [minhas, setMinhas] = useState<GrupoTarefas[]>([]);
  const [recentes, setRecentes] = useState<{ id: string; texto: string | null; tipo: string; created_at: string; projeto_id: string; projetos?: { nome: string } | null; profiles?: { nome: string } | null }[] | null>(null);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => { carregarTarefas(eu).then(setMinhas).catch(() => setMinhas([])); }, [eu]);

  useEffect(() => {
    supabase.from('projetos').select('*, clientes(nome,codigo), profiles(nome), projeto_etapas(etapa_codigo,status)')
      .in('status', ['ativo', 'pausado']).order('created_at', { ascending: false })
      .then(({ data }) => { setProjetos((data as Projeto[]) ?? []); setCarregado(true); });
    supabase.from('historico').select('id,texto,tipo,created_at,projeto_id,projetos(nome),profiles(nome)').order('created_at', { ascending: false }).limit(6)
      .then(({ data }) => setRecentes((data as unknown as NonNullable<typeof recentes>) ?? []));
    supabase.from('etapa_modelos').select('*').order('ordem').then(({ data }) => setModelos((data as EtapaModelo[]) ?? []));
    supabase.from('protocolos').select('*, projetos(nome, clientes(nome))')
      .not('status', 'in', '(entregue_ao_cliente)').order('prazo', { ascending: true, nullsFirst: false })
      .then(({ data }) => setProtocolos((data as Protocolo[]) ?? []));
  }, []);

  const etapaAtual = (p: Projeto) => {
    const cod = p.projeto_etapas?.find((e) => e.status === 'em_andamento')?.etapa_codigo;
    return modelos.find((m) => m.codigo === cod);
  };
  const ativos = projetos.filter((p) => p.status === 'ativo');
  const pausados = projetos.filter((p) => p.status === 'pausado');
  const porFase = [1, 2, 3, 4, 6].map((f) => ({ fase: f, itens: ativos.filter((p) => etapaAtual(p)?.fase === f) }));
  const porPessoa = [...new Set(projetos.map((p) => p.responsavel_id).filter(Boolean) as string[])].map((rid) => {
    const meus = projetos.filter((p) => p.responsavel_id === rid);
    return {
      id: rid, nome: meus[0].profiles?.nome ?? '—', ativos: meus.filter((p) => p.status === 'ativo').length,
      pausados: meus.filter((p) => p.status === 'pausado').length,
      etapas: meus.filter((p) => p.status === 'ativo').map((p) => `${p.nome}: ${etapaAtual(p)?.codigo ?? '—'} ${etapaAtual(p)?.rotulo ?? ''}`.trim()),
    };
  }).sort((a, b) => b.ativos - a.ativos);
  const atencao = protocolos.filter((p) => p.status === 'exigencia' || (diasAte(p.prazo) ?? 99) <= 3);
  const pausaCritica = pausados.filter((p) => diasDePausa(p.pausado_em) > MAX_DIAS_PAUSA - 30);

  return (
    <>
      <div className="titulo"><h1>{eu.perfil === 'admin' ? 'Painel geral' : 'Meu painel'}</h1><Link className="primario btn" to="/projetos/novo">+ Novo projeto</Link></div>
      {!carregado ? <Carregando tipo="kpis" n={4} /> : (
      <div className="kpis">
        <div className="kpi"><b><Contador valor={ativos.length} /></b><span>projetos ativos</span></div>
        <div className="kpi"><b><Contador valor={pausados.length} /></b><span>pausados</span></div>
        <div className="kpi"><b><Contador valor={protocolos.length} /></b><span>protocolos abertos</span></div>
        <div className="kpi"><b className={atencao.length ? 'alerta' : ''}><Contador valor={atencao.length} /></b><span>pedem atenção{atencao.length ? ' ▲' : ''}</span></div>
      </div>
      )}

      <div className="atalhos" aria-label="Atalhos">
        <Link className="atalho" to="/projetos/novo"><Orbe n="mais" tam={36} />Novo projeto</Link>
        <Link className="atalho" to="/tarefas"><Orbe n="tarefas" tam={36} />Minhas tarefas</Link>
        <Link className="atalho" to="/clientes/novo"><Orbe n="clientes" tam={36} />Novo cliente</Link>
        <Link className="atalho" to="/protocolos"><Orbe n="protocolos" tam={36} />Protocolos</Link>
      </div>

      {(() => {
        const agora = minhas.filter((g) => g.status === 'em_andamento');
        const itens = agora.reduce((s, g) => s + g.pendentes, 0);
        return (
          <section className="card">
            <h2>Minhas tarefas agora <span className="badge">{itens}</span></h2>
            {agora.length === 0 && <p className="mudo">Nada pendente nas etapas em andamento. As próximas tarefas já estão provisionadas em “Minhas tarefas”.</p>}
            <ul className="lista">
              {agora.slice(0, 5).map((g) => (
                <li key={g.projeto.id + g.etapa.codigo}><Link to="/tarefas">
                  <b>{g.projeto.nome}</b> <span className="mudo">· etapa {g.etapa.codigo} · {g.etapa.titulo}</span>
                  <span className="etapa">{g.pendentes} item(ns) a fazer</span>
                </Link></li>
              ))}
            </ul>
            {agora.length > 0 && <p style={{ margin: '8px 0 0' }}><Link to="/tarefas">Ver todas as minhas tarefas →</Link></p>}
          </section>
        );
      })()}

      {eu.perfil === 'admin' && porPessoa.length > 0 && (
        <section className="card">
          <h2>Por profissional</h2>
          <ul className="lista">
            {porPessoa.map((x) => (
              <li key={x.id}><Link to={`/projetos?resp=${x.id}`}>
                <b>{x.nome}</b> <span className="mudo">· {x.ativos} ativo{x.ativos === 1 ? '' : 's'}{x.pausados ? `, ${x.pausados} pausado${x.pausados === 1 ? '' : 's'}` : ''}</span>
                <span className="etapa">{x.etapas.join(' · ') || 'sem etapa em andamento'}</span>
              </Link></li>
            ))}
          </ul>
        </section>
      )}

      {(atencao.length > 0 || pausaCritica.length > 0) && (
        <section className="card">
          <h2>Atenção</h2>
          <ul className="lista">
            {atencao.map((p) => (
              <li key={p.id}><Link to={`/projetos/${p.projeto_id}`}>
                <b>{p.projetos?.nome}</b> · {p.projetos?.clientes?.nome}
                <span className="mudo"> — {statusProtocolo(p.tipo, p.status)}{p.prazo ? `, prazo ${fmtData(p.prazo)}` : ''}</span>
              </Link></li>
            ))}
            {pausaCritica.map((p) => (
              <li key={p.id}><Link to={`/projetos/${p.id}`}>
                <b>{p.nome}</b> · pausado há {diasDePausa(p.pausado_em)} dias
                <span className="mudo"> — retomada só até {MAX_DIAS_PAUSA} dias</span>
              </Link></li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>Atividade recente</h2>
        {recentes === null ? <Carregando n={3} /> : recentes.length === 0 ? <Vazio titulo="Nada aconteceu ainda" texto="Quando uma etapa começar ou terminar, o registro aparece aqui." icone="horas" /> : (
          <ul className="atividade">
            {recentes.map((r) => (
              <li key={r.id}><span className="ponto-ev" aria-hidden="true" />
                <div><Link to={`/projetos/${r.projeto_id}`}><b>{r.projetos?.nome ?? 'Projeto'}</b></Link> · {r.texto ?? r.tipo}
                  <time dateTime={r.created_at}>{r.profiles?.nome ? `${r.profiles.nome} · ` : ''}{new Date(r.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time></div></li>
            ))}
          </ul>
        )}
      </section>

      <div className="fases">
        {porFase.map(({ fase, itens }) => (
          <section className="card" key={fase}>
            <h2>{fase}. {FASES[fase]} <span className="badge">{itens.length}</span></h2>
            {itens.length === 0 && <p className="mudo">Nenhum projeto nesta fase.</p>}
            <ul className="lista">
              {itens.map((p) => (
                <li key={p.id}><Link to={`/projetos/${p.id}`}>
                  <b>{p.nome}</b>
                  <span className="mudo"> · {p.clientes?.nome}</span>
                  <span className="etapa">{etapaAtual(p)?.codigo} · {etapaAtual(p)?.rotulo}</span>
                </Link></li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
