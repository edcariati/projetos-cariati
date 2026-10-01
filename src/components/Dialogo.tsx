import { useEffect, useState } from 'react';

interface Pedido { msg: string; input: boolean; resolve: (v: string | boolean | null) => void }
let abrir: ((p: Pedido) => void) | null = null;

/** Substituem prompt() e confirm(), que alguns navegadores e telas embutidas bloqueiam. */
export const pedirTexto = (msg: string) =>
  new Promise<string | null>((res) => (abrir ? abrir({ msg, input: true, resolve: res as Pedido['resolve'] }) : res(window.prompt(msg))));
export const confirmar = (msg: string) =>
  new Promise<boolean>((res) => (abrir ? abrir({ msg, input: false, resolve: res as Pedido['resolve'] }) : res(window.confirm(msg))));

export function DialogHost() {
  const [p, setP] = useState<Pedido | null>(null);
  const [txt, setTxt] = useState('');
  useEffect(() => { abrir = (x) => { setTxt(''); setP(x); }; return () => { abrir = null; }; }, []);
  if (!p) return null;
  const fechar = (v: string | boolean | null) => { p.resolve(v); setP(null); };
  return (
    <div className="modal" role="dialog" aria-modal="true">
      <form className="card" onSubmit={(e) => { e.preventDefault(); fechar(p.input ? txt.trim() || null : true); }}>
        <p>{p.msg}</p>
        {p.input && <input id="dialogo-texto" autoFocus value={txt} onChange={(e) => setTxt(e.target.value)} />}
        <div className="acoes">
          <button className="primario">OK</button>
          <button type="button" onClick={() => fechar(p.input ? null : false)}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}
