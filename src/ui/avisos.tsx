import { useEffect, useState } from 'react';
import Icone from './Icone';

interface Aviso { id: number; texto: string; tipo: 'ok' | 'erro' | 'info'; acao?: { rotulo: string; fn: () => void } }
let semente = 1;
let empurrar: ((a: Aviso) => void) | null = null;

/** Aviso rápido no canto da tela. Com `acao`, mostra o botão (ex.: Desfazer). */
export function avisar(texto: string, opc: { tipo?: Aviso['tipo']; acao?: Aviso['acao'] } = {}) {
  empurrar?.({ id: semente++, texto, tipo: opc.tipo ?? 'ok', acao: opc.acao });
}

export function AvisosHost() {
  const [lista, setLista] = useState<Aviso[]>([]);
  useEffect(() => {
    empurrar = (a) => { setLista((l) => [...l.slice(-2), a]); setTimeout(() => setLista((l) => l.filter((x) => x.id !== a.id)), a.acao ? 8000 : 4500); };
    return () => { empurrar = null; };
  }, []);
  if (!lista.length) return null;
  return (
    <div className="avisos" aria-live="polite">
      {lista.map((a) => (
        <div className={`aviso-flutua ${a.tipo}`} key={a.id} role={a.tipo === 'erro' ? 'alert' : 'status'}>
          <Icone n={a.tipo === 'ok' ? 'ok' : a.tipo === 'erro' ? 'alerta' : 'info'} />
          <span>{a.texto}</span>
          {a.acao && <button onClick={() => { a.acao!.fn(); setLista((l) => l.filter((x) => x.id !== a.id)); }}>{a.acao.rotulo}</button>}
          <button className="fechar" aria-label="Fechar aviso" onClick={() => setLista((l) => l.filter((x) => x.id !== a.id))}><Icone n="fechar" tam={16} /></button>
        </div>
      ))}
    </div>
  );
}
