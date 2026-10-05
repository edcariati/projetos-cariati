import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { EtapaModelo, Tempo } from '../lib/types';
import { FASES, fmtData, fmtDur } from '../lib/labels';
import { segundosEntre } from '../lib/tempo';
import { podeBancoHoras, usePerfil } from '../lib/perfil';
import AbasHoras from '../components/AbasHoras';

export default function Tempos() {
  const eu = usePerfil();
  const [tempos, setTempos] = useState<Tempo[]>([]);
  const [modelos, setModelos] = useState<EtapaModelo[]>([]);
  const [concluidas, setConcluidas] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase.from('tempos').select('*, projetos(nome), profiles(nome)').order('iniciado_em', { ascending: false })
      .then(({ data }) => setTempos((data as Tempo[]) ?? []));
    supabase.from('projeto_etapas').select('projeto_id,etapa_codigo').eq('status', 'concluida')
      .then(({ data }) => setConcluidas(new Set(((data as { projeto_id: string; etapa_codigo: string }[]) ?? []).map((x) => `${x.projeto_id}|${x.etapa_codigo}`))));
    supabase.from('etapa_modelos').select('*').order('ordem').then(({ data }) => setModelos((data as EtapaModelo[]) ?? []));
  }, []);

  const fechados = useMemo(() => tempos.filter((t) => t.finalizado_em), [tempos]);

  /** Tempo por projeto em cada etapa; depois média, mínimo e máximo por etapa. */
  const linhas = useMemo(() => {
    const porProjetoEtapa = new Map<string, { etapa: string; seg: number }>();
    for (const t of fechados) {
      const k = `${t.projeto_id}|${t.etapa_codigo}`;
      if (!concluidas.has(k)) continue;
      const cur = porProjetoEtapa.get(k) ?? { etapa: t.etapa_codigo, seg: 0 };
      cur.seg += segundosEntre(t.iniciado_em, t.finalizado_em);
      porProjetoEtapa.set(k, cur);
    }
    const porEtapa = new Map<string, number[]>();
    porProjetoEtapa.forEach((v) => porEtapa.set(v.etapa, [...(porEtapa.get(v.etapa) ?? []), v.seg]));
    return modelos.filter((m) => m.fase <= 4).map((m) => {
      const v = porEtapa.get(m.codigo) ?? [];
      return { m, n: v.length, media: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null, min: v.length ? Math.min(...v) : null, max: v.length ? Math.max(...v) : null };
    });
  }, [fechados, modelos, concluidas]);

  const medidas = linhas.filter((l) => l.n > 0);
  const maiorMedia = Math.max(1, ...medidas.map((l) => l.media ?? 0));
  const totalSeg = fechados.reduce((s, t) => s + segundosEntre(t.iniciado_em, t.finalizado_em), 0);
  const fasesDe = (l: typeof linhas[number]) => l.m.fase;

  return (
    <>
      <AbasHoras />
      <div className="titulo"><h1>{podeBancoHoras(eu) ? 'Tempos por etapa' : 'Meus tempos'}</h1></div>
      <p className="mudo">Cada vez que alguém inicia e para o cronômetro de uma etapa, o tempo entra aqui. Com o tempo, as médias mostram quanto cada etapa realmente leva.{!podeBancoHoras(eu) && ' Aqui aparecem só os seus registros; o administrador e o Administrativo veem os de toda a equipe.'} As médias consideram só etapas já concluídas.</p>

      <div className="kpis">
        <div className="kpi"><b>{fechados.length}</b><span>registros de tempo</span></div>
        <div className="kpi"><b>{fmtDur(totalSeg)}</b><span>tempo total medido</span></div>
        <div className="kpi"><b>{medidas.length}</b><span>etapas com medição</span></div>
        <div className="kpi"><b>{new Set(fechados.map((t) => t.projeto_id)).size}</b><span>projetos medidos</span></div>
      </div>

      <h2>Média por etapa</h2>
      <section className="card tabela-wrap">
        <table className="tabela">
          <thead><tr><th>Etapa</th><th className="num-col">Projetos</th><th className="num-col">Média</th><th className="num-col">Mínimo</th><th className="num-col">Máximo</th><th className="barra-col" /></tr></thead>
          <tbody>
            {[1, 2, 3, 4].map((f) => (
              <FaseLinhas key={f} fase={f} linhas={linhas.filter((l) => fasesDe(l) === f)} maiorMedia={maiorMedia} />
            ))}
          </tbody>
        </table>
      </section>

      <h2>Últimos registros</h2>
      <section className="card tabela-wrap">
        {fechados.length === 0 && <p className="mudo">Ainda não há registros. Abra um projeto e clique em “Iniciar” numa etapa em andamento.</p>}
        <table className="tabela">
          <tbody>
            {fechados.slice(0, 20).map((t) => (
              <tr key={t.id}>
                <td><Link to={`/projetos/${t.projeto_id}`}>{t.projetos?.nome}</Link><div className="pequeno mudo">etapa {t.etapa_codigo} · {modelos.find((m) => m.codigo === t.etapa_codigo)?.rotulo}</div></td>
                <td className="pequeno mudo">{t.profiles?.nome}</td>
                <td className="pequeno mudo">{fmtData(t.iniciado_em)}</td>
                <td className="num-col"><b>{fmtDur(segundosEntre(t.iniciado_em, t.finalizado_em))}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function FaseLinhas({ fase, linhas, maiorMedia }: { fase: number; linhas: { m: EtapaModelo; n: number; media: number | null; min: number | null; max: number | null }[]; maiorMedia: number }) {
  return (
    <>
      <tr className="fase-th"><td colSpan={6}>{fase}. {FASES[fase]}</td></tr>
      {linhas.map((l) => (
        <tr key={l.m.codigo} className={l.n ? '' : 'sem-dado'}>
          <td><span className="cod">{l.m.codigo}</span> {l.m.rotulo}{l.m.opcional ? <span className="mudo pequeno"> · se contratado</span> : null}</td>
          <td className="num-col">{l.n || '—'}</td>
          <td className="num-col"><b>{fmtDur(l.media)}</b></td>
          <td className="num-col">{fmtDur(l.min)}</td>
          <td className="num-col">{fmtDur(l.max)}</td>
          <td className="barra-col">{l.media != null && <div className="mini"><i style={{ width: `${(l.media / maiorMedia) * 100}%` }} /></div>}</td>
        </tr>
      ))}
    </>
  );
}
