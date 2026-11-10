import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { EtapaModelo } from '../lib/types';
import { FASES } from '../lib/labels';
import { confirmar } from '../components/Dialogo';
import { avisar } from '../ui/avisos';
import { Carregando } from '../ui/Holo';

/** Estimativas padrão de fábrica (as mesmas da migração 0014), para voltar ao ponto de partida. */
const PADRAO_FABRICA: Record<string, number> = { '01': 3, '02': 0.5, '03': 0.5, '04': 0.3, '05': 2, '06': 4, '07': 16, '08': 0.3, '09': 3, '10': 0.5, '11': 10, '12': 0.3, '13': 3, '14': 0.5,
  '15': 60, '16': 24, '17': 30, '18': 30, '19': 20, '20': 2, '21': 0.3, '22': 3, '23': 2, '24': 0.5, H1: 6, H2: 6, H3: 2 };
const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/** Banco de horas estimadas: o administrador ajusta as horas previstas de cada etapa. A estimativa de um projeto é a soma das etapas que se aplicam a ele. */
export default function AbaHoras() {
  const [etapas, setEtapas] = useState<EtapaModelo[] | null>(null);
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState<string | null>(null);
  // horas realmente lançadas por etapa (cronômetro e lançamentos), para comparar com o estimado
  const [real, setReal] = useState<Record<string, { horas: number; projetos: number }>>({});
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('etapa_modelos').select('*').order('ordem');
    if (error) return setErro(error.message);
    setEtapas((data as EtapaModelo[]) ?? []); setRascunho({});
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    supabase.from('tempos').select('etapa_codigo,projeto_id,iniciado_em,finalizado_em').not('finalizado_em', 'is', null).limit(20000).then(({ data }) => {
      const acc: Record<string, { horas: number; ps: Set<string> }> = {};
      for (const t of (data as { etapa_codigo: string; projeto_id: string; iniciado_em: string; finalizado_em: string }[]) ?? []) {
        const h = (new Date(t.finalizado_em).getTime() - new Date(t.iniciado_em).getTime()) / 3600000;
        const a = (acc[t.etapa_codigo] ??= { horas: 0, ps: new Set() }); a.horas += h; a.ps.add(t.projeto_id);
      }
      setReal(Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, { horas: v.horas, projetos: v.ps.size }])));
    });
  }, []);

  async function salvar(e: EtapaModelo, txt: string) {
    const n = Number(txt.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) { avisar('Digite um número de horas válido (0 ou mais).', { tipo: 'erro' }); setRascunho((r) => { const { [e.codigo]: _, ...resto } = r; void _; return resto; }); return; }
    if (n === Number(e.horas_padrao)) return;
    setSalvando(e.codigo);
    const { error } = await supabase.from('etapa_modelos').update({ horas_padrao: n }).eq('codigo', e.codigo);
    setSalvando(null);
    if (error) return avisar(error.message, { tipo: 'erro' });
    setEtapas((l) => l && l.map((x) => (x.codigo === e.codigo ? { ...x, horas_padrao: n } : x)));
    avisar(`Etapa ${e.codigo}: ${fmt(n)} h.`);
  }
  async function restaurar() {
    if (!(await confirmar('Voltar todas as etapas às horas de fábrica? Os projetos que usam a soma das etapas passam a refletir esses valores.'))) return;
    for (const [codigo, h] of Object.entries(PADRAO_FABRICA)) await supabase.from('etapa_modelos').update({ horas_padrao: h }).eq('codigo', codigo);
    avisar('Horas de fábrica restauradas.'); carregar();
  }

  if (erro) return <p className="erro">{erro}</p>;
  if (!etapas) return <Carregando n={4} texto="Carregando etapas…" />;
  const total = etapas.filter((x) => x.fase !== 5).reduce((s, x) => s + Number(x.horas_padrao), 0);
  const medio = (c: string) => (real[c] ? real[c].horas / real[c].projetos : null);
  const totalReal = etapas.filter((x) => x.fase !== 5).reduce((s, x) => s + (medio(x.codigo) ?? 0), 0);
  const totalEstimadoComDados = etapas.filter((x) => x.fase !== 5 && medio(x.codigo) != null).reduce((s, x) => s + Number(x.horas_padrao), 0);
  const fases = [...new Set(etapas.filter((x) => x.fase !== 5).map((x) => x.fase))].sort((a, b) => a - b);

  return (
    <section className="card">
      <div className="acoes cab-aba">
        <div>
          <h2 style={{ margin: 0 }}>Horas estimadas por etapa</h2>
          <p className="mudo pequeno" style={{ margin: '4px 0 0' }}>Quanto tempo cada etapa costuma levar. A estimativa de cada projeto é a soma das etapas que ele tem (você ainda pode definir uma estimativa só para um projeto, dentro dele).</p>
        </div>
        <button onClick={restaurar}>Voltar às horas de fábrica</button>
      </div>
      <p className="pequeno"><b>{fmt(total)} h</b> <span className="mudo">estimadas no fluxo completo, com todas as etapas</span></p>
      <p className="pequeno"><b>Resultado final:</b> nas etapas que já têm horas lançadas, o estimado soma <b>{fmt(totalEstimadoComDados)} h</b> e o realizado médio por projeto soma <b>{fmt(totalReal)} h</b>
        {totalEstimadoComDados > 0 && <> ({totalReal > totalEstimadoComDados ? '+' : ''}{fmt(totalReal - totalEstimadoComDados)} h)</>}. Use a coluna “Realizado” para ajustar as estimativas que estão fora da realidade.</p>
      {fases.map((f) => {
        const lista = etapas.filter((x) => x.fase === f);
        const sub = lista.reduce((s, x) => s + Number(x.horas_padrao), 0);
        return (
          <div key={f} className="horas-fase">
            <h3>{f}. {FASES[f]} <span className="mudo pequeno">· {fmt(sub)} h</span></h3>
            <table className="tab-horas">
              <thead><tr><th>Etapa</th><th>Setor</th><th className="num">Realizado (média por projeto)</th><th className="num">Horas estimadas</th></tr></thead>
              <tbody>
                {lista.map((e) => (
                  <tr key={e.codigo}>
                    <td><b>{e.codigo}</b> · {e.titulo}</td>
                    <td className="mudo pequeno">{e.setores.join(' · ')}</td>
                    <td className="num mudo pequeno">{medio(e.codigo) != null ? `${fmt(medio(e.codigo) as number)} h · ${real[e.codigo].projetos} proj.` : '—'}</td>
                    <td className="num">
                      <input aria-label={`Horas estimadas da etapa ${e.codigo}`} inputMode="decimal" className="campo-horas" value={rascunho[e.codigo] ?? String(e.horas_padrao).replace('.', ',')}
                        onChange={(ev) => setRascunho({ ...rascunho, [e.codigo]: ev.target.value })}
                        onBlur={(ev) => salvar(e, ev.target.value)} onKeyDown={(ev) => ev.key === 'Enter' && (ev.target as HTMLInputElement).blur()} />
                      <span className="mudo pequeno"> h{salvando === e.codigo ? ' …' : ''}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </section>
  );
}
