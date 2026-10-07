import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { carregarCatalogo, type Categoria } from '../lib/servicos';
import { avisar } from '../ui/avisos';

/** Etapas opcionais do fluxo em que uma categoria de serviço pode entrar. */
export const ETAPAS_OPCIONAIS: { cod: string[]; rotulo: string; desc: string }[] = [
  { cod: ['16'], rotulo: 'Projeto legal', desc: 'Etapa 16 · elaboração e protocolo para aprovação na Prefeitura' },
  { cod: ['17', '18'], rotulo: 'Interiores', desc: 'Etapas 17 e 18 · estudo e detalhamento de interiores' },
  { cod: ['19'], rotulo: 'Projetos complementares', desc: 'Etapa 19 · pontos técnicos, projetos dos parceiros e compatibilização' },
  { cod: ['H1', 'H2', 'H3'], rotulo: 'Habite-se', desc: 'Etapas H1 a H3 · documentos, Prefeitura e entrega' },
];

async function gravar(fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
  const { error } = await fn();
  if (error) { avisar(error.message, { tipo: 'erro' }); return false; }
  await carregarCatalogo(true); avisar(ok); return true;
}

/** Janela “Colocar no fluxo”: escolhe em quais etapas do fluxo de atendimento a categoria entra. */
export function FluxoCategoria({ c, aoFechar }: { c: Categoria; aoFechar: () => void }) {
  const [sel, setSel] = useState<string[]>(c.etapas);
  const [busy, setBusy] = useState(false);
  const alterna = (cod: string[]) => setSel((s) => (cod.every((x) => s.includes(x)) ? s.filter((x) => !cod.includes(x)) : [...new Set([...s, ...cod])]));
  async function salvar() {
    setBusy(true);
    const ok = await gravar(() => supabase.from('servico_categorias').update({ etapas: sel }).eq('id', c.id), `${c.nome}: fluxo atualizado.`);
    setBusy(false); if (ok) aoFechar();
  }
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={`Colocar ${c.nome} no fluxo`} onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <form className="card" onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
        <h2 style={{ margin: 0 }}>Colocar no fluxo</h2>
        <p className="mudo pequeno" style={{ margin: 0 }}><b>{c.nome}</b>: quando o cliente contratar algum serviço desta categoria, o projeto passa por estas etapas além do fluxo base.</p>
        {ETAPAS_OPCIONAIS.map((e) => (
          <label className="check servico-op" key={e.rotulo}>
            <input type="checkbox" checked={e.cod.every((x) => sel.includes(x))} onChange={() => alterna(e.cod)} />
            <span><b>{e.rotulo}</b><br /><span className="mudo pequeno">{e.desc}</span></span>
          </label>
        ))}
        <p className="mudo pequeno" style={{ margin: 0 }}>{sel.length ? '' : 'Sem marcação, o serviço fica só registrado no cadastro do cliente. '}Etapas totalmente novas (com tarefas próprias) precisam da sequência de cada uma: me passe e eu crio.</p>
        <div className="acoes"><button className="primario" disabled={busy}>{busy ? 'Salvando…' : 'Salvar fluxo'}</button><button type="button" onClick={aoFechar}>Cancelar</button></div>
      </form>
    </div>
  );
}

/** Janela “Editar”: nome da categoria e dos serviços, desativar e incluir. */
export function EditarCategoria({ c, aoFechar }: { c: Categoria; aoFechar: () => void }) {
  const [novo, setNovo] = useState('');
  async function renomearCat(v: string) { v = v.trim(); if (v && v !== c.nome) await gravar(() => supabase.from('servico_categorias').update({ nome: v }).eq('id', c.id), 'Nome da categoria atualizado.'); }
  async function renomear(id: string, atual: string, v: string) { v = v.trim(); if (v && v !== atual) await gravar(() => supabase.from('servico_itens').update({ nome: v }).eq('id', id), 'Serviço atualizado.'); }
  async function adicionar() {
    const nome = novo.trim(); if (!nome) return;
    const maior = c.itens.reduce((m, x) => Math.max(m, Number(x.id.split('-')[1]) || 0), 0);
    if (await gravar(() => supabase.from('servico_itens').insert({ id: `${c.id}-${String(maior + 1).padStart(2, '0')}`, categoria_id: c.id, nome, ordem: c.itens.length + 1 }), `Serviço “${nome}” incluído.`)) setNovo('');
  }
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={`Editar ${c.nome}`} onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className="card modal-largo">
        <h2 style={{ margin: 0 }}>Editar serviços</h2>
        <label>Categoria<input defaultValue={c.nome} onBlur={(e) => renomearCat(e.target.value)} /></label>
        <ul className="cad-itens modal-itens">
          {c.itens.map((x) => (
            <li key={x.id} className={x.ativo ? '' : 'inativa'}>
              <input aria-label={`Nome do serviço ${x.nome}`} defaultValue={x.nome} onBlur={(e) => renomear(x.id, x.nome, e.target.value)} />
              <button onClick={() => gravar(() => supabase.from('servico_itens').update({ ativo: !x.ativo }).eq('id', x.id), x.ativo ? 'Serviço desativado.' : 'Serviço reativado.')}>{x.ativo ? 'Desativar' : 'Reativar'}</button>
            </li>
          ))}
        </ul>
        <div className="cab-aba" style={{ marginBottom: 0 }}>
          <input placeholder="Novo serviço…" value={novo} onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && adicionar()} />
          <button className="primario" onClick={adicionar}>+ Adicionar</button>
        </div>
        <div className="acoes"><button onClick={aoFechar}>Concluir</button></div>
      </div>
    </div>
  );
}
