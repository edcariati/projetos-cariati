import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { Documento, EtapaCliente, Projeto, ProjetoEtapa, Protocolo } from '../../lib/types';
import { ETAPA_STATUS, FASES, PROJETO_STATUS, diasAte, fmtData, statusProtocolo, PROTOCOLO_TIPO, tituloEtapa } from '../../lib/labels';
import { Carregando, Vazio } from '../../ui/Holo';

/** O que se espera do cliente em cada etapa em que ele participa. */
const ACAO: Record<string, string> = {
  '03': 'Preencher o briefing enviado pelo escritório no grupo de WhatsApp.',
  '04': 'Combinar o dia e a forma (presencial ou online) da reunião de briefing.',
  '05': 'Participar da reunião de briefing e assinar a ata.',
  '06': 'Enviar os documentos solicitados do terreno ou imóvel.',
  '08': 'Confirmar o agendamento da apresentação da planta baixa.',
  '09': 'Analisar o estudo apresentado e dar o seu retorno: aprovar ou pedir ajustes.',
  '10': 'Assinar o aceite formal da planta baixa.',
  '12': 'Confirmar o agendamento da apresentação da fachada.',
  '13': 'Analisar o estudo apresentado e dar o seu retorno: aprovar ou pedir ajustes.',
  '14': 'Assinar o aceite formal da fachada.',
  '17': 'Participar do briefing e da apresentação do estudo de interiores e assinar o aceite.',
  '21': 'Confirmar o dia e o horário da reunião de entrega.',
  '23': 'Participar da reunião de entrega e assinar o termo de retirada dos documentos.',
};

