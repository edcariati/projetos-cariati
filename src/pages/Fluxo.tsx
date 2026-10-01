import { useEffect, useRef } from 'react';
import html from '../fluxo/fluxo.html?raw';
import { iniciarFluxo } from '../fluxo/iniciar';
import '../fluxo/fluxo.css';

/** Fluxo do Setor de Projetos: mapa, etapas, regras e índice de documentos (material de consulta). */
export default function Fluxo() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const raiz = ref.current!;
    raiz.innerHTML = html;
    return iniciarFluxo(raiz);
  }, []);
  return <div className="fluxo" ref={ref} />;
}
