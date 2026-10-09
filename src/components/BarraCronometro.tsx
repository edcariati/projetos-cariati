import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Tempo } from '../lib/types';
import { fmtRelogio } from '../lib/labels';
import { LIMITE_ESQUECIDO_SEG, aoMudar, cronometroAtivo, pararCronometro, segundosEntre } from '../lib/tempo';

/** Faixa fixa que mostra o cronômetro em andamento em qualquer tela do app. */
export default function BarraCronometro() {
  const [ativo, setAtivo] = useState<Tempo | null>(null);
  const [agora, setAgora] = useState(Date.now());

  useEffect(() => {
    const carregar = (novo?: Tempo | null) => {
      if (novo !== undefined) setAtivo(novo);   // resposta imediata; abaixo confirma no servidor
      if (novo !== null) cronometroAtivo().then(setAtivo).catch(() => { if (novo === undefined) setAtivo(null); });
    };
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
      {segundosEntre(ativo.iniciado_em, null, agora) > LIMITE_ESQUECIDO_SEG && <span className="aviso-esquecido" title="Parece ter ficado ligado. Pare e ajuste o horário no registro de tempos da etapa.">⚠ há muito tempo</span>}
      <button onClick={() => pararCronometro()}>■ Parar</button>
    </div>
  );
}
