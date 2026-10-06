import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Profile } from '../lib/types';
import Icone from './Icone';
import { itensMenu } from './menu';
import { useIndice } from './indice';

interface Opcao { id: string; rotulo: string; sub?: string; icone: string; grupo: string; to: string }
const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Busca global (Ctrl/Cmd + K): páginas, ações rápidas, projetos e clientes. */
export default function Paleta({ eu, aberta, aoFechar }: { eu: Profile; aberta: boolean; aoFechar: () => void }) {
  const nav = useNavigate();
  const indice = useIndice(aberta);
  const [q, setQ] = useState('');
  const [ativo, setAtivo] = useState(0);
  const campo = useRef<HTMLInputElement>(null);
  const admin = eu.perfil === 'admin';

  const todas = useMemo<Opcao[]>(() => {
    const o: Opcao[] = itensMenu(eu).map((i) => ({ id: 'p' + i.to, rotulo: i.rotulo, icone: i.icone, grupo: 'Ir para', to: i.to }));
    o.push({ id: 'a1', rotulo: 'Novo projeto', icone: 'mais', grupo: 'Ações rápidas', to: '/projetos/novo' }, { id: 'a2', rotulo: 'Novo cliente', icone: 'mais', grupo: 'Ações rápidas', to: '/clientes/novo' });
    if (admin) o.push({ id: 'a3', rotulo: 'Cadastrar acesso (login e senha)', icone: 'usuario', grupo: 'Ações rápidas', to: '/cadastros/usuarios' }, { id: 'a4', rotulo: 'Cadastrar parceiro', icone: 'cadastros', grupo: 'Ações rápidas', to: '/cadastros/parceiros' });
    o.push({ id: 'a5', rotulo: 'Minha conta', icone: 'usuario', grupo: 'Ações rápidas', to: '/conta' });
    for (const p of indice?.projetos ?? []) o.push({ id: 'j' + p.id, rotulo: p.nome, sub: p.cliente, icone: 'projetos', grupo: 'Projetos', to: `/projetos/${p.id}` });
    for (const c of indice?.clientes ?? []) o.push({ id: 'c' + c.id, rotulo: c.nome, icone: 'clientes', grupo: 'Clientes', to: `/clientes/${c.id}` });
    return o;
  }, [eu, admin, indice]);

  const lista = useMemo(() => {
    const t = sem(q.trim());
    const f = t ? todas.filter((x) => sem(`${x.rotulo} ${x.sub ?? ''}`).includes(t)) : todas.filter((x) => x.grupo !== 'Projetos' && x.grupo !== 'Clientes');
    const por: Record<string, number> = {};
    return f.filter((x) => (por[x.grupo] = (por[x.grupo] ?? 0) + 1) <= 6);
  }, [q, todas]);

  useEffect(() => { if (aberta) { setQ(''); setAtivo(0); setTimeout(() => campo.current?.focus(), 30); } }, [aberta]);
  useEffect(() => { setAtivo(0); }, [q]);
  useEffect(() => { document.getElementById(`op-${ativo}`)?.scrollIntoView({ block: 'nearest' }); }, [ativo]);
  if (!aberta) return null;

  const ir = (o?: Opcao) => { if (o) { aoFechar(); nav(o.to); } };
  const tecla = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') aoFechar();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo((a) => Math.min(lista.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); ir(lista[ativo]); }
  };
  let grupoAnterior = '';
  return (
    <div className="paleta-fundo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className="paleta" role="dialog" aria-modal="true" aria-label="Busca global" onKeyDown={tecla}>
        <div className="paleta-campo">
          <Icone n="busca" />
          <input ref={campo} id="paleta-busca" role="combobox" aria-expanded="true" aria-controls="paleta-lista" aria-activedescendant={lista[ativo] ? `op-${ativo}` : undefined}
            placeholder="Buscar projeto, cliente, página ou ação…" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
          <kbd>Esc</kbd>
        </div>
        <ul id="paleta-lista" role="listbox" aria-label="Resultados">
          {lista.map((o, i) => {
            const cab = o.grupo !== grupoAnterior; grupoAnterior = o.grupo;
            return (
              <li key={o.id} role="presentation">
                {cab && <span className="paleta-grupo">{o.grupo}</span>}
                <button id={`op-${i}`} role="option" aria-selected={i === ativo} className={i === ativo ? 'on' : ''} onMouseEnter={() => setAtivo(i)} onClick={() => ir(o)}>
                  <Icone n={o.icone} /><span>{o.rotulo}{o.sub && <em> · {o.sub}</em>}</span>
                </button>
              </li>
            );
          })}
          {lista.length === 0 && <li className="paleta-vazio">Nada encontrado para “{q}”. Tente o nome do cliente ou do projeto.</li>}
        </ul>
        <div className="paleta-rodape"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> abrir</span></div>
      </div>
    </div>
  );
}
