import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ETAPAS_BASE, useCatalogo } from '../lib/servicos';
import Icone from '../ui/Icone';
import { usePerfil } from '../lib/perfil';
import { EditarCategoria, FluxoCategoria } from '../components/EditarServico';

const ETAPA_ROTULO: Record<string, string> = { '16': 'Projeto legal', '17': 'Estudo de interiores', '18': 'Detalhamento de interiores', '19': 'Projetos complementares', H1: 'Habite-se: documentos', H2: 'Habite-se: Prefeitura', H3: 'Habite-se: entrega' };

/** Catálogo de serviços do escritório e entregas de cada perfil (consulta). */
export default function Servicos() {
  const eu = usePerfil();
  const { categorias: CATEGORIAS, perfis, doBanco } = useCatalogo();
  const PERFIS = perfis.filter((p) => p.ativo);
  const admin = eu.perfil === 'admin';
  const [editando, setEditando] = useState<{ id: string; modo: 'editar' | 'fluxo' } | null>(null);
  const aberta = editando ? CATEGORIAS.find((c) => c.id === editando.id) : undefined;
  const [aba, setAba] = useState<'catalogo' | 'perfis' | 'fluxo'>('catalogo');
  const total = CATEGORIAS.reduce((s, c) => s + c.itens.filter((x) => x.ativo).length, 0);
  return (
    <>
      <div className="titulo">
        <div><h1>Serviços</h1><p className="mudo pequeno" style={{ margin: '2px 0 0' }}>{CATEGORIAS.length} categorias · {total} serviços · {PERFIS.length} perfis de cliente</p></div>
        <div className="acoes" style={{ marginTop: 0 }}>{eu.perfil === 'admin' && <Link className="btn" to="/cadastros/servicos">Editar catálogo e perfis</Link>}<Link className="primario btn" to="/clientes/novo">+ Novo cliente</Link></div>
      </div>
      <div className="vistas" role="tablist" aria-label="Serviços" style={{ marginLeft: 0, marginBottom: 'var(--sp-4)' }}>
        <button role="tab" aria-selected={aba === 'catalogo'} className={aba === 'catalogo' ? 'on' : ''} onClick={() => setAba('catalogo')}>Catálogo</button>
        <button role="tab" aria-selected={aba === 'perfis'} className={aba === 'perfis' ? 'on' : ''} onClick={() => setAba('perfis')}>Entregas por perfil</button>
        <button role="tab" aria-selected={aba === 'fluxo'} className={aba === 'fluxo' ? 'on' : ''} onClick={() => setAba('fluxo')}>Fluxo de cada serviço</button>
      </div>

      {aba === 'catalogo' && (
        <div className="viz-grid">
          {CATEGORIAS.filter((c) => c.ativo).map((c) => (
            <section className="card viz-card" key={c.id}>
              <div className="viz-cab"><div><h2>{c.nome}</h2><p className="mudo pequeno">{c.itens.filter((x) => x.ativo).length} serviços · {c.id === 'arq' ? 'fluxo base' : c.etapas.length ? `no fluxo: etapa${c.etapas.length > 1 ? 's' : ''} ${c.etapas.join(', ')}` : 'só cadastro (fora do fluxo)'}</p></div></div>
              {admin && <div className="acoes" style={{ marginTop: 0, marginBottom: 'var(--sp-2)' }}>
                <button onClick={() => setEditando({ id: c.id, modo: 'editar' })} disabled={!doBanco} title={doBanco ? '' : 'Rode o atualizar_0019.sql no Supabase para liberar a edição'}>Editar</button>
                {c.id !== 'arq' && <button className="primario" onClick={() => setEditando({ id: c.id, modo: 'fluxo' })} disabled={!doBanco} title={doBanco ? '' : 'Rode o atualizar_0019.sql no Supabase para liberar a edição'}>{c.etapas.length ? 'Alterar no fluxo' : 'Colocar no fluxo'}</button>}
              </div>}
              <ol className="catalogo-itens">{c.itens.filter((x) => x.ativo).map((x, i) => <li key={x.id}><i>{String(i + 1).padStart(2, '0')}</i>{x.nome}</li>)}</ol>
            </section>
          ))}
        </div>
      )}

      {aba === 'perfis' && (
        <>
          <p className="mudo">Checklist padrão da proposta, conforme o perfil do cliente (por metragem). D e E são projetos a partir do croqui do cliente.</p>
          <div className="viz-grid">
            {PERFIS.map((p) => (
              <section className="card viz-card" key={p.id}>
                <div className="viz-cab"><div><h2>{p.nome}</h2><p className="mudo pequeno">{p.faixa} · {p.entregas.length} entregas</p></div><span className="tag">{p.estudo === 'mais_projetos' ? '+ Projetos' : 'Construção nova'}</span></div>
                <ol className="catalogo-itens">{p.entregas.map((e, i) => <li key={e}><i>{String(i + 1).padStart(2, '0')}</i>{e}</li>)}</ol>
              </section>
            ))}
          </div>
        </>
      )}

      {aba === 'fluxo' && (
        <section className="card">
          <h2>Como cada serviço entra no fluxo de atendimento</h2>
          <p className="mudo pequeno">Todo cliente passa pelas etapas base ({ETAPAS_BASE.length} etapas: briefing, estudos, projeto arquitetônico, entrega e encerramento). Cada categoria acrescenta etapas quando é contratada.</p>
          <div className="viz-tab">
            <table className="tab-projetos">
              <thead><tr><th>Categoria</th><th>Serviços</th><th>Etapas acrescentadas ao fluxo</th>{admin && <th></th>}</tr></thead>
              <tbody>
                {CATEGORIAS.filter((c) => c.ativo).map((c) => {
                  const et = c.id === 'prefeitura' ? ['16', 'H1', 'H2', 'H3'] : c.etapas;
                  return (
                    <tr key={c.id}>
                      <td><b>{c.nome}</b></td><td>{c.itens.filter((x) => x.ativo).length}</td>
                      <td>{c.id === 'arq' ? <span className="mudo">fluxo base</span> : et.length ? et.map((e) => `${e} ${ETAPA_ROTULO[e] ?? ''}`.trim()).join(' · ') : <span className="situ atrasada"><Icone n="alerta" tam={14} /> ainda sem etapas próprias</span>}</td>
                      {admin && <td className="dir">{c.id !== 'arq' && <button onClick={() => setEditando({ id: c.id, modo: 'fluxo' })} disabled={!doBanco}>{c.etapas.length ? 'Alterar' : 'Colocar no fluxo'}</button>}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {aberta && editando?.modo === 'editar' && <EditarCategoria c={aberta} aoFechar={() => setEditando(null)} />}
      {aberta && editando?.modo === 'fluxo' && <FluxoCategoria c={aberta} aoFechar={() => setEditando(null)} />}
    </>
  );
}
