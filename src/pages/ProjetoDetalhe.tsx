import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Especialidade, EtapaModelo, Historico, Profile, Projeto, ProjetoEquipe, ProjetoEtapa, ProjetoItem, ProjetoTarefa, Protocolo, ProtocoloTipo } from '../lib/types';
import { podeBancoHoras, usePerfil } from '../lib/perfil';
import { ESPECIALIDADE, ETAPA_STATUS, FASES, PROJETO_STATUS, PROTOCOLO_TIPO, SETOR, TIPOS_EXTERNOS, TIPOS_INTERNOS, TIPO_ESTUDO, fmtData, tituloEtapa } from '../lib/labels';
import {
  MAX_DIAS_PAUSA, MAX_RODADAS, concluirEtapa, diasDePausa, iniciarHabitese, pausarProjeto, reabrirEtapa,
  registrarRodada, SEQUENCIA_APRESENTACAO, rescindirProjeto, retomarProjeto,
} from '../lib/flow';
import ProtocoloItem from '../components/ProtocoloItem';
import Documentos from '../components/Documentos';
import { CronometroMini } from '../components/Cronometro';
import RegistrosTempo from '../components/RegistrosTempo';
import ComplementaresParceiros from '../components/ComplementaresParceiros';
import GanttEtapas from '../components/GanttEtapas';
import { carregarCronograma } from '../lib/carga';
import { useTemposDe } from '../lib/tempo';
import type { Crono } from '../lib/cronograma';
import { confirmar, escolher, pedirTexto } from '../components/Dialogo';
import { Medidor } from '../components/graficos';
import Checklist from '../components/Checklist';
import { Carregando, Vazio } from '../ui/Holo';
import { percentualProjeto, type ItensPorEtapa } from '../lib/progresso';

const COM_RODADAS = new Set(['07', '11', '17']);   // a rodada é registrada no estudo; as horas da revisão ficam nele

import { ResumoServicos, type Escolha } from '../components/ServicosCliente';
import { perfilPorId, useCatalogo } from '../lib/servicos';
/** Busca o projeto com os serviços do cliente; se o banco ainda não tem as colunas novas (atualizar_0018.sql), busca só o básico. */
async function buscarProjeto(id: string) {
  const r = await supabase.from('projetos').select('*, clientes(nome,codigo,categoria,servicos,servico_estudo,servico_aprovacao,servicos_observacao), profiles(nome)').eq('id', id).single();
  if (r.error && /servico|column|schema cache/i.test(r.error.message)) return supabase.from('projetos').select('*, clientes(nome,codigo), profiles(nome)').eq('id', id).single();
  return r;
}

