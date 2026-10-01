import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { EtapaModelo, Projeto, ProjetoStatus } from '../lib/types';
import { PROJETO_STATUS } from '../lib/labels';
import { usePerfil } from '../lib/perfil';

export default function Projetos() {
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [modelos, setModelos] = useState<EtapaModelo[]>([]);
  const [filtro, setFiltro] = useState<ProjetoStatus | 'todos'>('ativo');
  const [busca, setBusca] = useState('');
  const eu = usePerfil();
  const [params, setParams] = useSearchParams();
  const resp = params.get('resp') ?? '';

  useEffect(() => {
    supabase.from('projetos').select('*, clientes(nome,codigo), profiles(nome), projeto_etapas(etapa_codigo,status)')
      .order('created_at', { ascending: false }).then(({ data }) => setProjetos((data as Projeto[]) ?? []));
    supabase.from('etapa_modelos').select('*').order('ordem').then(({ data }) => setModelos((data as EtapaModelo[]) ?? []));
  }, []);

  const responsaveis = [...new Map(projetos.filter((p) => p.responsavel_id && p.profiles?.nome).map((p) => [p.responsavel_id!, p.profiles!.nome])).entries()];
  const lista = projetos.filter((p) =>
    (filtro === 'todos' || p.status === filtro) && (!resp || p.responsavel_id === resp) &&
    `${p.nome} ${p.clientes?.nome ?? ''} ${p.codigo ?? ''}`.toLowerCase().includes(busca.toLowerCase()));

  return (
    <>
      <div className="titulo"><h1>Projetos</h1><Link className="primario btn" to="/projetos/novo">+ Novo projeto</Link></div>
      <div className="filtros">
        <input placeholder="Buscar projeto ou cliente…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select id="filtro-status" value={filtro} onChange={(e) => setFiltro(e.target.value as ProjetoStatus | 'todos')}>
          <option value="todos">Todos</option>
          {Object.entries(PROJETO_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {eu.perfil === 'admin' && responsaveis.length > 0 && (
        <div className="filtros">
          <select id="filtro-responsavel" value={resp} onChange={(e) => setParams(e.target.value ? { resp: e.target.value } : {})}>
            <option value="">Todos os responsáveis</option>
            {responsaveis.map(([rid, nome]) => <option key={rid} value={rid}>{nome}</option>)}
          </select>
        </div>
      )}
      <ul className="cards">
        {lista.map((p) => {
          const aplic = p.projeto_etapas?.filter((e) => e.status !== 'nao_aplicavel' && modelos.find((m) => m.codigo === e.etapa_codigo)?.fase !== 5) ?? [];
          const feitas = aplic.filter((e) => e.status === 'concluida').length;
          const atual = modelos.find((m) => m.codigo === p.projeto_etapas?.find((e) => e.status === 'em_andamento')?.etapa_codigo);
          const pct = aplic.length ? Math.round((feitas / aplic.length) * 100) : 0;
          return (
            <li key={p.id}><Link className="card item" to={`/projetos/${p.id}`}>
              <div><b>{p.nome}</b><span className={`tag ${p.status}`}>{PROJETO_STATUS[p.status]}</span></div>
              <div className="mudo">{p.clientes?.nome}{p.profiles?.nome ? ` · ${p.profiles.nome}` : ''}</div>
              <div className="barra"><i style={{ width: `${pct}%` }} /></div>
              <div className="mudo pequeno">{pct}% · {atual ? `Etapa ${atual.codigo} — ${atual.titulo}` : '—'}</div>
            </Link></li>
          );
        })}
        {lista.length === 0 && <p className="mudo">Nenhum projeto encontrado.</p>}
      </ul>
    </>
  );
}
