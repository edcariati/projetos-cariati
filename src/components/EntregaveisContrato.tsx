import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Projeto } from '../lib/types';
import { Entregavel, listaDoContrato, sincronizarEntregaveis } from '../lib/entregaveis';
import { fmtData } from '../lib/labels';
import { nomeServico } from '../lib/servicos';

/**
 * Entregáveis do contrato: a lista que vem do perfil do cliente e dos serviços contratados, dentro do projeto.
 * Quem está produzindo vê o que o cliente contratou e marca cada entrega ao concluir.
 */
export default function EntregaveisContrato({ projeto, editavel, nomes, meuId, aoMudar }: {
  projeto: Projeto; editavel: boolean; nomes: Map<string, string>; meuId: string; aoMudar?: (feitos: number, total: number) => void;
}) {
  const [lista, setLista] = useState<Entregavel[] | null>(null);
  const [indisponivel, setIndisponivel] = useState(false);
  const [editando, setEditando] = useState(false);
  const [novo, setNovo] = useState('');
  const [msg, setMsg] = useState('');
  const contrato = { perfil: projeto.perfil, entregas: projeto.entregas, servicos: projeto.servicos };
  const doContrato = listaDoContrato(contrato);

  const carregar = useCallback(async () => {
    const r = await supabase.from('projeto_entregaveis').select('*').eq('projeto_id', projeto.id).order('ordem');
    if (r.error) { setIndisponivel(true); setLista([]); return; }
    setLista((r.data as Entregavel[]) ?? []);
  }, [projeto.id]);
  useEffect(() => { carregar(); }, [carregar]);

  // projeto novo (ou criado antes desta função): traz o contrato para a lista na primeira vez
  useEffect(() => {
    if (lista && lista.length === 0 && !indisponivel && editavel && doContrato.length > 0) {
      sincronizarEntregaveis(projeto.id, contrato).then((n) => { if (n) carregar(); }).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista?.length, indisponivel, editavel]);

  useEffect(() => { if (lista) aoMudar?.(lista.filter((x) => x.feito).length, lista.length); }, [lista, aoMudar]);

  if (lista === null) return null;
  if (indisponivel) return <section className="card"><h3>Entregáveis do contrato</h3><p className="mudo pequeno">Para acompanhar as entregas do contrato aqui, rode o <b>atualizar_0021.sql</b> no Supabase.</p></section>;
  if (lista.length === 0 && doContrato.length === 0) return null;

  const feitos = lista.filter((x) => x.feito).length;
  const faltam = doContrato.filter((c) => !lista.some((x) => x.texto.trim().toLowerCase() === c.texto.toLowerCase())).length;

  async function alternar(x: Entregavel) {
    const antes = lista!;
    setLista(lista!.map((i) => (i.id === x.id ? { ...i, feito: !x.feito, feito_por: !x.feito ? meuId : null, feito_em: !x.feito ? new Date().toISOString() : null } : i)));
    const { error } = await supabase.from('projeto_entregaveis').update({ feito: !x.feito }).eq('id', x.id);
    if (error) { setLista(antes); setMsg(error.message); }
  }
  async function sincronizar() {
    setMsg('');
    try { const n = await sincronizarEntregaveis(projeto.id, contrato); setMsg(n ? `${n} entrega(s) do contrato acrescentada(s).` : 'A lista já tem tudo o que o contrato prevê.'); carregar(); }
    catch (e) { setMsg((e as Error).message); }
  }
  async function incluir() {
    const texto = novo.trim(); if (!texto) return;
    const { error } = await supabase.from('projeto_entregaveis').insert({ projeto_id: projeto.id, texto, origem: 'avulso', ordem: lista!.reduce((m, x) => Math.max(m, x.ordem), 0) + 1 });
    if (error) return setMsg(error.message);
    setNovo(''); carregar();
  }
  async function excluir(x: Entregavel) {
    const { error } = await supabase.from('projeto_entregaveis').delete().eq('id', x.id);
    if (error) return setMsg(error.message);
    carregar();
  }

  const porOrigem: [string, Entregavel['origem']][] = [['Entregas do perfil', 'perfil'], ['Serviços contratados', 'servico'], ['Acrescentados neste projeto', 'avulso']];
  return (
    <section className="card entregaveis-contrato" aria-label="Entregáveis do contrato">
      <h2>Entregáveis do contrato <span className="badge">{feitos}/{lista.length}</span></h2>
      <div className="barra" role="progressbar" aria-valuenow={lista.length ? Math.round((feitos / lista.length) * 100) : 0} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${lista.length ? (feitos / lista.length) * 100 : 0}%` }} /></div>
      <p className="mudo pequeno">O que este cliente contratou (perfil {projeto.perfil ?? '—'} e serviços escolhidos no cadastro). Marque cada entrega quando ela estiver pronta; o app registra quem fez e a data.</p>
      {porOrigem.map(([titulo, o]) => {
        const itens = lista.filter((x) => x.origem === o);
        if (!itens.length) return null;
        return (
          <div key={o}>
            <h4 className="grupo-etapas">{titulo}</h4>
            <ul className="entregaveis-lista">
              {itens.map((x) => (
                <li key={x.id} className={x.feito ? 'feito' : ''}>
                  <label className="check"><input type="checkbox" checked={x.feito} disabled={!editavel} onChange={() => alternar(x)} />
                    <span>{x.texto}{x.servico_id && <span className="mudo pequeno"> · {nomeServico(x.servico_id).categoria}</span>}</span></label>
                  {x.feito && <span className="mudo pequeno">{x.feito_por ? nomes.get(x.feito_por) ?? '' : ''} {x.feito_em ? fmtData(x.feito_em) : ''}</span>}
                  {editando && editavel && <button className="link perigo" onClick={() => excluir(x)} aria-label={`Excluir ${x.texto}`}>✕ excluir</button>}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {editando && editavel && (
        <div className="nota">
          <input placeholder="Nova entrega deste projeto…" value={novo} onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && incluir()} />
          <button onClick={incluir}>+ Adicionar</button>
        </div>
      )}
      {editavel && (
        <div className="acoes">
          <button onClick={() => setEditando(!editando)}>{editando ? 'Concluir edição' : 'Editar lista'}</button>
          <button onClick={sincronizar} title="Traz do cadastro o que ainda não está na lista">Atualizar com o contrato{faltam ? ` (${faltam} novo${faltam === 1 ? '' : 's'})` : ''}</button>
        </div>
      )}
      {msg && <p className="pequeno mudo" role="status">{msg}</p>}
    </section>
  );
}
