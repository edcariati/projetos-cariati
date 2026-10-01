import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Tempo } from '../lib/types';
import { fmtDur, fmtRelogio } from '../lib/labels';
import { aoMudar, cronometroAtivo, iniciarCronometro, pararCronometro, segundosEntre } from '../lib/tempo';

export default function Cronometro({ projetoId, etapaCodigo, bloqueado }: {
  projetoId: string; etapaCodigo: string; bloqueado?: boolean;
}) {
  const [registros, setRegistros] = useState<Tempo[]>([]);
  const [ativo, setAtivo] = useState<Tempo | null>(null);
  const [agora, setAgora] = useState(Date.now());
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    const [r, a] = await Promise.all([
      supabase.from('tempos').select('*').eq('projeto_id', projetoId).eq('etapa_codigo', etapaCodigo),
      cronometroAtivo(),
    ]);
    setRegistros((r.data as Tempo[]) ?? []); setAtivo(a);
  }, [projetoId, etapaCodigo]);

  useEffect(() => { carregar(); return aoMudar(carregar); }, [carregar]);
  const rodandoAqui = ativo?.projeto_id === projetoId && ativo.etapa_codigo === etapaCodigo;
  useEffect(() => {
    if (!rodandoAqui) return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [rodandoAqui]);

  const fechadoSeg = registros.filter((t) => t.finalizado_em)
    .reduce((s, t) => s + segundosEntre(t.iniciado_em, t.finalizado_em), 0);
  const sessaoSeg = rodandoAqui ? segundosEntre(ativo!.iniciado_em, null, agora) : 0;
  const outroRodando = ativo && !rodandoAqui;

  async function alternar() {
    setErro('');
    try { await (rodandoAqui ? pararCronometro() : iniciarCronometro(projetoId, etapaCodigo)); }
    catch (e) { setErro((e as Error).message); }
  }

  return (
    <div className={`cronometro ${rodandoAqui ? 'rodando' : ''}`}>
      <div className="relogio" aria-live="off">{fmtRelogio(sessaoSeg)}</div>
      <div className="grow">
        <div className="pequeno">
          Tempo acumulado nesta etapa: <b>{fmtDur(fechadoSeg + sessaoSeg)}</b>
          {registros.filter((t) => t.finalizado_em).length > 0 && <span className="mudo"> · {registros.filter((t) => t.finalizado_em).length} registro(s)</span>}
        </div>
        {outroRodando && <div className="pequeno mudo">Ao iniciar, o cronômetro de “{ativo.projetos?.nome ?? 'outro projeto'}” será parado.</div>}
        {erro && <div className="pequeno erro">{erro}</div>}
      </div>
      <button className={rodandoAqui ? 'perigo' : 'primario'} onClick={alternar} disabled={bloqueado && !rodandoAqui}>
        {rodandoAqui ? '■ Parar' : '▶ Iniciar'}
      </button>
    </div>
  );
}
