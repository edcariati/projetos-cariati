import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Protocolo, ProtocoloStatus } from '../lib/types';
import { PROTOCOLO_STATUS, ehInterno } from '../lib/labels';
import ProtocoloItem from '../components/ProtocoloItem';
import { Carregando, Vazio } from '../ui/Holo';

export default function Protocolos() {
  const [lista, setLista] = useState<Protocolo[]>([]);
  const [filtro, setFiltro] = useState<ProtocoloStatus | 'abertos' | 'todos'>('abertos');

  const carregar = useCallback(() => {
    supabase.from('protocolos').select('*, projetos(nome, clientes(nome))')
      .order('prazo', { ascending: true, nullsFirst: false })
      .then(({ data }) => setLista((data as Protocolo[]) ?? []));
  }, []);
  useEffect(carregar, [carregar]);

  const visiveis = lista.filter((p) =>
    filtro === 'todos' ? true : filtro === 'abertos' ? p.status !== 'entregue_ao_cliente' : p.status === filtro);

  return (
    <>
      <div className="titulo"><h1>Protocolos</h1></div>
      <p className="mudo">Acompanhamento de protocolos junto à Prefeitura, condomínio, Receita Federal, cartórios e outros órgãos (externos), separados dos protocolos internos de entrega de projeto e de pausa. Para criar um novo, abra o projeto.</p>
      <div className="filtros">
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)}>
          <option value="abertos">Em aberto</option>
          <option value="todos">Todos</option>
          {Object.entries(PROTOCOLO_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {visiveis.length === 0 && <Vazio titulo="Nenhum protocolo por aqui" texto="Protocolos na Prefeitura, condomínio e outros órgãos aparecem quando forem registrados num projeto." icone="protocolos" />}
      {[['Externos — junto a órgãos', visiveis.filter((p) => !ehInterno(p.tipo))], ['Internos — processo com o cliente (entrega de projeto, pausa)', visiveis.filter((p) => ehInterno(p.tipo))]].map(([titulo, itens]) => (
        (itens as Protocolo[]).length > 0 && (
          <section key={titulo as string}>
            <h2>{titulo as string} <span className="mudo pequeno">({(itens as Protocolo[]).length})</span></h2>
            <div className="pilha">{(itens as Protocolo[]).map((p) => <ProtocoloItem key={p.id} p={p} onChange={carregar} mostrarProjeto />)}</div>
          </section>
        )
      ))}
    </>
  );
}
