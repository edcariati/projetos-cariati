import { supabase } from '../lib/supabase';
import type { Profile, ProjetoItem, ProjetoTarefa } from '../lib/types';
import { SETOR, fmtData } from '../lib/labels';

/** Tarefas e checklist de uma etapa (protocolo do escritório). A data e quem marcou ficam registrados sozinhos. */
export default function Checklist({ etapa, tarefas, itens, nomes, editavel, onChange, titulo = 'Checklist da etapa', aberto, pessoas, meuId, podeAtribuir }: {
  etapa: string; tarefas: ProjetoTarefa[]; itens: ProjetoItem[]; nomes: Map<string, string>;
  editavel: boolean; onChange: () => void; titulo?: string; aberto?: boolean;
  pessoas?: Profile[]; meuId?: string; podeAtribuir?: boolean;
}) {
  const minhas = tarefas.filter((t) => t.etapa_codigo === etapa).sort((a, b) => a.ordem - b.ordem);
  if (!minhas.length) return null;
  const doEtapa = itens.filter((i) => minhas.some((t) => t.id === i.tarefa_id));
  const feitos = doEtapa.filter((i) => i.feito).length;

  async function alternar(i: ProjetoItem) {
    await supabase.from('projeto_tarefa_itens').update({ feito: !i.feito }).eq('id', i.id);
    onChange();
  }

  async function atribuir(t: ProjetoTarefa, quem: string | null) {
    await supabase.from('projeto_tarefas').update({ responsavel_id: quem, atribuicao_manual: true }).eq('id', t.id);
    onChange();
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
      {minhas.map((t) => {
        const lista = itens.filter((i) => i.tarefa_id === t.id).sort((a, b) => a.ordem - b.ordem);
        const unico = lista.length === 1 && lista[0].texto === null;
        return (
          <div className="ck-tarefa" key={t.id}>
            {unico ? <><ItemLinha i={lista[0]} rotulo={t.titulo} nomes={nomes} editavel={editavel} alternar={alternar} prio={t.prioridade} /><Resp t={t} /></>
              : <>
                <h4>{t.titulo}{t.prioridade !== 'Baixa' && <span className={`ck-prio ${t.prioridade}`}>{t.prioridade}</span>}</h4>
                {t.descricao && <p>{t.descricao}</p>}
                <Resp t={t} />
                {lista.map((i) => <ItemLinha key={i.id} i={i} rotulo={i.texto ?? t.titulo} nomes={nomes} editavel={editavel} alternar={alternar} />)}
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
