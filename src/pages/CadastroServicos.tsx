import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { carregarCatalogo, useCatalogo, type Categoria, type Perfil } from '../lib/servicos';
import { ESTUDOS } from '../lib/servicos';
import { confirmar } from '../components/Dialogo';
import { avisar } from '../ui/avisos';
import Icone from '../ui/Icone';

interface Uso { servicos: string[]; categoria: string | null }

const ETAPAS_FLUXO: { cod: string[]; rotulo: string }[] = [
  { cod: ['16'], rotulo: 'Projeto legal (etapa 16)' }, { cod: ['17', '18'], rotulo: 'Interiores (etapas 17 e 18)' }, { cod: ['19'], rotulo: 'Complementares (etapa 19)' }, { cod: ['H1', 'H2', 'H3'], rotulo: 'Habite-se (etapas H1 a H3)' },
];
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 12);

/** Editor do catálogo de serviços e dos perfis (só o administrador). */
export default function AbaServicos() {
  const cat = useCatalogo();
  const [sub, setSub] = useState<'servicos' | 'perfis'>('servicos');
  const [uso, setUso] = useState<Uso[]>([]);
  const [erro, setErro] = useState('');

  useEffect(() => { supabase.from('clientes').select('servicos,categoria').then(({ data }) => setUso((data as Uso[]) ?? [])); }, []);
  const usoItem = useMemo(() => { const m = new Map<string, number>(); uso.forEach((c) => (c.servicos ?? []).forEach((i) => m.set(i, (m.get(i) ?? 0) + 1))); return m; }, [uso]);
  const usoPerfil = useMemo(() => { const m = new Map<string, number>(); uso.forEach((c) => c.categoria && m.set(c.categoria, (m.get(c.categoria) ?? 0) + 1)); return m; }, [uso]);

  const gravar = useCallback(async (fn: () => PromiseLike<{ error: { message: string } | null }>, ok?: string) => {
    setErro('');
    const { error } = await fn();
    if (error) { setErro(/relation .* does not exist|schema cache/i.test(error.message) ? 'As tabelas do catálogo ainda não existem no banco. Rode o arquivo atualizar_0019.sql no Supabase.' : error.message); return false; }
    await carregarCatalogo(true); if (ok) avisar(ok); return true;
  }, []);

  if (!cat.doBanco) {
    return (
      <section className="card">
        <h2>Catálogo ainda não está no banco</h2>
        <p>Para editar serviços e perfis aqui, rode no Supabase o arquivo <code>supabase/atualizar_0019.sql</code>. Depois disso esta tela libera a edição. Até lá o app usa o catálogo padrão ({cat.categorias.reduce((s, c) => s + c.itens.length, 0)} serviços e {cat.perfis.length} perfis).</p>
        {erro && <p className="erro" role="alert">{erro}</p>}
      </section>
    );
  }

  return (
    <>
      <div className="vistas" role="tablist" aria-label="Serviços e perfis" style={{ marginLeft: 0, marginBottom: 'var(--sp-4)' }}>
        <button role="tab" aria-selected={sub === 'servicos'} className={sub === 'servicos' ? 'on' : ''} onClick={() => setSub('servicos')}>Serviços</button>
        <button role="tab" aria-selected={sub === 'perfis'} className={sub === 'perfis' ? 'on' : ''} onClick={() => setSub('perfis')}>Perfis e entregas</button>
      </div>
      <p className="mudo pequeno">O que você muda aqui vale para o cadastro de cliente, a confirmação e o novo projeto. Serviço ou perfil que já está em algum cliente não pode ser apagado: desative para sumir das novas escolhas e manter o histórico.</p>
      {erro && <p className="erro" role="alert">{erro}</p>}
      {sub === 'servicos' ? <Servicos categorias={cat.categorias} usoItem={usoItem} gravar={gravar} /> : <Perfis perfis={cat.perfis} usoPerfil={usoPerfil} gravar={gravar} />}
    </>
  );
}

type Gravar = (fn: () => PromiseLike<{ error: { message: string } | null }>, ok?: string) => Promise<boolean>;