import { ResumoServicos } from '../../components/ServicosCliente';
import { perfilPorId } from '../../lib/servicos';
export default function ClienteProjeto() {
  const { id } = useParams();
  const [projeto, setProjeto] = useState<Projeto | null>(null);
  const [modelos, setModelos] = useState<EtapaCliente[]>([]);
  const [etapas, setEtapas] = useState<ProjetoEtapa[]>([]);
  const [protocolos, setProtocolos] = useState<Protocolo[]>([]);
  const [docs, setDocs] = useState<Documento[]>([]);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    Promise.all([
      supabase.from('projetos').select('*, profiles(nome)').eq('id', id!).single(),
      supabase.from('etapas_cliente').select('*').order('ordem'),
      supabase.from('projeto_etapas').select('*').eq('projeto_id', id!),
      supabase.from('protocolos').select('*').eq('projeto_id', id!).order('created_at', { ascending: false }),
      supabase.from('projeto_documentos').select('*').eq('projeto_id', id!).order('created_at', { ascending: false }),
    ]).then(([p, m, e, pr, d]) => {
      setProjeto(p.data as Projeto); setModelos((m.data as EtapaCliente[]) ?? []); setEtapas((e.data as ProjetoEtapa[]) ?? []);
      setProtocolos((pr.data as Protocolo[]) ?? []); setDocs((d.data as Documento[]) ?? []);
    });
  }, [id]);

  async function abrir(d: Documento) {
    setMsg('');
    const { data, error } = await supabase.storage.from('documentos').createSignedUrl(d.arquivo_path, 120);
    if (error) return setMsg(error.message);
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  if (!projeto) return <Carregando tipo="cartoes" n={2} />;
  const st = (cod: string) => etapas.find((e) => e.etapa_codigo === cod);
  const atual = modelos.find((m) => st(m.codigo)?.status === 'em_andamento');
  const pausado = projeto.status === 'pausado';

  return (
    <>
      <p><Link to="/">← Meu projeto</Link></p>
      <div className="titulo">
        <div><h1>{projeto.nome}</h1>{projeto.profiles?.nome && <div className="mudo">Profissional responsável: {projeto.profiles.nome}</div>}</div>
        <span className={`tag ${projeto.status}`}>{PROJETO_STATUS[projeto.status]}</span>
      </div>

      {pausado && <section className="aviso">Este projeto está pausado desde {fmtData(projeto.pausado_em)}. Para retomar, fale com o escritório.</section>}
      {!pausado && atual && (
        <section className="card agora">
          <div className="pequeno mudo">Agora</div>
          <h2>{tituloEtapa(atual.codigo, atual.titulo, projeto.tipo_estudo)}</h2>
          {atual.cliente_participa
            ? <p className="sua-vez"><b>Sua participação:</b> {ACAO[atual.codigo] ?? 'O escritório avisará pelo grupo de WhatsApp quando precisar de você.'}</p>
            : <p className="mudo">O escritório está trabalhando nesta etapa. Não precisamos de nada de você agora.</p>}
        </section>
      )}

      {(perfilPorId(projeto.perfil) || (projeto.servicos?.length ?? 0) > 0) && (
        <ResumoServicos cliente titulo="O que vamos entregar" v={{ perfil: projeto.perfil ?? '', ids: projeto.servicos ?? [], estudo: projeto.tipo_estudo, aprovacao: projeto.tipo_aprovacao ?? '', obs: projeto.servicos_observacao ?? '' }} />
      )}
      <h2>Andamento</h2>
      {[1, 2, 3, 4, 6].map((fase) => {
        const lista = modelos.filter((m) => m.fase === fase && st(m.codigo) && st(m.codigo)!.status !== 'nao_aplicavel');
        if (!lista.length) return null;
        return (
          <section className="card" key={fase}>
            <h3>{fase}. {FASES[fase]}</h3>
            <ul className="etapas">
              {lista.map((m) => {
                const e = st(m.codigo)!;
                return (
                  <li key={m.codigo} className={`et ${e.status}`}>
                    <div className="linha sem-clique">
                      <span className="et-num">{e.status === 'concluida' ? '✓' : m.codigo}</span>
                      <div className="grow">
                        <b>{tituloEtapa(m.codigo, m.titulo, projeto.tipo_estudo)}</b>
                        <div className="pequeno mudo">
                          {m.cliente_participa ? 'Com a sua participação' : 'Trabalho do escritório'}{m.aceite_formal ? ' · aceite formal' : ''}
                          {e.concluida_em ? ` · concluída em ${fmtData(e.concluida_em)}` : ''}
                        </div>
                      </div>
                      <span className={`tag e-${e.status}`}>{ETAPA_STATUS[e.status]}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <h2>Protocolos e entregas</h2>
      <section className="card">
        {protocolos.length === 0 && <p className="mudo">Nenhum protocolo ou entrega registrado por enquanto.</p>}
        <ul className="lista">
          {protocolos.map((p) => {
            const d = diasAte(p.prazo);
            return (
              <li key={p.id}><div className="lista-item">
                <div className="grow">
                  <b>{PROTOCOLO_TIPO[p.tipo]}{p.orgao ? ` · ${p.orgao}` : ''}</b>
                  {p.numero && <span className="mudo"> · nº {p.numero}</span>}
                  {p.prazo && <div className="pequeno mudo">{p.tipo === 'entrega_cliente' ? 'Entrega prevista' : 'Próxima verificação'}: {fmtData(p.prazo)}{d !== null && d >= 0 ? ` (em ${d} dia${d === 1 ? '' : 's'})` : ''}</div>}
                </div>
                <span className={`tag p-${p.status}`}>{statusProtocolo(p.tipo, p.status)}</span>
              </div></li>
            );
          })}
        </ul>
      </section>

      <h2>Documentos</h2>
      <section className="card">
        {msg && <p className="erro">{msg}</p>}
        {docs.length === 0 && <p className="mudo">Os documentos que o escritório liberar para você aparecerão aqui.</p>}
        <ul className="lista">
          {docs.map((d) => (
            <li key={d.id}><div className="lista-item">
              <div className="grow"><b>{d.nome}</b><div className="pequeno mudo">{d.arquivo_nome} · {fmtData(d.created_at)}</div></div>
              <button onClick={() => abrir(d)}>Abrir</button>
            </div></li>
          ))}
        </ul>
      </section>
    </>
  );
}
