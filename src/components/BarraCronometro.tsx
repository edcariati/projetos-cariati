import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Tempo } from '../lib/types';
import { fmtRelogio } from '../lib/labels';
import { aoMudar, cronometroAtivo, pararCronometro, segundosEntre } from '../lib/tempo';

/** Faixa fixa que mostra o cronômetro em andamento em qualquer tela do app. */
export default function BarraCronometro() {
  const [ativo, setAtivo] = useState<Tempo | null>(null);
  const [agora, setAgora] = useState(Date.now());

  useEffect(() => {
    const carregar = () => { cronometroAtivo().then(setAtivo).catch(() => setAtivo(null)); };
    carregar();
    return aoMudar(carregar);
  }, []);
  useEffect(() => {
    if (!ativo) return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ativo]);
  if (!ativo) return null;

  return (
    <div className="barra-cron" role="status">
      <span className="ponto" aria-hidden="true" />
      <Link to={`/projetos/${ativo.projeto_id}`} className="grow">
        <b>{ativo.projetos?.nome ?? 'Projeto'}</b> · etapa {ativo.etapa_codigo}
      </Link>
      <span className="relogio-peq">{fmtRelogio(segundosEntre(ativo.iniciado_em, null, agora))}</span>
      <button onClick={() => pararCronometro()}>■ Parar</button>
    </div>
  );
}