function Servicos({ categorias, usoItem, gravar }: { categorias: Categoria[]; usoItem: Map<string, number>; gravar: Gravar }) {
  const [novaCat, setNovaCat] = useState('');
  const [novoItem, setNovoItem] = useState<Record<string, string>>({});

  async function reordenar<T extends { id: string }>(lista: T[], i: number, d: -1 | 1, tabela: string) {
    const j = i + d; if (j < 0 || j >= lista.length) return;
    const nova = [...lista]; [nova[i], nova[j]] = [nova[j], nova[i]];
    await gravar(async () => { for (let k = 0; k < nova.length; k++) { const { error } = await supabase.from(tabela).update({ ordem: k + 1 }).eq('id', nova[k].id); if (error) return { error }; } return { error: null }; });
  }
  async function adicionarItem(c: Categoria) {
    const nome = (novoItem[c.id] ?? '').trim(); if (!nome) return;
    const maior = c.itens.reduce((m, x) => Math.max(m, Number(x.id.split('-')[1]) || 0), 0);
    const id = `${c.id}-${String(maior + 1).padStart(2, '0')}`;
    if (await gravar(() => supabase.from('servico_itens').insert({ id, categoria_id: c.id, nome, ordem: c.itens.length + 1 }), `Serviço “${nome}” incluído.`)) setNovoItem((n) => ({ ...n, [c.id]: '' }));
  }
  async function adicionarCategoria() {
    const nome = novaCat.trim(); if (!nome) return;
    let id = slug(nome) || 'cat'; let n = 2; while (categorias.some((c) => c.id === id)) id = `${slug(nome)}${n++}`;
    if (await gravar(() => supabase.from('servico_categorias').insert({ id, nome, etapas: [], ordem: categorias.length + 1 }), `Categoria “${nome}” criada.`)) setNovaCat('');
  }
  async function excluirItem(c: Categoria, id: string, nome: string) {
    if (!(await confirmar(`Excluir o serviço “${nome}”? Isso não pode ser desfeito.`))) return;
    await gravar(() => supabase.from('servico_itens').delete().eq('id', id), 'Serviço excluído.');
  }
  async function excluirCategoria(c: Categoria) {
    if (!(await confirmar(`Excluir a categoria “${c.nome}” e seus ${c.itens.length} serviços? Isso não pode ser desfeito.`))) return;
    await gravar(() => supabase.from('servico_categorias').delete().eq('id', c.id), 'Categoria excluída.');
  }
  const alternaEtapas = (c: Categoria, cod: string[]) => {
    const tem = cod.every((x) => c.etapas.includes(x));
    const novas = tem ? c.etapas.filter((x) => !cod.includes(x)) : [...new Set([...c.etapas, ...cod])];
    return gravar(() => supabase.from('servico_categorias').update({ etapas: novas }).eq('id', c.id));
  };

  return (
    <>
      {categorias.map((c, ci) => {
        const emUso = c.itens.some((x) => usoItem.get(x.id));
        return (
          <details className={`card cad-cat${c.ativo ? '' : ' inativa'}`} key={c.id} open={ci === 0}>
            <summary><b>{c.nome}</b> <span className="badge">{c.itens.length}</span>{!c.ativo && <span className="tag">desativada</span>}</summary>
            <div className="cad-cat-corpo">
              <div className="duas">
                <label>Nome da categoria<input defaultValue={c.nome} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.nome) void gravar(() => supabase.from('servico_categorias').update({ nome: v }).eq('id', c.id), 'Nome atualizado.'); }} /></label>
                <fieldset><legend>Etapas que este serviço acrescenta ao fluxo</legend>
                  <div className="etiquetas">{ETAPAS_FLUXO.map((e) => (
                    <label className="check" key={e.rotulo}><input type="checkbox" checked={e.cod.every((x) => c.etapas.includes(x))} onChange={() => alternaEtapas(c, e.cod)} />{e.rotulo}</label>
                  ))}</div>
                  <p className="mudo pequeno" style={{ margin: 0 }}>Sem marcação, o serviço fica só registrado no cadastro do cliente.</p>
                </fieldset>
              </div>
              <ul className="cad-itens">
                {c.itens.map((x, i) => (
                  <li key={x.id} className={x.ativo ? '' : 'inativa'}>
                    <input aria-label={`Nome do serviço ${x.nome}`} defaultValue={x.nome} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== x.nome) void gravar(() => supabase.from('servico_itens').update({ nome: v }).eq('id', x.id), 'Serviço atualizado.'); }} />
                    <span className="mudo pequeno" title="Clientes que têm este serviço">{usoItem.get(x.id) ? `${usoItem.get(x.id)} cliente(s)` : 'sem uso'}</span>
                    <button aria-label="Subir" disabled={i === 0} onClick={() => reordenar(c.itens, i, -1, 'servico_itens')}><Icone n="voltar" tam={14} className="gira-cima" /></button>
                    <button aria-label="Descer" disabled={i === c.itens.length - 1} onClick={() => reordenar(c.itens, i, 1, 'servico_itens')}><Icone n="voltar" tam={14} className="gira-baixo" /></button>
                    <button onClick={() => gravar(() => supabase.from('servico_itens').update({ ativo: !x.ativo }).eq('id', x.id))}>{x.ativo ? 'Desativar' : 'Reativar'}</button>
                    <button className="perigo" disabled={!!usoItem.get(x.id)} title={usoItem.get(x.id) ? 'Está em uso: desative em vez de excluir' : 'Excluir'} onClick={() => excluirItem(c, x.id, x.nome)}>Excluir</button>
                  </li>
                ))}
              </ul>
              <div className="cab-aba" style={{ marginBottom: 0 }}>
                <input placeholder="Novo serviço desta categoria…" value={novoItem[c.id] ?? ''} onChange={(e) => setNovoItem((n) => ({ ...n, [c.id]: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && adicionarItem(c)} />
                <button className="primario" onClick={() => adicionarItem(c)}>+ Adicionar serviço</button>
              </div>
              <div className="acoes">
                <button onClick={() => reordenar(categorias, ci, -1, 'servico_categorias')} disabled={ci === 0}>Subir categoria</button>
                <button onClick={() => reordenar(categorias, ci, 1, 'servico_categorias')} disabled={ci === categorias.length - 1}>Descer categoria</button>
                <button onClick={() => gravar(() => supabase.from('servico_categorias').update({ ativo: !c.ativo }).eq('id', c.id))}>{c.ativo ? 'Desativar categoria' : 'Reativar categoria'}</button>
                <button className="perigo" disabled={emUso} title={emUso ? 'Tem serviço em uso: desative em vez de excluir' : ''} onClick={() => excluirCategoria(c)}>Excluir categoria</button>
              </div>
            </div>
          </details>
        );
      })}
      <div className="card cab-aba">
        <input placeholder="Nova categoria de serviço (ex.: Paisagismo)…" value={novaCat} onChange={(e) => setNovaCat(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && adicionarCategoria()} />
        <button className="primario" onClick={adicionarCategoria}>+ Nova categoria</button>
      </div>
    </>
  );
}

