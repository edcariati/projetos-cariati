import { Link } from 'react-router-dom';
import { ESTUDOS, SERVICOS, SERVICOS_OPCIONAIS, etapasDe, servicoPorId } from '../lib/servicos';
import { TIPOS_APROVACAO } from '../lib/labels';

export interface Escolha { ids: string[]; estudo: string; aprovacao: string; obs: string }

/** Escolha dos serviços que serão entregues ao cliente. O arquitetônico é o serviço-base. */
export function EscolherServicos({ v, aoMudar, desabilitado }: { v: Escolha; aoMudar: (e: Escolha) => void; desabilitado?: boolean }) {
  const alterna = (id: string) => aoMudar({ ...v, ids: v.ids.includes(id) ? v.ids.filter((x) => x !== id) : [...v.ids, id] });
  const base = SERVICOS.find((s) => s.base)!;
  return (
    <div className="servicos-lista">
      <div className="servico on base">
        <div><b>{base.nome}</b> <span className="tag">incluído em todo projeto</span><p className="mudo pequeno">{base.resumo}</p></div>
        <div className="servico-estudo" role="radiogroup" aria-label="Tipo de estudo preliminar">
          {ESTUDOS.map((e) => (
            <label className="check" key={e.id}><input type="radio" name="estudo" disabled={desabilitado} checked={(v.estudo || 'padrao') === e.id} onChange={() => aoMudar({ ...v, estudo: e.id })} />
              <span><b>{e.nome}</b><br /><span className="mudo pequeno">{e.desc}</span></span></label>
          ))}
        </div>
      </div>
      {SERVICOS_OPCIONAIS.map((s) => {
        const on = v.ids.includes(s.id);
        return (
          <div className={`servico${on ? ' on' : ''}`} key={s.id}>
            <label className="check"><input type="checkbox" disabled={desabilitado} checked={on} onChange={() => alterna(s.id)} /><span><b>{s.nome}</b><br /><span className="mudo pequeno">{s.resumo}</span></span></label>
            {on && s.id === 'legal' && (
              <label className="servico-extra">Tipo de aprovação
                <select value={v.aprovacao} disabled={desabilitado} onChange={(e) => aoMudar({ ...v, aprovacao: e.target.value })}><option value="">— escolher depois —</option>{TIPOS_APROVACAO.map((t) => <option key={t}>{t}</option>)}</select>
              </label>
            )}
          </div>
        );
      })}
      <label>Observações sobre o que foi combinado
        <textarea rows={3} disabled={desabilitado} value={v.obs} onChange={(e) => aoMudar({ ...v, obs: e.target.value })} placeholder="Ex.: complementares só elétrico e hidrossanitário; entrega em duas fases…" />
      </label>
    </div>
  );
}

/** O que vamos entregar: usado na confirmação do cadastro e na ficha do cliente. */
export function ResumoServicos({ v, titulo = 'Serviços que vamos entregar', editar }: { v: Escolha; titulo?: string; editar?: string }) {
  const lista = SERVICOS.filter((s) => s.base || v.ids.includes(s.id));
  const estudo = ESTUDOS.find((e) => e.id === (v.estudo || 'padrao'));
  const etapas = etapasDe(v.ids).length;
  return (
    <section className="card resumo-servicos" aria-label={titulo}>
      <h2>{titulo} <span className="badge">{lista.length}</span></h2>
      <ul className="servicos-resumo">
        {lista.map((s) => (
          <li key={s.id}>
            <b>{s.nome}</b>
            {s.base && estudo && <span className="tag">{estudo.nome}</span>}
            {s.id === 'legal' && v.aprovacao && <span className="tag">aprovação {v.aprovacao}</span>}
            <ul>{s.entregas.map((e) => <li key={e}>{e}</li>)}</ul>
          </li>
        ))}
      </ul>
      <p className="mudo pequeno">{etapas} etapas no fluxo deste cliente{v.ids.length === 0 ? ' (só o arquitetônico)' : ''}. {v.obs && <>Combinado: {v.obs}</>}</p>
      {editar && <p style={{ margin: 0 }}><Link to={editar}>Ver ou alterar os serviços →</Link></p>}
      {!servicoPorId('arquitetonico') && null}
    </section>
  );
}
