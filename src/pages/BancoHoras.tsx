import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { BancoAjuste, Profile, Tempo } from '../lib/types';
import { SETOR, fmtData, fmtDur } from '../lib/labels';
import { segundosEntre } from '../lib/tempo';
import { baixarCsv, buscarTudo, dataLocal, fmtSaldo, listaDiasUteis, periodo } from '../lib/banco';
import { podeBancoHoras, usePerfil } from '../lib/perfil';

const PERIODOS: [string, string][] = [['30d', 'Últimos 30 dias'], ['mes', 'Este mês'], ['mes_anterior', 'Mês anterior'], ['7d', 'Últimos 7 dias'], ['custom', 'Personalizado']];
const horas = (seg: number) => (seg / 3600).toFixed(1).replace('.', ',');

export default function BancoHoras() {
  const eu = usePerfil();
  const [chave, setChave] = useState('30d');
  const [datas, setDatas] = useState(periodo('30d'));
  const [pessoaId, setPessoaId] = useState('');
  const [pessoas, setPessoas] = useState<Profile[]>([]);
  const [tempos, setTempos] = useState<Tempo[]>([]);
  const [ajustes, setAjustes] = useState<BancoAjuste[]>([]);
  const [aberto, setAberto] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [form, setForm] = useState({ usuario: '', data: dataLocal(new Date()), sinal: '1', horas: '', motivo: '' });

  const carregar = useCallback(async () => {
    const ini = new Date(datas.ini + 'T00:00:00').toISOString(), fim = new Date(datas.fim + 'T23:59:59.999').toISOString();
    const [p, t, a] = await Promise.all([
      supabase.from('profiles').select('*').neq('perfil', 'cliente').eq('ativo', true).order('nome'),
      buscarTudo<Tempo>((de, ate) => supabase.from('tempos').select('*, projetos(nome)').gte('iniciado_em', ini).lte('iniciado_em', fim).order('iniciado_em').range(de, ate)),
      supabase.from('banco_horas_ajustes').select('*').gte('data', datas.ini).lte('data', datas.fim).order('data', { ascending: false }),
    ]);
    setPessoas((p.data as Profile[]) ?? []); setTempos(t); setAjustes((a.data as BancoAjuste[]) ?? []);
  }, [datas]);
  useEffect(() => { carregar(); }, [carregar]);

  const diasUteis = useMemo(() => listaDiasUteis(datas.ini, datas.fim), [datas]);
  const nome = (id: string) => pessoas.find((p) => p.id === id)?.nome ?? '—';

  const linhas = useMemo(() => pessoas
    .filter((p) => !pessoaId || p.id === pessoaId)
    .map((p) => {
      const meus = tempos.filter((t) => t.usuario_id === p.id);
      const trab = meus.reduce((s, t) => s + segundosEntre(t.iniciado_em, t.finalizado_em), 0);
      const prev = (p.carga_semanal_horas / 5) * diasUteis.length * 3600;
      const aj = ajustes.filter((a) => a.usuario_id === p.id).reduce((s, a) => s + a.minutos * 60, 0);
      return { p, meus, trab, prev, aj, saldo: trab + aj - prev };
    })
    .filter((l) => l.trab > 0 || l.p.carga_semanal_horas > 0 || l.aj !== 0)
    .sort((a, b) => a.saldo - b.saldo), [pessoas, pessoaId, tempos, ajustes, diasUteis]);

  const tot = linhas.reduce((s, l) => ({ trab: s.trab + l.trab, prev: s.prev + l.prev, aj: s.aj + l.aj }), { trab: 0, prev: 0, aj: 0 });

  const porProjeto = useMemo(() => {
    const m = new Map<string, number>();
    const ids = new Set(linhas.map((l) => l.p.id));
    for (const t of tempos) if (ids.has(t.usuario_id)) m.set(t.projetos?.nome ?? '—', (m.get(t.projetos?.nome ?? '—') ?? 0) + segundosEntre(t.iniciado_em, t.finalizado_em));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [tempos, linhas]);

  if (!podeBancoHoras(eu)) return <p className="mudo">O banco de horas é restrito ao administrador e ao setor Administrativo.</p>;

  function mudarPeriodo(c: string) { setChave(c); if (c !== 'custom') setDatas(periodo(c)); }

  async function lancar() {
    setErro('');
    const h = Number(form.horas.replace(',', '.'));
    if (!form.usuario || !form.motivo.trim() || !(h > 0)) return setErro('Escolha a pessoa, informe as horas e o motivo.');
    const { error } = await supabase.from('banco_horas_ajustes').insert({
      usuario_id: form.usuario, data: form.data, minutos: Math.round(h * 60) * Number(form.sinal), motivo: form.motivo.trim(),
    });
    if (error) return setErro(error.message);
    setForm({ ...form, horas: '', motivo: '' });
    await carregar();
  }
  async function remover(id: string) { await supabase.from('banco_horas_ajustes').delete().eq('id', id); await carregar(); }

  function exportar() {
    baixarCsv(`banco-de-horas_${datas.ini}_${datas.fim}.csv`, [
      ['Profissional', 'Setor', 'Carga semanal (h)', 'Horas trabalhadas', 'Horas previstas', 'Lançamentos (h)', 'Saldo (h)'],
      ...linhas.map((l) => [l.p.nome, SETOR[l.p.setor], l.p.carga_semanal_horas, horas(l.trab), horas(l.prev), horas(l.aj), horas(l.saldo)]),
    ]);
  }

  return (
    <>
      <div className="titulo"><h1>Banco de horas</h1><button onClick={exportar}>Exportar resumo (CSV)</button></div>
      <p className="mudo">Horas registradas pelo cronômetro, comparadas com a carga horária de cada pessoa ({diasUteis.length} dias úteis encerrados no período, de segunda a sexta). Feriados e compensações entram como lançamento manual.</p>

      <div className="filtros">
        <select id="bh-periodo" value={chave} onChange={(e) => mudarPeriodo(e.target.value)}>{PERIODOS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        {chave === 'custom' && <>
          <input id="bh-ini" type="date" value={datas.ini} max={datas.fim} onChange={(e) => e.target.value && setDatas({ ...datas, ini: e.target.value })} />
          <input id="bh-fim" type="date" value={datas.fim} min={datas.ini} onChange={(e) => e.target.value && setDatas({ ...datas, fim: e.target.value })} />
        </>}
        <select id="bh-pessoa" value={pessoaId} onChange={(e) => setPessoaId(e.target.value)}>
          <option value="">Toda a equipe</option>{pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </div>
      <p className="mudo pequeno">{fmtData(datas.ini)} a {fmtData(datas.fim)}</p>

      <div className="kpis">
        <div className="kpi"><b>{fmtDur(tot.trab)}</b><span>horas trabalhadas</span></div>
        <div className="kpi"><b>{fmtDur(tot.prev)}</b><span>horas previstas</span></div>
        <div className="kpi"><b className={tot.trab + tot.aj - tot.prev < 0 ? 'alerta' : 'positivo'}>{fmtSaldo(tot.trab + tot.aj - tot.prev)}</b><span>saldo da equipe</span></div>
        <div className="kpi"><b>{linhas.length}</b><span>profissionais</span></div>
      </div>

      <h2>Saldo por profissional</h2>
      <section className="card tabela-wrap">
        <table className="tabela">
          <thead><tr><th>Profissional</th><th className="num-col">Carga</th><th className="num-col">Trabalhadas</th><th className="num-col">Previstas</th><th className="num-col">Lançam.</th><th className="num-col">Saldo</th></tr></thead>
          <tbody>
            {linhas.map((l) => {
              const dias = new Map<string, number>();
              for (const t of l.meus) dias.set(dataLocal(new Date(t.iniciado_em)), (dias.get(dataLocal(new Date(t.iniciado_em))) ?? 0) + segundosEntre(t.iniciado_em, t.finalizado_em));
              const diaria = (l.p.carga_semanal_horas / 5) * 3600;
              const lista = [...new Set([...diasUteis, ...dias.keys()])].sort().reverse();
              const proj = new Map<string, number>();
              for (const t of l.meus) proj.set(t.projetos?.nome ?? '—', (proj.get(t.projetos?.nome ?? '—') ?? 0) + segundosEntre(t.iniciado_em, t.finalizado_em));
              const meusAj = ajustes.filter((a) => a.usuario_id === l.p.id);
              return (
                <Fragment key={l.p.id}>
                  <tr className="clicavel" onClick={() => setAberto(aberto === l.p.id ? null : l.p.id)}>
                    <td><b>{l.p.nome}</b><div className="pequeno mudo">{SETOR[l.p.setor]}</div></td>
                    <td className="num-col">{l.p.carga_semanal_horas} h/sem</td>
                    <td className="num-col">{fmtDur(l.trab)}</td>
                    <td className="num-col">{fmtDur(l.prev)}</td>
                    <td className="num-col">{l.aj ? fmtSaldo(l.aj) : '—'}</td>
                    <td className={`num-col saldo ${l.saldo < 0 ? 'alerta' : 'positivo'}`}><b>{fmtSaldo(l.saldo)}</b></td>
                  </tr>
                  {aberto === l.p.id && (
                    <tr className="detalhe-linha"><td colSpan={6}>
                      <div className="duas">
                        <div>
                          <h3>Dia a dia</h3>
                          <table className="tabela mini-tab"><tbody>
                            {lista.map((d) => {
                              const w = dias.get(d) ?? 0, util = diasUteis.includes(d), dif = w - (util ? diaria : 0);
                              return <tr key={d} className={util ? '' : 'sem-dado'}><td>{fmtData(d)}{util ? '' : ' (fim de semana)'}</td><td className="num-col">{w ? fmtDur(w) : '—'}</td><td className={`num-col ${dif < 0 ? 'alerta' : 'positivo'}`}>{util || w ? fmtSaldo(dif) : ''}</td></tr>;
                            })}
                          </tbody></table>
                        </div>
                        <div>
                          <h3>Por projeto</h3>
                          <table className="tabela mini-tab"><tbody>
                            {[...proj.entries()].sort((a, b) => b[1] - a[1]).map(([n, s]) => <tr key={n}><td>{n}</td><td className="num-col">{fmtDur(s)}</td></tr>)}
                            {proj.size === 0 && <tr><td className="mudo">Nenhum tempo no período.</td></tr>}
                          </tbody></table>
                          <h3 style={{ marginTop: 14 }}>Lançamentos manuais</h3>
                          <table className="tabela mini-tab"><tbody>
                            {meusAj.map((a) => (
                              <tr key={a.id}><td>{fmtData(a.data)} · {a.motivo}</td><td className={`num-col ${a.minutos < 0 ? 'alerta' : 'positivo'}`}>{fmtSaldo(a.minutos * 60)}</td>
                                <td className="num-col"><button className="link" onClick={() => remover(a.id)}>Remover</button></td></tr>
                            ))}
                            {meusAj.length === 0 && <tr><td className="mudo">Nenhum lançamento no período.</td></tr>}
                          </tbody></table>
                        </div>
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
            {linhas.length === 0 && <tr><td colSpan={6} className="mudo">Nenhum dado no período.</td></tr>}
          </tbody>
          {linhas.length > 1 && <tfoot><tr><td><b>Total</b></td><td /><td className="num-col"><b>{fmtDur(tot.trab)}</b></td><td className="num-col"><b>{fmtDur(tot.prev)}</b></td><td className="num-col">{tot.aj ? fmtSaldo(tot.aj) : '—'}</td><td className="num-col"><b>{fmtSaldo(tot.trab + tot.aj - tot.prev)}</b></td></tr></tfoot>}
        </table>
      </section>
      <p className="mudo pequeno">Clique numa linha para ver o dia a dia, os projetos e os lançamentos da pessoa. Saldo = trabalhadas + lançamentos − previstas.</p>

      <h2>Lançar compensação ou hora extra</h2>
      <section className="card form">
        <div className="duas">
          <label>Profissional
            <select id="aj-pessoa" value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })}>
              <option value="">Escolha…</option>{pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </label>
          <label>Data<input id="aj-data" type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} /></label>
        </div>
        <div className="duas">
          <label>Tipo
            <select id="aj-tipo" value={form.sinal} onChange={(e) => setForm({ ...form, sinal: e.target.value })}>
              <option value="1">Crédito (+): hora extra, feriado abonado</option>
              <option value="-1">Débito (−): folga, compensação</option>
            </select>
          </label>
          <label>Horas<input id="aj-horas" inputMode="decimal" placeholder="ex.: 2,5" value={form.horas} onChange={(e) => setForm({ ...form, horas: e.target.value })} /></label>
        </div>
        <label>Motivo<input id="aj-motivo" placeholder="ex.: folga compensatória, entrega na Prefeitura aos sábados" value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} /></label>
        {erro && <p className="erro">{erro}</p>}
        <div className="acoes"><button className="primario" onClick={lancar}>Lançar</button></div>
      </section>

      <h2>Horas por projeto</h2>
      <section className="card">
        {porProjeto.length === 0 && <p className="mudo">Nenhum tempo no período.</p>}
        <table className="tabela"><tbody>
          {porProjeto.map(([n, s]) => (
            <tr key={n}><td>{n}</td><td className="num-col">{fmtDur(s)}</td><td className="num-col mudo">{tot.trab ? Math.round((s / tot.trab) * 100) : 0}%</td>
              <td className="barra-col"><div className="mini"><i style={{ width: `${(s / porProjeto[0][1]) * 100}%` }} /></div></td></tr>
          ))}
        </tbody></table>
      </section>
    </>
  );
}
