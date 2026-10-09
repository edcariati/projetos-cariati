import { useState } from 'react';
import { Link } from 'react-router-dom';
import { NOTA_PARCEIRO, ESTUDOS, etapasDe, flagsDe, juntarAprovacoes, lerAprovacoes, nomeServico, perfilPorId, perfilSugerido, semFluxo, useCatalogo } from '../lib/servicos';
import { TIPOS_APROVACAO } from '../lib/labels';

/** `entregas`: entregas do perfil que vão ser feitas (null = todas as do perfil); inclui itens avulsos acrescentados à mão. */
export interface Escolha { perfil: string; ids: string[]; estudo: string; aprovacao: string; obs: string; entregas?: string[] | null; premium?: boolean }

export const entregasDe = (v: Escolha) => v.entregas ?? perfilPorId(v.perfil)?.entregas ?? [];

/** Escolha do perfil e dos serviços que serão entregues ao cliente. O perfil traz as entregas já marcadas: dá para tirar ou acrescentar conforme o contrato. */
export function EscolherServicos({ v, aoMudar, metragem, desabilitado }: { v: Escolha; aoMudar: (e: Escolha) => void; metragem?: number; desabilitado?: boolean }) {
  const cat = useCatalogo();
  const [avulso, setAvulso] = useState('');
  const perfil = perfilPorId(v.perfil);
  const sugerido = metragem ? perfilSugerido(metragem) : null;
  const alterna = (id: string) => aoMudar({ ...v, ids: v.ids.includes(id) ? v.ids.filter((x) => x !== id) : [...v.ids, id] });
  const escolhePerfil = (id: string) => aoMudar({ ...v, perfil: id, estudo: perfilPorId(id)?.estudo ?? v.estudo, entregas: null });
  const f = flagsDe(v.ids, v.perfil);
  const atuais = entregasDe(v);
  const todasDoPerfil = perfil?.entregas ?? [];
  const avulsas = atuais.filter((e) => !todasDoPerfil.includes(e));
  const alternaEntrega = (e: string) => aoMudar({ ...v, entregas: atuais.includes(e) ? atuais.filter((x) => x !== e) : [...atuais, e] });
  const aprovs = lerAprovacoes(v.aprovacao);
  const alternaAprov = (t: string) => aoMudar({ ...v, aprovacao: juntarAprovacoes(aprovs.includes(t) ? aprovs.filter((x) => x !== t) : [...aprovs, t]) });
  const marcarCategoria = (c: typeof cat.categorias[number], tudo: boolean) => {
    const ids = c.itens.filter((x) => x.ativo).map((x) => x.id);
    aoMudar({ ...v, ids: tudo ? [...new Set([...v.ids, ...ids])] : v.ids.filter((x) => !ids.includes(x)) });
  };
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
          <div className="entregas-cab">
            <b>Entregas do {perfil.nome} · {perfil.faixa}</b>
            <span className="mudo pequeno">{atuais.length} de {todasDoPerfil.length + avulsas.length} marcadas</span>
            <button type="button" className="link" disabled={desabilitado} onClick={() => aoMudar({ ...v, entregas: null })}>Marcar todas</button>
            <button type="button" className="link" disabled={desabilitado} onClick={() => aoMudar({ ...v, entregas: [] })}>Limpar</button>
          </div>
          <p className="mudo pequeno" style={{ margin: 0 }}>Tire o que não entrou no contrato ou acrescente itens avulsos. O sistema usa esta lista para montar as tarefas e mostrar as entregas do projeto.</p>
          <ul className="entregas-marcar">
            {[...todasDoPerfil, ...avulsas].map((e) => (
              <li key={e}><label className="check"><input type="checkbox" disabled={desabilitado} checked={atuais.includes(e)} onChange={() => alternaEntrega(e)} />{e}{!todasDoPerfil.includes(e) && <span className="tag">avulso</span>}</label></li>
            ))}
          </ul>
          <div className="cab-aba" style={{ marginBottom: 0 }}>
            <input aria-label="Entrega avulsa" placeholder="Acrescentar uma entrega avulsa…" value={avulso} disabled={desabilitado} onChange={(e) => setAvulso(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const t = avulso.trim(); if (t && !atuais.includes(t)) { aoMudar({ ...v, entregas: [...atuais, t] }); setAvulso(''); } } }} />
            <button type="button" disabled={desabilitado || !avulso.trim()} onClick={() => { const t = avulso.trim(); if (t && !atuais.includes(t)) { aoMudar({ ...v, entregas: [...atuais, t] }); setAvulso(''); } }}>+ Acrescentar</button>
          </div>
          <div className="servico-estudo" role="radiogroup" aria-label="Tipo de estudo preliminar">
            {ESTUDOS.map((e) => (
              <label className="check" key={e.id}><input type="radio" name="estudo" disabled={desabilitado} checked={(v.estudo || perfil.estudo) === e.id} onChange={() => aoMudar({ ...v, estudo: e.id })} />
                <span><b>{e.nome}</b> <span className="mudo pequeno">{e.desc}</span></span></label>
            ))}
          </div>
        </div>
      )}

      <h3 style={{ margin: '8px 0 0' }}>Serviços adicionais do catálogo</h3>
      <p className="mudo pequeno" style={{ margin: 0 }}>Marque o que for contratado além das entregas do perfil. Use “Marcar todos” para incluir o serviço completo e depois tire o que não entrou.</p>
      {cat.categorias.filter((c) => c.ativo || v.ids.some((i) => i.startsWith(c.id + '-'))).map((c) => {
        const marcados = v.ids.filter((i) => i.startsWith(c.id + '-')).length;
        const visiveis = c.itens.filter((x) => x.ativo || v.ids.includes(x.id));
        return (
          <details className={`servico cat${marcados ? ' on' : ''}`} key={c.id} open={marcados > 0}>
            <summary><b>{c.nome}</b> <span className="badge">{marcados ? `${marcados} de ${visiveis.length}` : visiveis.length}</span>{c.execucao === 'parceiro' && <span className="tag parceiro">Parceiro executa</span>}</summary>
            <div className="acoes" style={{ marginTop: 'var(--sp-2)' }}>
              <button type="button" disabled={desabilitado} onClick={() => marcarCategoria(c, true)}>Marcar todos</button>
              <button type="button" disabled={desabilitado || !marcados} onClick={() => marcarCategoria(c, false)}>Limpar</button>
            </div>
            <div className="cat-itens">
              {visiveis.map((x) => <label className="check" key={x.id}><input type="checkbox" disabled={desabilitado} checked={v.ids.includes(x.id)} onChange={() => alterna(x.id)} />{x.nome}{!x.ativo && <span className="tag">desativado</span>}</label>)}
            </div>
          </details>
        );
      })}
      {f.legal && (
        <fieldset className="servico-extra" style={{ margin: 0, maxWidth: 'none' }}>
          <legend>Tipo de aprovação na Prefeitura (pode marcar mais de um, ex.: unificação + residencial)</legend>
          <div className="etiquetas">{TIPOS_APROVACAO.map((t) => <label className="check" key={t}><input type="checkbox" disabled={desabilitado} checked={aprovs.includes(t)} onChange={() => alternaAprov(t)} />{t}</label>)}</div>
        </fieldset>
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
  const entregas = entregasDe(v);
  const grupos = cat.categorias.map((c) => ({ c, itens: v.ids.filter((i) => i.startsWith(c.id + '-')).map((i) => nomeServico(i).nome) })).filter((g) => g.itens.length);
  const pend = semFluxo(v.ids);
  const aprovs = lerAprovacoes(v.aprovacao);
  return (
    <section className="card resumo-servicos" aria-label={titulo}>
      <h2>{titulo} <span className="badge">{(perfil ? 1 : 0) + grupos.length}</span></h2>
      {v.premium && <p className="aviso" style={{ marginTop: 0 }}>Cliente <b>Premium</b>: inclui a entrega do pendrive com os documentos do projeto.</p>}
      <ul className="servicos-resumo">
        <li>
          <b>Projeto arquitetônico</b>{perfil ? <span className="tag">{perfil.nome} · {perfil.faixa}</span> : <span className="tag">perfil não escolhido</span>}{estudo && <span className="tag">{estudo.nome}</span>}
          {perfil ? <ul>{entregas.map((e) => <li key={e}>{e}</li>)}{entregas.length === 0 && <li className="mudo">Nenhuma entrega marcada</li>}</ul> : <p className="mudo pequeno">Escolha o perfil para listar as entregas.</p>}
        </li>
        {grupos.map(({ c, itens }) => (
          <li key={c.id}><b>{c.nome}</b>{c.id === 'prefeitura' && aprovs.length > 0 && <span className="tag">aprovação {aprovs.join(' + ')}</span>}
            {c.execucao === 'parceiro' && <span className="tag parceiro">Parceiro executa</span>}
            <ul>{itens.map((e) => <li key={e}>{e}</li>)}</ul>
            {c.execucao === 'parceiro' && <p className="nota-parceiro">{NOTA_PARCEIRO}</p>}</li>
        ))}
      </ul>
      {flagsDe(v.ids, v.perfil).legal && aprovs.length > 0 && !grupos.some((g) => g.c.id === 'prefeitura') && <p className="mudo pequeno">Aprovação na Prefeitura: {aprovs.join(' + ')}.</p>}
      <p className="mudo pequeno">{!cliente && <>{etapas} etapas no fluxo.</>}{v.obs && <> Combinado: {v.obs}</>}</p>
      {!cliente && pend.length > 0 && <p className="mudo pequeno">Sem etapas próprias no fluxo ainda (ficam só registradas no cadastro): {pend.map((c) => c.nome).join(', ')}.</p>}
      {editar && <p style={{ margin: 0 }}><Link to={editar}>Ver ou alterar os serviços →</Link></p>}
    </section>
  );
}