export default function ProjetoDetalhe() {
  const { id } = useParams();
  const eu = usePerfil();
  const admin = eu.perfil === 'admin';
  const [projeto, setProjeto] = useState<Projeto | null>(null);
  const [modelos, setModelos] = useState<EtapaModelo[]>([]);
  const [etapas, setEtapas] = useState<ProjetoEtapa[]>([]);
  const [hist, setHist] = useState<Historico[]>([]);
  const [protocolos, setProtocolos] = useState<Protocolo[]>([]);
  const [aberta, setAberta] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  const [erro, setErro] = useState('');
  const [equipe, setEquipe] = useState<ProjetoEquipe[]>([]);
  const [tarefas, setTarefas] = useState<ProjetoTarefa[]>([]);
  const [itens, setItens] = useState<ProjetoItem[]>([]);
  const [pessoas, setPessoas] = useState<Profile[]>([]);
  const [novoMembro, setNovoMembro] = useState<{ usuario: string; esp: Especialidade }>({ usuario: '', esp: 'arquitetonico' });
  const [horasReal, setHorasReal] = useState<number | null>(null);
  const [novoProt, setNovoProt] = useState<{ tipo: ProtocoloTipo; orgao: string; numero: string } | null>(null);

  // modelos de etapa e equipe não mudam a cada clique: vêm uma vez só
  useEffect(() => {
    Promise.all([
      supabase.from('etapa_modelos').select('*').order('ordem'),
      supabase.from('profiles').select('*').neq('perfil', 'cliente').eq('ativo', true).order('nome'),
    ]).then(([m, pe]) => { setModelos((m.data as EtapaModelo[]) ?? []); setPessoas((pe.data as Profile[]) ?? []); });
  }, []);

  const carregar = useCallback(async () => {
    const [p, e, h, pr, eq, ta, it, tp] = await Promise.all([
      buscarProjeto(id!),
      supabase.from('projeto_etapas').select('*').eq('projeto_id', id!),
      supabase.from('historico').select('*, profiles(nome)').eq('projeto_id', id!).order('created_at', { ascending: false }).limit(50),
      supabase.from('protocolos').select('*').eq('projeto_id', id!).order('created_at', { ascending: false }),
      supabase.from('projeto_equipe').select('*, profiles(nome)').eq('projeto_id', id!),
      supabase.from('projeto_tarefas').select('*').eq('projeto_id', id!).order('ordem'),
      supabase.from('projeto_tarefa_itens').select('*').eq('projeto_id', id!).order('ordem'),
      supabase.from('tempos').select('iniciado_em,finalizado_em').eq('projeto_id', id!),
    ]);
    setHorasReal(((tp.data as { iniciado_em: string; finalizado_em: string | null }[]) ?? [])
      .reduce((s, t) => s + (new Date(t.finalizado_em ?? Date.now()).getTime() - new Date(t.iniciado_em).getTime()) / 3_600_000, 0));
    setProjeto(p.data as Projeto);
    setEtapas((e.data as ProjetoEtapa[]) ?? []); setHist((h.data as Historico[]) ?? []);
    setProtocolos((pr.data as Protocolo[]) ?? []); setEquipe((eq.data as ProjetoEquipe[]) ?? []);
    setTarefas((ta.data as ProjetoTarefa[]) ?? []); setItens((it.data as ProjetoItem[]) ?? []);
  }, [id]);
  const marcarItem = useCallback((iid: string, patch: Partial<ProjetoItem>) => setItens((l) => l.map((x) => (x.id === iid ? { ...x, ...patch } : x))), []);
  const atribuirTarefa = useCallback((tid: string, patch: Partial<ProjetoTarefa>) => setTarefas((l) => l.map((x) => (x.id === tid ? { ...x, ...patch } : x))), []);
  useEffect(() => { carregar(); }, [carregar]);

  const run = async (fn: () => Promise<unknown>) => {
    setErro('');
    try { await fn(); await carregar(); } catch (e) { setErro((e as Error).message); }
  };

  const catalogo = useCatalogo();
  const temp = useTemposDe(id ? [id] : []);
  const [crono, setCrono] = useState<Crono | null>(null);
  useEffect(() => { carregarCronograma().then((c) => setCrono(c.crono)).catch(() => undefined); }, [id, etapas.length]);
  if (!projeto) return <Carregando tipo="cartoes" n={2} />;
  const cl = projeto.clientes;
  const escolha: Escolha = { perfil: projeto.perfil ?? cl?.categoria ?? '', ids: projeto.servicos ?? cl?.servicos ?? [], estudo: projeto.tipo_estudo, aprovacao: projeto.tipo_aprovacao ?? cl?.servico_aprovacao ?? '', obs: projeto.servicos_observacao ?? cl?.servicos_observacao ?? '' };
  const temEntregas = !!perfilPorId(escolha.perfil) || escolha.ids.length > 0;
  const parceiro19 = catalogo.categorias.some((c) => c.execucao === 'parceiro' && c.etapas.includes('19') && escolha.ids.some((i) => i.startsWith(c.id + '-')));
  const linhaGantt = crono?.linhas.find((l) => l.projeto.id === projeto.id);
  const segEtapa = new Map([...temp.fechado].filter(([k]) => k.startsWith(projeto.id + '|')).map(([k, v]) => [k.split('|')[1], v]));
  const faixa = etapas.filter((e) => e.status !== 'nao_aplicavel').map((e) => ({ e, m: modelos.find((x) => x.codigo === e.etapa_codigo) })).filter((x) => x.m).sort((a, b) => a.m!.ordem - b.m!.ordem);
  const pausado = projeto.status === 'pausado';
  const dias = diasDePausa(projeto.pausado_em);
  const nomes = new Map(pessoas.map((p) => [p.id, p.nome]));
  const pendentes = (cod: string) => { const ids = tarefas.filter((t) => t.etapa_codigo === cod).map((t) => t.id); return itens.filter((i) => ids.includes(i.tarefa_id) && !i.feito).length; };
  const itensMapa: ItensPorEtapa = new Map();
  for (const t of tarefas) for (const i of itens.filter((x) => x.tarefa_id === t.id)) { const k = `${projeto.id}|${t.etapa_codigo}`; const x = itensMapa.get(k) ?? { feitos: 0, total: 0 }; x.total += 1; if (i.feito) x.feitos += 1; itensMapa.set(k, x); }
  const aplicaveis = etapas.filter((e) => e.status !== 'nao_aplicavel' && modelos.find((m) => m.codigo === e.etapa_codigo)?.fase !== 5);
  const pctProjeto = percentualProjeto(projeto.id, aplicaveis, itensMapa);
  const pendConcluidas = etapas.filter((e) => e.status === 'concluida').reduce((s, e) => s + pendentes(e.etapa_codigo), 0);
  const temPausa = tarefas.some((t) => t.etapa_codigo.startsWith('P'));
  const etapaDe = (cod: string) => etapas.find((e) => e.etapa_codigo === cod);
  /** Quem pode agir na etapa: administrador, responsável pelo projeto ou alguém do setor da etapa. */
  const podeAgir = (m: EtapaModelo) => admin || projeto.responsavel_id === eu.id || m.setores.includes(eu.setor);

  const linhaEtapa = (m: EtapaModelo) => {
              const e = etapaDe(m.codigo);
              if (!e) return null;
              const ativa = e.status === 'em_andamento';
              return (
                <li key={m.codigo} className={`et ${e.status}`}>
                  <div className="linha" onClick={() => setAberta(aberta === m.codigo ? null : m.codigo)}>
                    <span className="et-num">{m.codigo}</span>
                    <div className="grow">
                      <b>{tituloEtapa(m.codigo, m.titulo, projeto.tipo_estudo)}</b>
                      <div className="pequeno mudo">
                        {m.setores.map((s) => SETOR[s]).join(' · ')}{m.cliente_participa ? ' · Cliente' : ''}
                        {m.aceite_formal ? ' · aceite formal' : ''}
                      </div>
                    </div>
                    {e.status !== 'nao_aplicavel' && <CronometroMini projetoId={projeto.id} etapaCodigo={m.codigo} fechadoSeg={temp.fechado.get(`${projeto.id}|${m.codigo}`) ?? 0} ativo={temp.ativo}
                      bloqueio={pausado ? 'Projeto pausado: retome o projeto para usar o cronômetro.' : !podeAgir(m) ? `Esta etapa cabe a: ${m.setores.map((x) => SETOR[x]).join(' / ')}.` : undefined} />}
                    {e.status === 'concluida' && pendentes(m.codigo) > 0 && <span className="tag pendencia" title="Etapa concluída com itens do checklist em aberto">{pendentes(m.codigo)} pendência(s)</span>}
                    <span className={`tag e-${e.status}`}>{ETAPA_STATUS[e.status]}</span>
                  </div>
                  {(aberta === m.codigo || ativa) && e.status !== 'nao_aplicavel' && (
                    <div className="detalhe">
                      <dl>
                        {m.entrada && <><dt>Entra</dt><dd>{m.entrada}</dd></>}
                        {m.saida && <><dt>Sai</dt><dd>{m.saida}</dd></>}
                        {m.regra && <><dt>Regra</dt><dd>{m.regra}</dd></>}
                        {e.iniciada_em && <><dt>Início</dt><dd>{fmtData(e.iniciada_em)}</dd></>}
                        {e.concluida_em && <><dt>Conclusão</dt><dd>{fmtData(e.concluida_em)}</dd></>}
                      </dl>
                      {COM_RODADAS.has(m.codigo) && (
                        <div className="rodadas">
                          Rodadas de ajuste: <b className={e.rodadas_ajuste > MAX_RODADAS ? 'alerta' : ''}>{e.rodadas_ajuste}</b> / {MAX_RODADAS}
                          {e.rodadas_ajuste >= MAX_RODADAS - 1 && ativa && <span className="aviso inline"> {e.rodadas_ajuste >= MAX_RODADAS ? 'Próximas rodadas têm custo adicional.' : 'Lembrar o cliente do limite na próxima reunião.'}</span>}
                          {ativa && !pausado && podeAgir(m) && <button onClick={() => run(async () => {
                            const seq = SEQUENCIA_APRESENTACAO[m.codigo];
                            const destino = seq ? await escolher('Esta revisão precisa de nova apresentação ao cliente?', [['apresentar', 'Sim — nova apresentação (volta o agendamento e a reunião, em sequência)'], ['analise', 'Não — enviar o estudo ao cliente para análise']]) : null;
                            if (seq && !destino) return;
                            await registrarRodada(projeto.id, e, (destino as 'apresentar' | 'analise' | null) ?? undefined, etapas);
                          })}>+ Registrar rodada (revisão)</button>}
                        </div>
                      )}
                      <Checklist etapa={m.codigo} tarefas={tarefas} itens={itens} nomes={nomes} editavel={podeAgir(m) && !pausado} onChange={carregar} aoMarcarItem={marcarItem} aoAtribuir={atribuirTarefa} aberto={ativa} pessoas={pessoas} meuId={eu.id} podeAtribuir={admin || projeto.responsavel_id === eu.id} podeEditarLista={podeAgir(m) && !pausado} projetoId={projeto.id} />
                      {m.codigo === '19' && <ComplementaresParceiros projeto={projeto} onChange={carregar} />}
                      <RegistrosTempo projetoId={projeto.id} etapaCodigo={m.codigo} meuId={eu.id} admin={admin} nomes={nomes} />
                      <Documentos projetoId={projeto.id} etapaCodigo={m.codigo} clienteCodigo={projeto.clientes?.codigo ?? null} />
                      <div className="acoes">
                        {ativa && !pausado && podeAgir(m) && <button className="primario" onClick={async () => {
                          const p = pendentes(m.codigo);
                          if (p > 0 && !(await confirmar(`Ainda há ${p} item(ns) pendente(s) no checklist desta etapa. Concluir mesmo assim?`))) return;
                          run(() => concluirEtapa(projeto.id, e, modelos, etapas));
                        }}>
                          {m.aceite_formal ? 'Aceite assinado — concluir' : 'Concluir etapa'}
                        </button>}
                        {e.status === 'concluida' && !pausado && podeAgir(m) && <button onClick={async () => (await confirmar('Reabrir esta etapa? As etapas seguintes devem ser revistas.')) && run(() => reabrirEtapa(projeto.id, e))}>Reabrir</button>}
                      </div>
                    </div>
                  )}
                </li>
              );
  };

  return (
    <>
      <p><Link to="/projetos">← Projetos</Link></p>
      <div className="titulo">
        <div>
          <h1>{projeto.nome}</h1>
          <div className="mudo">{projeto.clientes?.nome}{projeto.clientes?.codigo ? ` · ${projeto.clientes.codigo}` : ''}</div>
        </div>
        <span className={`tag ${projeto.status}`}>{PROJETO_STATUS[projeto.status]}</span>
      </div>
      {erro && <p className="erro">{erro}</p>}

      <section className="card">
        <div className="etiquetas">
          <span className="etiqueta" title="Tipo de estudo preliminar">{TIPO_ESTUDO[projeto.tipo_estudo]}</span>
          {projeto.tem_legal && <span className="etiqueta">Legal{projeto.tipo_aprovacao ? ` · ${projeto.tipo_aprovacao}` : ''}</span>}
          {projeto.tem_interiores && <span className="etiqueta">Interiores</span>}
          {projeto.tem_complementares && <span className="etiqueta">Complementares</span>}
          {!projeto.tem_legal && !projeto.tem_interiores && !projeto.tem_complementares && <span className="etiqueta">Somente arquitetônico</span>}
        </div>
        <div className="barra" role="progressbar" aria-valuenow={pctProjeto} aria-valuemin={0} aria-valuemax={100} aria-label="Andamento do projeto"><i style={{ width: `${pctProjeto}%` }} /></div>
        <p className="mudo pequeno" style={{ margin: '6px 0 0' }}>{pctProjeto}% do fluxo (etapas concluídas + itens já marcados da etapa em andamento){pendConcluidas > 0 && <b className="alerta"> · {pendConcluidas} pendência(s) em etapas concluídas</b>}</p>
        {pausado && (
          <p className={dias > MAX_DIAS_PAUSA ? 'erro' : 'aviso'}>
            Pausado desde {fmtData(projeto.pausado_em)} ({dias} dias){projeto.motivo_pausa ? ` — ${projeto.motivo_pausa}` : ''}.{' '}
            {dias > MAX_DIAS_PAUSA
              ? 'Passou de 180 dias: enviar o termo de rescisão por ausência de retomada.'
              : `Retomada possível até ${MAX_DIAS_PAUSA} dias (aditivo assinado).`}
          </p>
        )}
        <div className="acoes">
          {projeto.status === 'ativo' && <>
            <button onClick={async () => {
              const tipo = await escolher('Qual o motivo da pausa?', [['P1', 'A pedido do cliente (termo de pausa)'], ['P2', 'Falta de retorno do cliente (3 tentativas de contato)']]);
              if (tipo) run(() => pausarProjeto(projeto.id, tipo === 'P1' ? 'Pausa a pedido do cliente' : 'Pausa por falta de retorno do cliente', tipo as 'P1' | 'P2'));
            }}>Pausar projeto</button>
          </>}
          {pausado && <>
            <button className="primario" onClick={() => run(() => retomarProjeto(projeto.id))}>Retomar (aditivo assinado)</button>
            {dias > MAX_DIAS_PAUSA && <button className="perigo" onClick={async () => (await confirmar('Marcar como rescindido?')) && run(() => rescindirProjeto(projeto.id))}>Rescindir contrato</button>}
          </>}
        </div>
      </section>

      {faixa.length > 0 && (
        <section className="card" aria-label="Fluxo deste projeto">
          <h2>Fluxo deste projeto <span className="badge">{faixa.length} etapas</span></h2>
          <ol className="faixa-fluxo">
            {faixa.map(({ e, m }) => (
              <li key={e.etapa_codigo} className={e.status} title={m!.titulo}>
                <i>{e.status === 'concluida' ? '✓' : e.etapa_codigo}</i><span>{m!.rotulo}</span>
                {e.etapa_codigo === '19' && parceiro19 && <em>parceiros · Cariati confere</em>}
              </li>
            ))}
          </ol>
        </section>
      )}
      {linhaGantt && crono && (
        <section className="card" aria-label="Cronograma do projeto">
          <h2>Cronograma do projeto (Gantt)</h2>
          <GanttEtapas linha={linhaGantt} inicio={crono.inicio} fim={crono.fim} segundos={segEtapa} parceiro={parceiro19 ? new Set(['19']) : undefined} />
        </section>
      )}
      {temEntregas && <ResumoServicos v={escolha} titulo="Entregas contratadas" />}


      {temPausa && (
        <section className="card">
          <h3>Pausa e retomada</h3>
          {(['P1', 'P2', 'P3', 'P4'] as const).map((c) => (
            <Checklist key={c} etapa={c} titulo={{ P1: 'Pausa a pedido do cliente', P2: 'Pausa por falta de retorno', P3: 'Retomada do projeto', P4: 'Rescisão' }[c]}
              tarefas={tarefas} itens={itens} nomes={nomes} editavel onChange={carregar} aoMarcarItem={marcarItem} aoAtribuir={atribuirTarefa} aberto />
          ))}
          {(['P1', 'P2'] as const).filter((c) => tarefas.some((t) => t.etapa_codigo === c)).map((c) => (
            <div key={c}><h4>Termo de pausa assinado pelo cliente {c === 'P2' ? '(se houver)' : ''}</h4><Documentos projetoId={projeto.id} etapaCodigo={c} clienteCodigo={projeto.clientes?.codigo ?? null} /></div>
          ))}
        </section>
      )}

      {podeBancoHoras(eu) && horasReal !== null && (() => {
        const padrao = etapas.filter((e) => e.status !== 'nao_aplicavel' && modelos.find((m) => m.codigo === e.etapa_codigo)?.fase !== 5)
          .reduce((s, e) => s + (modelos.find((m) => m.codigo === e.etapa_codigo)?.horas_padrao ?? 0), 0);
        const est = projeto.horas_estimadas != null ? Number(projeto.horas_estimadas) : padrao;
        const pct = est > 0 ? (horasReal / est) * 100 : null;
        const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
        return (
          <section className="card" id="horas-projeto">
            <h3>Horas do projeto</h3>
            <div className="horas-linha">
              <div><b>{fmt(horasReal)} h</b><span className="mudo pequeno">realizadas</span></div>
              <div><b>{fmt(est)} h</b><span className="mudo pequeno">estimadas · {projeto.horas_estimadas != null ? 'estimativa manual' : 'soma do padrão das etapas'}</span></div>
              <div><b style={{ color: pct !== null && pct > 100 ? 'var(--red)' : undefined }}>{pct === null ? '—' : `${pct > 100 ? '▲ ' : ''}${fmt(pct)}%`}</b><span className="mudo pequeno">{pct !== null && pct > 100 ? 'acima do previsto' : 'do previsto'}</span></div>
            </div>
            {pct !== null && <Medidor valor={Math.min(pct, 100)} max={100} aviso={0.85} perigo={1} rotulo="Horas realizadas sobre as estimadas" />}
            {admin && (
              <div className="acoes" style={{ marginTop: 10 }}>
                <button onClick={async () => {
                  const t = await pedirTexto(`Horas estimadas para este projeto (sugestão: ${fmt(padrao)} h). Digite 0 para voltar ao padrão.`);
                  if (t === null) return;
                  const num = Number(t.replace(',', '.'));
                  if (!Number.isFinite(num) || num < 0) return setErro('Digite um número de horas válido.');
                  const n = num === 0 ? null : num;
                  run(async () => { await supabase.from('projetos').update({ horas_estimadas: n }).eq('id', projeto.id); });
                }}>Definir estimativa</button>
                <Link className="btn" to="/horas">Ver gestão de horas</Link>
              </div>
            )}
          </section>
        );
      })()}

      <section className="card equipe">
        <h3>Equipe do projeto</h3>
        <div className="pessoa-linha">
          <span className="mudo">Responsável</span>
          {(admin || eu.perfil === 'profissional')
            ? <select id="responsavel" value={projeto.responsavel_id ?? ''} onChange={(e) => run(async () => { await supabase.from('projetos').update({ responsavel_id: e.target.value || null }).eq('id', projeto.id); })}>
                <option value="">— sem responsável —</option>
                {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            : <b>{projeto.profiles?.nome ?? '—'}</b>}
        </div>
        {equipe.map((m) => (
          <div className="pessoa-linha" key={m.id}>
            <span><b>{m.profiles?.nome}</b> <span className="mudo">· {ESPECIALIDADE[m.especialidade]}</span></span>
            {admin && <button className="link" onClick={() => run(async () => { await supabase.from('projeto_equipe').delete().eq('id', m.id); })}>Remover</button>}
          </div>
        ))}
        {equipe.length === 0 && <p className="mudo pequeno">Nenhum outro profissional na equipe.</p>}
        {admin && (
          <div className="nota">
            <select id="equipe-pessoa" value={novoMembro.usuario} onChange={(e) => setNovoMembro({ ...novoMembro, usuario: e.target.value })}>
              <option value="">Adicionar profissional…</option>
              {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
            <select id="equipe-esp" value={novoMembro.esp} onChange={(e) => setNovoMembro({ ...novoMembro, esp: e.target.value as Especialidade })}>
              {Object.entries(ESPECIALIDADE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button disabled={!novoMembro.usuario} onClick={() => run(async () => {
              const { error } = await supabase.from('projeto_equipe').insert({ projeto_id: projeto.id, usuario_id: novoMembro.usuario, especialidade: novoMembro.esp });
              if (error) throw error;
              setNovoMembro({ ...novoMembro, usuario: '' });
            })}>Adicionar</button>
          </div>
        )}
      </section>

      <h2>Etapas</h2>
      {[1, 2, 3, 4, 6].map((fase) => (fase === 6 && !projeto.tem_habitese ? (
        <section className="card" key={fase}>
          <h3>6. {FASES[6]}</h3>
          <p className="mudo" style={{ margin: '0 0 10px' }}>
            Serviço após a regularização ou com a obra pronta: documentos, relatório fotográfico, entrada na Prefeitura (Aprova Digital) e entrega dos documentos aprovados.
            {projeto.status === 'finalizado' ? ' O projeto volta ao quadro enquanto o Habite-se estiver em andamento.' : ''}
          </p>
          <button disabled={pausado} onClick={() => run(() => iniciarHabitese(projeto.id))}>Iniciar Habite-se</button>
        </section>
      ) : (
        <section className="card" key={fase}>
          <h3>{fase}. {FASES[fase]}</h3>
          {(() => {
            const daFase = modelos.filter((m) => m.fase === fase && etapaDe(m.codigo));
            const st = (m: EtapaModelo) => etapaDe(m.codigo)!.status;
            const andamento = daFase.filter((m) => st(m) === 'em_andamento');
            const concluidas = daFase.filter((m) => st(m) === 'concluida');
            const proximas = daFase.filter((m) => st(m) === 'pendente' || st(m) === 'nao_aplicavel');
            return (
              <>
                {andamento.length > 0 && <><h4 className="grupo-etapas">Em andamento</h4><ul className="etapas">{andamento.map(linhaEtapa)}</ul></>}
                {concluidas.length > 0 && <details className="grupo-etapas"><summary>Concluídas ({concluidas.length})</summary><ul className="etapas">{concluidas.map(linhaEtapa)}</ul></details>}
                {proximas.length > 0 && <details className="grupo-etapas" open={andamento.length === 0}><summary>A seguir ({proximas.length})</summary><ul className="etapas">{proximas.map(linhaEtapa)}</ul></details>}
              </>
            );
          })()}
        </section>
      )))}

      <h2>Protocolos</h2>
      <div className="pilha">
        {protocolos.map((p) => <ProtocoloItem key={p.id} p={p} onChange={carregar} />)}
        {protocolos.length === 0 && <p className="mudo">Nenhum protocolo neste projeto.</p>}
      </div>
      {novoProt ? (
        <form className="card form" onSubmit={(ev) => { ev.preventDefault(); run(async () => {
          const { error } = await supabase.from('protocolos').insert({ projeto_id: projeto.id, tipo: novoProt.tipo, orgao: novoProt.orgao || null, numero: novoProt.numero || null });
          if (error) throw error;
          setNovoProt(null);
        }); }}>
          <div className="duas">
            <label>Tipo<select value={novoProt.tipo} onChange={(e) => setNovoProt({ ...novoProt, tipo: e.target.value as ProtocoloTipo })}>
              <optgroup label="Externos (órgão)">{TIPOS_EXTERNOS.map((k) => <option key={k} value={k}>{PROTOCOLO_TIPO[k]}</option>)}</optgroup>
              <optgroup label="Internos (processo com o cliente)">{TIPOS_INTERNOS.map((k) => <option key={k} value={k}>{PROTOCOLO_TIPO[k]}</option>)}</optgroup></select></label>
            {!TIPOS_INTERNOS.includes(novoProt.tipo) && <label>Nome do órgão<input placeholder="Ex.: Prefeitura de Goiânia, Condomínio Alphaville, 1º Cartório de Registro de Imóveis" value={novoProt.orgao} onChange={(e) => setNovoProt({ ...novoProt, orgao: e.target.value })} /></label>}
          </div>
          <label>Número (se já houver)<input value={novoProt.numero} onChange={(e) => setNovoProt({ ...novoProt, numero: e.target.value })} /></label>
          <div className="acoes"><button className="primario">Adicionar</button><button type="button" onClick={() => setNovoProt(null)}>Cancelar</button></div>
        </form>
      ) : <button onClick={() => setNovoProt({ tipo: 'prefeitura', orgao: '', numero: '' })}>+ Novo protocolo</button>}

      <h2>Histórico</h2>
      <section className="card">
        <div className="nota">
          <input placeholder="Registrar nota ou decisão…" value={nota} onChange={(e) => setNota(e.target.value)} />
          <button onClick={() => nota.trim() && run(async () => { await supabase.from('historico').insert({ projeto_id: projeto.id, tipo: 'nota', texto: nota.trim() }); setNota(''); })}>Registrar</button>
        </div>
        <ul className="hist">
          {hist.map((h) => (
            <li key={h.id}>
              <span className="mudo pequeno">{fmtData(h.created_at)} {new Date(h.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
              <div>{h.etapa_codigo && <b>Etapa {h.etapa_codigo} · </b>}{h.texto}{h.profiles?.nome && <span className="mudo"> — {h.profiles.nome}</span>}</div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