function Perfis({ perfis, usoPerfil, gravar }: { perfis: Perfil[]; usoPerfil: Map<string, number>; gravar: Gravar }) {
  const [novo, setNovo] = useState({ id: '', nome: '' });
  async function reordenar(i: number, d: -1 | 1) {
    const j = i + d; if (j < 0 || j >= perfis.length) return;
    const nova = [...perfis]; [nova[i], nova[j]] = [nova[j], nova[i]];
    await gravar(async () => { for (let k = 0; k < nova.length; k++) { const { error } = await supabase.from('perfis_cliente').update({ ordem: k + 1 }).eq('id', nova[k].id); if (error) return { error }; } return { error: null }; });
  }
  async function criar() {
    const id = novo.id.trim().toUpperCase(); const nome = novo.nome.trim() || `Perfil ${id}`;
    if (!id) return;
    if (perfis.some((p) => p.id === id)) return avisar(`Já existe o perfil ${id}.`, { tipo: 'erro' });
    if (await gravar(() => supabase.from('perfis_cliente').insert({ id, nome, ordem: perfis.length + 1 }), `Perfil ${id} criado. Preencha as entregas e salve.`)) setNovo({ id: '', nome: '' });
  }
  return (
    <>
      {perfis.map((p, i) => <PerfilCard key={p.id + JSON.stringify([p.nome, p.faixa, p.entregas, p.estudo, p.area_min, p.area_max, p.sugerir, p.ativo])} p={p} i={i} n={perfis.length} uso={usoPerfil.get(p.id) ?? 0} gravar={gravar} mover={reordenar} />)}
      <div className="card cab-aba">
        <input aria-label="Código do novo perfil" placeholder="Código (ex.: A5)" value={novo.id} onChange={(e) => setNovo({ ...novo, id: e.target.value })} style={{ flex: '0 1 160px' }} />
        <input aria-label="Nome do novo perfil" placeholder="Nome (ex.: Perfil A5)" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && criar()} />
        <button className="primario" onClick={criar}>+ Novo perfil</button>
      </div>
    </>
  );
}

