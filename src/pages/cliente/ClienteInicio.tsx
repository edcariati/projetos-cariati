import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { usePerfil } from '../../lib/perfil';
import type { EtapaCliente, Projeto } from '../../lib/types';
import { PROJETO_STATUS } from '../../lib/labels';
import { Anel, Carregando, Vazio } from '../../ui/Holo';

export default function ClienteInicio() {
  const eu = usePerfil();
  const [projetos, setProjetos] = useState<Projeto[] | null>(null);
  const [etapas, setEtapas] = useState<EtapaCliente[]>([]);

  useEffect(() => {
    supabase.from('projetos').select('*, profiles(nome), projeto_etapas(etapa_codigo,status)')
      .order('created_at', { ascending: false }).then(({ data }) => setProjetos((data as Projeto[]) ?? []));
    supabase.from('etapas_cliente').select('*').order('ordem').then(({ data }) => setEtapas((data as EtapaCliente[]) ?? []));
  }, []);

  return (
    <>
      <div className="titulo"><h1>Olá, {eu.nome.split(' ')[0]}</h1></div>
      <p className="mudo">Aqui você acompanha o andamento do seu projeto com o escritório.</p>
      {projetos === null && <Carregando tipo="cartoes" n={2} />}
      {projetos?.length === 0 && <section className="card"><Vazio titulo="Nenhum projeto por aqui ainda" texto="Nenhum projeto está vinculado ao seu acesso. Se isso parece um engano, fale com o escritório." icone="projetos" /></section>}
      <ul className="cards">
        {projetos?.map((p) => {
          const aplic = (p.projeto_etapas ?? []).filter((e) => e.status !== 'nao_aplicavel' && (etapas.find((m) => m.codigo === e.etapa_codigo)?.fase ?? 9) <= 4);
          const feitas = aplic.filter((e) => e.status === 'concluida').length;
          const pct = aplic.length ? Math.round((feitas / aplic.length) * 100) : 0;
          const atual = etapas.find((m) => m.codigo === p.projeto_etapas?.find((e) => e.status === 'em_andamento')?.etapa_codigo);
          return (
            <li key={p.id}>
              <Link className="card item" to={`/projeto/${p.id}`}>
                <div><b>{p.nome}</b><span className={`tag ${p.status}`}>{PROJETO_STATUS[p.status]}</span></div>
                <div className="item-anel"><Anel valor={pct} rotulo="concluído" tam={128} /><div><div className="pequeno">{pct}% concluído{p.status === 'ativo' && atual ? ` · agora: ${atual.titulo}` : ''}</div>
                <div className="barra"><i style={{ width: `${pct}%` }} /></div></div></div>
                {p.profiles?.nome && <div className="pequeno mudo">Profissional responsável: {p.profiles.nome}</div>}
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
