import { useEffect, useRef } from 'react';

/** Fundo: luzes desfocadas de entardecer, silhueta de cidade, grade e trilhas de circuito. Só atmosfera. */
export default function Atmosfera() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || matchMedia('(max-width: 640px)').matches) return;
    let raf = 0;
    const mover = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const x = e.clientX / innerWidth - 0.5, y = e.clientY / innerHeight - 0.5;
        ref.current?.style.setProperty('--px', x.toFixed(3)); ref.current?.style.setProperty('--py', y.toFixed(3));
      });
    };
    addEventListener('pointermove', mover, { passive: true });
    return () => { removeEventListener('pointermove', mover); cancelAnimationFrame(raf); };
  }, []);
  return (
    <div className="atmosfera" ref={ref} aria-hidden="true">
      <i className="bk b1" /><i className="bk b2" /><i className="bk b3" /><i className="bk b4" /><i className="bk b5" />
      <div className="grade" />
      <svg className="circuito" viewBox="0 0 600 400" preserveAspectRatio="xMaxYMin slice">
        <g fill="none" stroke="currentColor" strokeWidth="1">
          <path d="M600 60H470l-30 30H350M600 120H520l-24 24H420l-20 20" /><path d="M600 200H540l-40 40H430V300H360" /><path d="M470 0v50l30 30h60" /><path d="M380 0v90" />
        </g>
        <g fill="currentColor"><circle cx="350" cy="90" r="3" /><circle cx="400" cy="164" r="3" /><circle cx="360" cy="300" r="3" /><circle cx="380" cy="90" r="3" /><circle cx="560" cy="80" r="3" /></g>
      </svg>
      <svg className="cidade" viewBox="0 0 1200 200" preserveAspectRatio="xMidYMax slice">
        <path fill="currentColor" d="M0 200V150h40v-30h30v30h30v-60h40v60h20v-90h50v90h30v-40h40v40h30v-70h36v70h30v-110h54v110h30v-50h40v50h24v-80h40v80h30v-30h50v30h30v-100h46v100h30v-60h40v60h34v-40h40v40h30v-90h50v90h30v-50h40v50h40v-70h40v70h30v-30h50v30h24V200z" />
      </svg>
    </div>
  );
}