function PerfilCard({ p, i, n, uso, gravar, mover }: { p: Perfil; i: number; n: number; uso: number; gravar: Gravar; mover: (i: number, d: -1 | 1) => Promise<void> }) {
  const [f, setF] = useState({ nome: p.nome, faixa: p.faixa, estudo: p.estudo as string, min: p.area_min === null ? '' : String(p.area_min), max: p.area_max === null ? '' : String(p.area_max), sugerir: p.sugerir, entregas: p.entregas.join('\n') });
  const mudou = f.nome !== p.nome || f.faixa !== p.faixa || f.estudo !== p.estudo || f.min !== (p.area_min === null ? '' : String(p.area_min)) || f.max !== (p.area_max === null ? '' : String(p.area_max)) || f.sugerir !== p.sugerir || f.entregas !== p.entregas.join('\n');
  const lista = f.entregas.split('\n').map((x) => x.trim()).filter(Boolean);
  const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));
  async function salvar() {
    if (!f.nome.trim()) return avisar('Informe o nome do perfil.', { tipo: 'erro' });
    const min = num(f.min), max = num(f.max);
    if ((min !== null && !Number.isFinite(min)) || (max !== null && !Number.isFinite(max))) return avisar('Metragem inválida.', { tipo: 'erro' });
    await gravar(() => supabase.from('perfis_cliente').update({ nome: f.nome.trim(), faixa: f.faixa.trim(), estudo: f.estudo, entregas: lista, area_min: min, area_max: max, sugerir: f.sugerir }).eq('id', p.id), `${f.nome.trim()} salvo.`);
  }
  async function excluir() {
    if (!(await confirmar(`Excluir o ${p.nome}? Isso não pode ser desfeito.`))) return;
    await gravar(() => supabase.from('perfis_cliente').delete().eq('id', p.id), 'Perfil excluído.');
  }
  return (
    <details className={`card cad-cat${p.ativo ? '' : ' inativa'}`} open={i === 0}>
      <summary><b>{p.nome}</b> <span className="mudo pequeno">{p.faixa}</span> <span className="badge">{p.entregas.length} entregas</span>{!p.ativo && <span className="tag">desativado</span>}{uso > 0 && <span className="tag">{uso} cliente(s)</span>}</summary>
      <div className="cad-cat-corpo">
        <div className="duas">
          <label>Nome<input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></label>
          <label>Faixa (texto exibido)<input value={f.faixa} placeholder="Ex.: 150 a 250 m²" onChange={(e) => setF({ ...f, faixa: e.target.value })} /></label>
        </div>
        <div className="duas">
          <label>Metragem mínima (m²)<input inputMode="decimal" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} /></label>
          <label>Metragem máxima (m²)<input inputMode="decimal" value={f.max} placeholder="sem limite" onChange={(e) => setF({ ...f, max: e.target.value })} /></label>
        </div>
        <div className="duas">
          <label>Tipo de estudo<select value={f.estudo} onChange={(e) => setF({ ...f, estudo: e.target.value })}>{ESTUDOS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></label>
          <label className="check sw" style={{ alignSelf: 'end', minHeight: 44 }}><input type="checkbox" checked={f.sugerir} onChange={(e) => setF({ ...f, sugerir: e.target.checked })} />Sugerir este perfil pela metragem</label>
        </div>
        <label>Entregas do perfil <span className="mudo pequeno">(uma por linha · {lista.length} itens)</span>
          <textarea rows={Math.min(14, Math.max(5, lista.length + 1))} value={f.entregas} onChange={(e) => setF({ ...f, entregas: e.target.value })} />
        </label>
        <div className="acoes">
          <button className="primario" disabled={!mudou} onClick={salvar}>Salvar alterações</button>
          <button onClick={() => mover(i, -1)} disabled={i === 0}>Subir</button>
          <button onClick={() => mover(i, 1)} disabled={i === n - 1}>Descer</button>
          <button onClick={() => gravar(() => supabase.from('perfis_cliente').update({ ativo: !p.ativo }).eq('id', p.id))}>{p.ativo ? 'Desativar' : 'Reativar'}</button>
          <button className="perigo" disabled={uso > 0} title={uso > 0 ? 'Há clientes neste perfil: desative em vez de excluir' : ''} onClick={excluir}>Excluir</button>
        </div>
      </div>
    </details>
  );
}
