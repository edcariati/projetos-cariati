import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Profile, ProjetoItem, ProjetoTarefa, Tempo } from '../lib/types';
import { SETOR, fmtData, fmtDur, fmtRelogio } from '../lib/labels';
import { aoMudar, iniciarCronometro, pararCronometro, segundosEntre } from '../lib/tempo';

/** Tarefas e checklist de uma etapa (protocolo do escritório). A data e quem marcou ficam registrados sozinhos. */
export default function Checklist({ etapa, tarefas, itens, nomes, editavel, onChange, titulo = 'Checklist da etapa', aberto, pessoas, meuId, podeAtribuir, aoMarcarItem, aoAtribuir, podeEditarLista, projetoId }: {
  etapa: string; tarefas: ProjetoTarefa[]; itens: ProjetoItem[]; nomes: Map<string, string>;
  editavel: boolean; onChange: () => void; titulo?: string; aberto?: boolean;
  pessoas?: Profile[]; meuId?: string; podeAtribuir?: boolean;
  /** Permite incluir e excluir itens do checklist deste projeto (o protocolo-modelo não muda). */
  podeEditarLista?: boolean;
  /** Quando informado, cada tarefa ganha o seu cronômetro (o tempo soma no total da etapa). */
  projetoId?: string;
  /** Quando informados, a tela muda na hora e o servidor é atualizado em segundo plano (sem recarregar tudo). */
  aoMarcarItem?: (id: string, patch: Partial<ProjetoItem>) => void;
  aoAtribuir?: (id: string, patch: Partial<ProjetoTarefa>) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [novoTexto, setNovoTexto] = useState<Record<string, string>>({});
  const [erro, setErro] = useState('');
  const minhas = tarefas.filter((t) => t.etapa_codigo === etapa).sort((a, b) => a.ordem - b.ordem);
  if (!minhas.length) return null;
  const doEtapa = itens.filter((i) => minhas.some((t) => t.id === i.tarefa_id));
  const feitos = doEtapa.filter((i) => i.feito).length;

  async function alternar(i: ProjetoItem) {
    if (!aoMarcarItem) { await supabase.from('projeto_tarefa_itens').update({ feito: !i.feito }).eq('id', i.id); return onChange(); }
    const antes = { feito: i.feito, feito_por: i.feito_por, feito_em: i.feito_em };
    aoMarcarItem(i.id, !i.feito ? { feito: true, feito_por: meuId ?? i.feito_por, feito_em: new Date().toISOString() } : { feito: false, feito_por: null, feito_em: null });
    const { error } = await supabase.from('projeto_tarefa_itens').update({ feito: !i.feito }).eq('id', i.id);
    if (error) { aoMarcarItem(i.id, antes); onChange(); }
  }

  async function incluir(t: ProjetoTarefa, ordemMax: number) {
    const texto = (novoTexto[t.id] ?? '').trim();
    if (!texto || !projetoId) return;
    setErro('');
    const { error } = await supabase.from('projeto_tarefa_itens').insert({ tarefa_id: t.id, projeto_id: projetoId, ordem: ordemMax + 1, texto });
    if (error) return setErro(/policy|permission|denied/i.test(error.message) ? 'Seu banco ainda não permite incluir itens: rode o atualizar_0020.sql no Supabase.' : error.message);
    setNovoTexto({ ...novoTexto, [t.id]: '' }); onChange();
  }
  async function excluir(i: ProjetoItem) {
    setErro('');
    const { error, data } = await supabase.from('projeto_tarefa_itens').delete().eq('id', i.id).select('id');
    if (error || !data?.length) return setErro(error?.message ?? 'Seu banco ainda não permite excluir itens: rode o atualizar_0020.sql no Supabase.');
    onChange();
  }
  async function anotar(i: ProjetoItem, nota: string) {
    setErro('');
    const { error } = await supabase.from('projeto_tarefa_itens').update({ nota: nota.trim() || null }).eq('id', i.id);
    if (error) return setErro('Para guardar data e versão do aceite, rode o atualizar_0020.sql no Supabase.');
    aoMarcarItem?.(i.id, { nota: nota.trim() || null });
  }

  async function atribuir(t: ProjetoTarefa, quem: string | null) {
    if (!aoAtribuir) { await supabase.from('projeto_tarefas').update({ responsavel_id: quem, atribuicao_manual: true }).eq('id', t.id); return onChange(); }
    const antes = { responsavel_id: t.responsavel_id, atribuicao_manual: t.atribuicao_manual };
    aoAtribuir(t.id, { responsavel_id: quem, atribuicao_manual: true });
    const { error } = await supabase.from('projeto_tarefas').update({ responsavel_id: quem, atribuicao_manual: true }).eq('id', t.id);
    if (error) { aoAtribuir(t.id, antes); onChange(); }
  }
  const Resp = ({ t }: { t: ProjetoTarefa }) => (
    <div className="ck-resp">
      <span className="mudo">{t.responsavel_id ? 'Responsável:' : 'Fila'}</span>{' '}
      <b>{t.responsavel_id ? nomes.get(t.responsavel_id) ?? '—' : t.setor_fila ? SETOR[t.setor_fila] : 'sem responsável'}</b>
      {t.atribuicao_manual && <span className="mudo"> (definido à mão)</span>}
      {meuId && t.responsavel_id !== meuId && editavel && <button className="link" onClick={() => atribuir(t, meuId)}>Assumir</button>}
      {podeAtribuir && pessoas && (
        <select aria-label="Passar a tarefa para" value={t.responsavel_id ?? ''} onChange={(e) => atribuir(t, e.target.value || null)}>
          <option value="">Fila do setor</option>
          {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      )}
    </div>
  );

  return (
    <details className="checklist" open={aberto}>
      <summary><b>{titulo}</b><span className={`ck-prog ${feitos === doEtapa.length ? 'ok' : ''}`}>{feitos}/{doEtapa.length}</span></summary>
      {podeEditarLista && projetoId && <div className="ck-edicao"><button className="link" onClick={() => setEditando(!editando)}>{editando ? 'Concluir edição da lista' : 'Editar lista (incluir ou excluir itens)'}</button></div>}
      {erro && <p className="erro pequeno">{erro}</p>}
      {minhas.map((t) => {
        const lista = itens.filter((i) => i.tarefa_id === t.id).sort((a, b) => a.ordem - b.ordem);
        const unico = lista.length === 1 && lista[0].texto === null;
        return (
          <div className="ck-tarefa" key={t.id}>
            {unico ? <><ItemLinha i={lista[0]} rotulo={t.titulo} nomes={nomes} editavel={editavel} alternar={alternar} prio={t.prioridade} /><Resp t={t} />{projetoId && <TarefaCrono projetoId={projetoId} etapa={t.etapa_codigo} tarefaId={t.id} />}</>
              : <>
                <h4>{t.titulo}{t.prioridade !== 'Baixa' && <span className={`ck-prio ${t.prioridade}`}>{t.prioridade}</span>}</h4>
                {t.descricao && <p>{t.descricao}</p>}
                <Resp t={t} />
                {projetoId && <TarefaCrono projetoId={projetoId} etapa={t.etapa_codigo} tarefaId={t.id} />}
                {lista.map((i) => (
                  <div className="ck-linha" key={i.id}>
                    <ItemLinha i={i} rotulo={i.texto ?? t.titulo} nomes={nomes} editavel={editavel} alternar={alternar} />
                    {editando && editavel && <button className="link perigo" aria-label={`Excluir o item ${i.texto}`} onClick={() => excluir(i)}>✕ excluir</button>}
                    {/aceite/i.test(i.texto ?? '') && i.feito && editavel && (
                      <label className="ck-aceite pequeno">Data e versão do aceite
                        <input defaultValue={i.nota ?? ''} placeholder="ex.: 14/10/2026 · versão 2" onBlur={(e) => e.target.value !== (i.nota ?? '') && anotar(i, e.target.value)} />
                      </label>
                    )}
                    {/aceite/i.test(i.texto ?? '') && i.feito && !editavel && i.nota && <span className="pequeno mudo"> Aceite: {i.nota}</span>}
                  </div>
                ))}
                {editando && editavel && (
                  <div className="nota">
                    <input placeholder="Novo item deste checklist…" value={novoTexto[t.id] ?? ''} onChange={(e) => setNovoTexto({ ...novoTexto, [t.id]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && incluir(t, lista.reduce((m, x) => Math.max(m, x.ordem), 0))} />
                    <button onClick={() => incluir(t, lista.reduce((m, x) => Math.max(m, x.ordem), 0))}>+ Adicionar</button>
                  </div>
                )}
              </>}
          </div>
        );
      })}
      <p className="ck-nota">Ao marcar um item, o app registra quem fez e a data. Não precisa digitar a data.</p>
    </details>
  );
}

function ItemLinha({ i, rotulo, nomes, editavel, alternar, prio }: {
  i: ProjetoItem; rotulo: string; nomes: Map<string, string>; editavel: boolean; alternar: (i: ProjetoItem) => void; prio?: string;
}) {
  return (
    <label className={`ck-item ${i.feito ? 'feito' : ''}`}>
      <input type="checkbox" checked={i.feito} disabled={!editavel} onChange={() => alternar(i)} />
      <span className="ck-texto">{rotulo}{prio && prio !== 'Baixa' && <span className={`ck-prio ${prio}`} style={{ marginLeft: 8 }}>{prio}</span>}</span>
      {i.feito && <span className="ck-quem">{i.feito_por ? nomes.get(i.feito_por) ?? '' : ''} {i.feito_em ? fmtData(i.feito_em) : ''}</span>}
    </label>
  );
}

/** Cronômetro de uma tarefa (atividade) da etapa: o tempo entra no total da etapa. */
function TarefaCrono({ projetoId, etapa, tarefaId }: { projetoId: string; etapa: string; tarefaId: string }) {
  const [reg, setReg] = useState<Tempo[] | null>(null);
  const [ativo, setAtivo] = useState<Tempo | null>(null);
  const [agora, setAgora] = useState(Date.now());
  const [erro, setErro] = useState('');
  const carregar = useCallback(async () => {
    const r = await supabase.from('tempos').select('*').eq('projeto_id', projetoId).eq('tarefa_id', tarefaId);
    if (r.error) { setReg(null); return; }   // banco sem a migração 0020: sem cronômetro por tarefa
    const lista = (r.data as Tempo[]) ?? [];
    setReg(lista); setAtivo(lista.find((t) => !t.finalizado_em) ?? null);
  }, [projetoId, tarefaId]);
  useEffect(() => { carregar(); return aoMudar(() => carregar()); }, [carregar]);
  useEffect(() => { if (!ativo) return; const t = setInterval(() => setAgora(Date.now()), 1000); return () => clearInterval(t); }, [ativo]);
  if (reg === null) return null;
  const fechado = reg.filter((t) => t.finalizado_em).reduce((s, t) => s + segundosEntre(t.iniciado_em, t.finalizado_em), 0);
  const sessao = ativo ? segundosEntre(ativo.iniciado_em, null, agora) : 0;
  async function alternar() { setErro(''); try { await (ativo ? pararCronometro() : iniciarCronometro(projetoId, etapa, tarefaId)); } catch (e) { setErro((e as Error).message); } }
  return (
    <div className={`ck-crono${ativo ? ' rodando' : ''}`}>
      <button className={ativo ? 'perigo' : ''} onClick={alternar} aria-label={ativo ? 'Parar o tempo desta atividade' : 'Iniciar o tempo desta atividade'}>{ativo ? '■' : '▶'}</button>
      <span className="pequeno">Tempo desta atividade: <b>{ativo ? fmtRelogio(sessao) : fmtDur(fechado)}</b>{ativo && fechado > 0 && <span className="mudo"> (+ {fmtDur(fechado)})</span>}</span>
      {erro && <span className="erro pequeno">{erro}</span>}
    </div>
  );
}
