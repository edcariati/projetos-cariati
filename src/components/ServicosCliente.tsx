import { Link } from 'react-router-dom';
import { NOTA_PARCEIRO, ESTUDOS, etapasDe, flagsDe, nomeServico, perfilPorId, perfilSugerido, semFluxo, useCatalogo } from '../lib/servicos';
import { TIPOS_APROVACAO } from '../lib/labels';

export interface Escolha { perfil: string; ids: string[]; estudo: string; aprovacao: string; obs: string }

/** Escolha do perfil e dos serviços que serão entregues ao cliente. */
export function EscolherServicos({ v, aoMudar, metragem, desabilitado }: { v: Escolha; aoMudar: (e: Escolha) => void; metragem?: number; desabilitado?: boolean }) {
  const cat = useCatalogo();
  const perfil = perfilPorId(v.perfil);
  const sugerido = metragem ? perfilSugerido(metragem) : null;
  const alterna = (id: string) => aoMudar({ ...v, ids: v.ids.includes(id) ? v.ids.filter((x) => x !== id) : [...v.ids, id] });
  const escolhePerfil = (id: string) => aoMudar({ ...v, perfil: id, estudo: perfilPorId(id)?.estudo ?? v.estudo });
  const f = flagsDe(v.ids, v.perfil);
  return (
    <div className="servicos-lista">
      <fieldset className="perfis" disabled={desabilitado}>
        <legend>Perfil do cliente (define o que o projeto arquitetônico entrega)</legend>
        <div className="perfis-grade" role="radiogroup" aria-label="Perfil do cliente">
          {cat.perfis.filter((p) => p.ativo || p.id === v.perfil).map((p) => (
            <label key={p.id} className={`perfil-op${v.perfil === p.id ? ' on' : ''}`}>
              <input type="radio" name="perfil" checked={v.perfil === p.id} onChange={() => escolhePerfil(p.id)} />
              <b>{p.nome}</b><span>{p.faixa}</span><em>{p.entregas.length} entregas{sugerido === p.id ? ' · sugerido pela metragem' : ''}</em>
            </label>
          ))}
        </div>
      </fieldset>

      {!perfil && <p className="aviso">Escolha o perfil para ver o que será entregue{v.perfil ? ` (o perfil “${v.perfil}” é antigo: escolha A1, A2, A3 ou A4)` : ''}.</p>}
      {perfil && (
        <div className="servico on">
          <b>Entregas do {perfil.nome} · {perfil.faixa}</b>
          <ul className="entregas">{perfil.entregas.map((e) => <li key={e}>{e}</li>)}</ul>
          <div className="servico-estudo" role="radiogroup" aria-label="Tipo de estudo preliminar">
            {ESTUDOS.map((e) => (
              <label className="check" key={e.id}><input type="radio" name="estudo" disabled={desabilitado} checked={(v.estudo || perfil.estudo) === e.id} onChange={() => aoMudar({ ...v, estudo: e.id })} />
                <span><b>{e.nome}</b> <span className="mudo pequeno">{e.desc}</span></span></label>
            ))}
          </div>
        </div>
      )}

      <h3 style={{ margin: '8px 0 0' }}>Serviços adicionais do catálogo</h3>
      <p className="mudo pequeno" style={{ margin: 0 }}>Marque o que for contratado além das entregas do perfil.</p>
      {cat.categorias.filter((c) => c.ativo || v.ids.some((i) => i.startsWith(c.id + '-'))).map((c) => {
        const marcados = v.ids.filter((i) => i.startsWith(c.id + '-')).length;
        const visiveis = c.itens.filter((x) => x.ativo || v.ids.includes(x.id));
        return (
          <details className={`servico cat${marcados ? ' on' : ''}`} key={c.id} open={marcados > 0}>
            <summary><b>{c.nome}</b> <span className="badge">{marcados ? `${marcados} de ${visiveis.length}` : visiveis.length}</span></summary>
            <div className="cat-itens">
              {visiveis.map((x) => <label className="check" key={x.id}><input type="checkbox" disabled={desabilitado} checked={v.ids.includes(x.id)} onChange={() => alterna(x.id)} />{x.nome}{!x.ativo && <span className="tag">desativado</span>}</label>)}
            </div>
          </details>
        );
      })}
      {f.legal && (
        <label className="servico-extra" style={{ margin: 0 }}>Tipo de aprovação na Prefeitura
          <select value={v.aprovacao} disabled={desabilitado} onChange={(e) => aoMudar({ ...v, aprovacao: e.target.value })}><option value="">— escolher depois —</option>{TIPOS_APROVACAO.map((t) => <option key={t}>{t}</option>)}</select>
        </label>
      )}
      <label>Observações sobre o que foi combinado
        <textarea rows={3} disabled={desabilitado} value={v.obs} onChange={(e) => aoMudar({ ...v, obs: e.target.value })} placeholder="Ex.: só elétrico e hidrossanitário nos complementares; entrega em duas fases…" />
      </label>
    </div>
  );
}

/** O que vamos entregar: usado na confirmação do cadastro e na ficha do cliente. */
export function ResumoServicos({ v, titulo = 'Serviços que vamos entregar', editar, cliente }: { v: Escolha; titulo?: string; editar?: string; cliente?: boolean }) {
  const cat = useCatalogo();
  const perfil = perfilPorId(v.perfil);
  const estudo = ESTUDOS.find((e) => e.id === (v.estudo || perfil?.estudo || 'padrao'));
  const etapas = etapasDe(v.ids, v.perfil).length;
  const grupos = cat.categorias.map((c) => ({ c, itens: v.ids.filter((i) => i.startsWith(c.id + '-')).map((i) => nomeServico(i).nome) })).filter((g) => g.itens.length);
  const pend = semFluxo(v.ids);
  return (
    <section className="card resumo-servicos" aria-label={titulo}>
      <h2>{titulo} <span className="badge">{(perfil ? 1 : 0) + grupos.length}</span></h2>
      <ul className="servicos-resumo">
        <li>
          <b>Projeto arquitetônico</b>{perfil ? <span className="tag">{perfil.nome} · {perfil.faixa}</span> : <span className="tag">perfil não escolhido</span>}{estudo && <span className="tag">{estudo.nome}</span>}
          {perfil ? <ul>{perfil.entregas.map((e) => <li key={e}>{e}</li>)}</ul> : <p className="mudo pequeno">Escolha o perfil para listar as entregas.</p>}
        </li>
        {grupos.map(({ c, itens }) => (
          <li key={c.id}><b>{c.nome}</b>{c.id === 'prefeitura' && v.aprovacao && <span className="tag">aprovação {v.aprovacao}</span>}
            {c.execucao === 'parceiro' && <span className="tag parceiro">Parceiro executa</span>}
            <ul>{itens.map((e) => <li key={e}>{e}</li>)}</ul>
            {c.execucao === 'parceiro' && <p className="nota-parceiro">{NOTA_PARCEIRO}</p>}</li>
        ))}
      </ul>
      <p className="mudo pequeno">{!cliente && <>{etapas} etapas no fluxo.</>}{v.obs && <> Combinado: {v.obs}</>}</p>
      {!cliente && pend.length > 0 && <p className="mudo pequeno">Sem etapas próprias no fluxo ainda (ficam só registradas no cadastro): {pend.map((c) => c.nome).join(', ')}.</p>}
      {editar && <p style={{ margin: 0 }}><Link to={editar}>Ver ou alterar os serviços →</Link></p>}
    </section>
  );
}
