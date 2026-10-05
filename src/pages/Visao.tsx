import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { EtapaModelo, Profile, Protocolo } from '../lib/types';
import { PROTOCOLO_STATUS, fmtData } from '../lib/labels';
import { buscarTudo, dataLocal } from '../lib/banco';
import { MAX_DIAS_PAUSA } from '../lib/flow';
import { Bruto, ItemK, PERIODOS, ProjetoK, TempoK, calcular, nivelDe, refEtapas, Delta } from '../lib/kpis';
import { BarrasH, Calor, Cartao, Colunas, Legenda, Linhas, Medidor, Mini, SERIE, STATUS_COR, STATUS_ICONE, STATUS_ROTULO, fmtN } from '../components/graficos';

const NIVEL_TEXTO: Record<string, string> = { ok: 'var(--bom)', atrasada: 'var(--amber)', grave: 'var(--ruim)', critica: 'var(--ruim)' };
const ICONE_INSIGHT = { bom: '✓', atencao: '▲', critico: '⬣', info: '●' } as const;

function Tile({ rotulo, valor, sub, delta, boaQuandoSobe = true, unidade = '', abs, serie, cor, nivel }: {
  rotulo: string; valor: string; sub?: string; delta?: Delta; boaQuandoSobe?: boolean; unidade?: string; abs?: boolean; serie?: number[]; cor?: string; nivel?: string;
}) {
  let d: { txt: string; bom: boolean | null } | null = null;
  if (delta) {
    const dif = delta.atual - delta.anterior;
    if (Math.abs(dif) < 0.05) d = { txt: 'igual ao período anterior', bom: null };
    else {
      const txt = abs || delta.pct === null ? `${dif > 0 ? '+' : '−'}${fmtN(Math.abs(dif), 1)}${unidade}` : `${Math.abs(Math.round(delta.pct))}%`;
      d = { txt: `${dif > 0 ? '▲' : '▼'} ${txt} vs período anterior`, bom: (dif > 0) === boaQuandoSobe };
    }
  }
  return (
    <div className="viz-tile">
      <span className="viz-tile-r">{rotulo}</span>
      <div className="viz-tile-v"><b style={nivel ? { color: NIVEL_TEXTO[nivel] } : undefined}>{valor}</b>{serie && <Mini valores={serie} cor={cor} />}</div>
      {sub && <span className="viz-tile-s">{sub}</span>}
      {d && <span className={`viz-delta ${d.bom === null ? '' : d.bom ? 'bom' : 'ruim'}`}>{d.txt}</span>}
    </div>
  );
}

export default function Visao() {
  const nav = useNavigate();
  const [bruto, setBruto] = useState<Bruto | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [periodo, setPeriodo] = useState('90d');
  const [resp, setResp] = useState('');
  const [atualizado, setAtualizado] = useState<Date | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('');
    try {
      const desde = new Date(Date.now() - 740 * 86_400_000).toISOString();
      const projetos = await buscarTudo<ProjetoK>((de, ate) =>
        supabase.from('projetos').select('*, clientes(nome,codigo), profiles(nome), projeto_etapas(etapa_codigo,status,iniciada_em,concluida_em,rodadas_ajuste)')
          .order('created_at', { ascending: false }).range(de, ate));
      const tempos = await buscarTudo<TempoK>((de, ate) =>
        supabase.from('tempos').select('projeto_id,etapa_codigo,usuario_id,iniciado_em,finalizado_em').gte('iniciado_em', desde).order('iniciado_em').range(de, ate));
      const itens = await buscarTudo<ItemK>((de, ate) =>
        supabase.from('projeto_tarefa_itens').select('feito_em,feito_por').not('feito_em', 'is', null).gte('feito_em', desde).order('feito_em').range(de, ate));
      const [m, p, pr] = await Promise.all([
        supabase.from('etapa_modelos').select('*').order('ordem'),
        supabase.from('profiles').select('*').eq('ativo', true),
        supabase.from('protocolos').select('*, projetos(nome, clientes(nome))').order('prazo', { ascending: true, nullsFirst: false }),
      ]);
      setBruto({ projetos, tempos, itens, modelos: (m.data as EtapaModelo[]) ?? [], pessoas: (p.data as Profile[]) ?? [], protocolos: (pr.data as Protocolo[]) ?? [] });
      setAtualizado(new Date());
    } catch (e) { setErro((e as Error).message || 'Não foi possível carregar os dados.'); }
    setCarregando(false);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const v = useMemo(() => (bruto ? calcular(bruto, periodo, resp) : null), [bruto, periodo, resp]);
  const ref = useMemo(() => (bruto ? refEtapas(bruto.projetos) : {}), [bruto]);
  const equipe = useMemo(() => (bruto?.pessoas ?? []).filter((p) => p.perfil !== 'cliente'), [bruto]);
  const per = PERIODOS.find((p) => p.id === periodo)!;

  if (erro) return <div className="card"><p className="erro">{erro}</p><button onClick={carregar}>Tentar de novo</button></div>;
  if (!v || !bruto) return <div className="mudo">Carregando indicadores…</div>;

  const gran = v.gran === 'semana' ? 'Semana' : 'Mês';
  const uso = v.baldes.map((_, i) => (v.metaSerie[i] ? (v.horasSerie[i] / v.metaSerie[i]) * 100 : 0));
  const pior = v.atrasadas[0];
  const nivelGeral = pior ? (nivelDe(pior.razao) === 'atrasada' ? 'atrasada' : nivelDe(pior.razao)) : undefined;
  const pctUso = v.utilizacao.atual;
  const rotEtapa = (cod: string) => `${cod} ${bruto.modelos.find((m) => m.codigo === cod)?.rotulo ?? ''}`.trim();

  const itensSeries = (() => {
    const base = v.pessoas.filter((p) => p.itens.some((x) => x > 0)).sort((a, b) => b.itens.reduce((s, x) => s + x, 0) - a.itens.reduce((s, x) => s + x, 0));
    const top = base.slice(0, 3).map((p, i) => ({ nome: p.nome, valores: p.itens, cor: SERIE[i] }));
    const resto = base.slice(3);
    if (resto.length) top.push({ nome: 'Demais', valores: v.baldes.map((_, i) => resto.reduce((s, p) => s + p.itens[i], 0)), cor: SERIE[3] });
    return top;
  })();

  return (
    <div className={`viz${carregando ? ' carregando' : ''}`}>
      <div className="titulo">
        <div>
          <h1>Visão geral do escritório</h1>
          <p className="mudo pequeno" style={{ margin: '2px 0 0' }}>
            {fmtData(v.ini)} a {fmtData(v.fim)}{atualizado ? ` · atualizado às ${atualizado.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}
          </p>
        </div>
        <Link className="primario btn" to="/projetos/novo">+ Novo projeto</Link>
      </div>

      <div className="viz-filtros" role="group" aria-label="Filtros">
        <div className="seg" role="radiogroup" aria-label="Período">
          {PERIODOS.map((p) => (
            <button key={p.id} role="radio" aria-checked={periodo === p.id} className={periodo === p.id ? 'on' : ''} onClick={() => setPeriodo(p.id)}>{p.rotulo}</button>
          ))}
        </div>
        <label className="viz-resp">Responsável
          <select value={resp} onChange={(e) => setResp(e.target.value)} id="filtro-resp">
            <option value="">Toda a equipe</option>
            {equipe.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </label>
        <button onClick={carregar} disabled={carregando}>{carregando ? 'Atualizando…' : 'Atualizar'}</button>
      </div>

      <section className="card viz-leitura" aria-label="Leitura rápida">
        <h2>Leitura rápida</h2>
        <ul>
          {v.insights.map((i, k) => (
            <li key={k} className={`ins ${i.nivel}`}><span className="ins-i" aria-hidden="true">{ICONE_INSIGHT[i.nivel]}</span><span>{i.texto}</span></li>
          ))}
        </ul>
      </section>

      <div className="viz-tiles">
        <Tile rotulo="Projetos ativos" valor={String(v.ativos)} sub={`${v.pausados} pausado${v.pausados === 1 ? '' : 's'}`} delta={v.carteira} abs serie={v.carteiraSerie} />
        <Tile rotulo="Etapas atrasadas" valor={`${v.atrasadas.length} de ${v.abertas.length}`} nivel={v.atrasadas.length ? nivelGeral : 'ok'} sub={v.atrasadas.length ? `${STATUS_ICONE[nivelGeral!]} ${STATUS_ROTULO[nivelGeral!]}: ${pior.projeto.nome}` : '✓ Tudo no prazo de referência'} />
        <Tile rotulo="Horas registradas" valor={`${fmtN(v.horas.atual, 0)} h`} delta={v.horas} serie={v.horasSerie} />
        <Tile rotulo="Uso da carga horária" valor={`${fmtN(pctUso, 0)}%`} sub={`capacidade ${fmtN(v.capacidadeSemanal, 0)} h por semana`} delta={v.utilizacao} abs unidade=" pts" serie={uso} />
        <Tile rotulo="Novos projetos" valor={String(v.entradas.atual)} delta={v.entradas} serie={v.entradasSerie} />
        <Tile rotulo="Projetos concluídos" valor={String(v.saidas.atual)} delta={v.saidas} serie={v.saidasSerie} />
        <Tile rotulo="Ciclo médio" valor={v.ciclosN ? `${fmtN(v.ciclo.atual, 0)} dias` : '—'} sub={v.ciclosN ? `do contrato à entrega · ${v.ciclosN} projeto${v.ciclosN === 1 ? '' : 's'}` : 'sem projeto concluído no período'} delta={v.ciclosN ? v.ciclo : undefined} boaQuandoSobe={false} abs unidade=" dias" />
        <Tile rotulo="Rodadas de ajuste" valor={v.rodadas === null ? '—' : fmtN(v.rodadas, 1)} sub="por apresentação (contrato: até 3)" nivel={v.rodadas !== null && v.rodadas >= 2.5 ? 'grave' : undefined} />
      </div>

      <div className="viz-grid">
        <Cartao titulo="Entradas e saídas de projetos" sub={`Por ${v.gran === 'semana' ? 'semana' : 'mês'}`}
          tabela={{ cab: [gran, 'Entraram', 'Saíram'], linhas: v.baldes.map((b, i) => [b.rotulo, v.entradasSerie[i], v.saidasSerie[i]]) }}>
          <Legenda itens={[{ rotulo: 'Entraram', cor: SERIE[0] }, { rotulo: 'Saíram (concluídos)', cor: SERIE[1] }]} />
          <Colunas rotulos={v.baldes.map((b) => b.rotulo)} series={[{ nome: 'Entraram', valores: v.entradasSerie, cor: SERIE[0] }, { nome: 'Saíram', valores: v.saidasSerie, cor: SERIE[1] }]} />
        </Cartao>

        <Cartao titulo="Horas trabalhadas × carga contratada" sub={`Por ${v.gran === 'semana' ? 'semana' : 'mês'}, dias úteis encerrados`} nota="A linha é a meta: carga semanal de cada pessoa × dias úteis. Horas extras e folgas entram no Banco de horas."
          tabela={{ cab: [gran, 'Horas', 'Meta', 'Uso'], linhas: v.baldes.map((b, i) => [b.rotulo, fmtN(v.horasSerie[i], 1), fmtN(v.metaSerie[i], 1), v.metaSerie[i] ? `${fmtN(uso[i], 0)}%` : '—']) }}>
          <Legenda itens={[{ rotulo: 'Horas registradas', cor: SERIE[0] }, { rotulo: 'Meta de horas', cor: 'var(--ink2)', tipo: 'linha' }]} />
          <Colunas unidade=" h" rotulos={v.baldes.map((b) => b.rotulo)} series={[{ nome: 'Horas registradas', valores: v.horasSerie, cor: SERIE[0] }]} linha={{ nome: 'Meta de horas', valores: v.metaSerie }} />
        </Cartao>

        <Cartao titulo="Carteira por etapa" sub="Projetos ativos em cada etapa agora"
          tabela={{ cab: ['Etapa', 'No prazo', 'Atrasadas'], linhas: v.porEtapa.map((e) => [rotEtapa(e.codigo), e.noPrazo, e.atrasadas]) }}>
          {v.porEtapa.length === 0 ? <p className="mudo">Nenhum projeto em andamento.</p> : (<>
            <Legenda itens={[{ rotulo: 'No prazo', cor: SERIE[0] }, { rotulo: '▲ Atrasadas', cor: 'var(--st-serious)' }]} />
            <BarrasH linhas={v.porEtapa.map((e) => ({
              rotulo: rotEtapa(e.codigo), valor: e.noPrazo + e.atrasadas, texto: `${e.noPrazo + e.atrasadas}${e.atrasadas ? ` · ▲${e.atrasadas}` : ''}`,
              empilhado: [{ valor: e.noPrazo, cor: SERIE[0], nome: 'No prazo' }, { valor: e.atrasadas, cor: 'var(--st-serious)', nome: 'Atrasadas' }],
            }))} />
          </>)}
        </Cartao>

        <Cartao titulo="Etapas mais atrasadas" sub="Dias na etapa; a marca preta é o prazo de referência" nota="Prazo de referência: mediana da própria equipe nas etapas concluídas (a partir de 3) ou o padrão do escritório. Etapas que aguardam o cliente também contam."
          tabela={{ cab: ['Projeto', 'Etapa', 'Dias', 'Prazo', 'Situação'], linhas: v.abertas.slice(0, 15).map((a) => [a.projeto.nome, rotEtapa(a.etapa), fmtN(a.dias, 0), fmtN(a.ref, 1), STATUS_ROTULO[a.nivel]]) }}>
          {v.atrasadas.length === 0 ? <p className="mudo">✓ Nenhuma etapa passou do prazo de referência.</p> : (
            <BarrasH unidade=" d" refNome="Prazo de referência" onAbrir={(l) => l.href && nav(l.href)}
              linhas={v.atrasadas.slice(0, 8).map((a) => ({
                rotulo: a.projeto.nome, sub: rotEtapa(a.etapa), valor: a.dias, ref: a.ref, cor: STATUS_COR[a.nivel], ico: STATUS_ICONE[a.nivel],
                texto: `${fmtN(a.dias, 0)} d`, href: `/projetos/${a.projeto.id}`, dica: STATUS_ROTULO[a.nivel],
              }))} />
          )}
        </Cartao>

        <Cartao titulo="Horas por profissional" sub="Horas registradas no período; a marca é a meta" nota="Mais de 115% da meta aparece em alerta."
          tabela={{ cab: ['Profissional', 'Horas', 'Meta', 'Saldo'], linhas: v.pessoas.map((p) => [p.nome, fmtN(p.horas, 1), fmtN(p.meta, 1), `${p.saldo >= 0 ? '+' : '−'}${fmtN(Math.abs(p.saldo), 1)}`]) }}>
          <BarrasH unidade=" h" refNome="Meta de horas"
            linhas={v.pessoas.map((p) => {
              const sobre = p.meta > 0 && p.horas / p.meta > 1.15;
              return { rotulo: p.nome, sub: `meta ${fmtN(p.meta, 0)} h`, valor: p.horas, ref: p.meta, cor: sobre ? 'var(--st-warning)' : SERIE[0], ico: sobre ? '▲' : undefined, texto: `${fmtN(p.horas, 0)} h` };
            })} />
        </Cartao>

        <Cartao titulo="Intensidade de trabalho" sub={`Horas por pessoa, por ${v.gran === 'semana' ? 'semana' : 'mês'} (mais escuro = mais horas)`}
          tabela={{ cab: ['Profissional', ...v.baldes.map((b) => b.rotulo)], linhas: v.pessoas.map((p) => [p.nome, ...p.porBalde.map((h) => fmtN(h, 1))]) }}>
          <Calor linhas={v.pessoas.map((p) => p.nome)} colunas={v.baldes.map((b) => b.rotulo)} valores={v.pessoas.map((p) => p.porBalde)} unidade=" h" />
        </Cartao>

        <Cartao titulo="Prazo real × referência por etapa" sub="Mediana de dias das etapas concluídas no período" nota="Mostra onde o escritório demora mais do que o esperado e onde há folga."
          tabela={{ cab: ['Etapa', 'Mediana (dias)', 'Referência', 'Projetos'], linhas: v.duracaoEtapas.map((d) => [rotEtapa(d.codigo), fmtN(d.dias, 1), fmtN(d.ref, 1), d.n]) }}>
          {v.duracaoEtapas.length === 0 ? <p className="mudo">Nenhuma etapa concluída no período.</p> : (
            <BarrasH unidade=" d" refNome={`Referência (${ref[v.duracaoEtapas[0].codigo]?.origem ?? 'padrão'})`}
              linhas={v.duracaoEtapas.slice(0, 8).map((d) => {
                const nv = nivelDe(d.dias / d.ref);
                return { rotulo: rotEtapa(d.codigo), sub: `${d.n} projeto${d.n === 1 ? '' : 's'}`, valor: d.dias, ref: d.ref, cor: nv === 'ok' ? SERIE[0] : STATUS_COR[nv], ico: nv === 'ok' ? undefined : STATUS_ICONE[nv], texto: `${fmtN(d.dias, 1)} d` };
              })} />
          )}
        </Cartao>

        <Cartao titulo="Horas por etapa" sub="Média de horas trabalhadas por projeto, no período"
          tabela={{ cab: ['Etapa', 'Média de horas', 'Projetos'], linhas: v.horasEtapa.map((h) => [rotEtapa(h.codigo), fmtN(h.horas, 1), h.n]) }}>
          {v.horasEtapa.length === 0 ? <p className="mudo">Sem horas registradas no período.</p> : (
            <BarrasH unidade=" h" linhas={v.horasEtapa.slice(0, 8).map((h) => ({ rotulo: rotEtapa(h.codigo), sub: `${h.n} projeto${h.n === 1 ? '' : 's'}`, valor: h.horas, texto: `${fmtN(h.horas, 1)} h` }))} />
          )}
        </Cartao>

        <Cartao titulo="Tarefas concluídas" sub={`Itens de checklist marcados por ${v.gran === 'semana' ? 'semana' : 'mês'}`}
          tabela={{ cab: [gran, ...itensSeries.map((s) => s.nome)], linhas: v.baldes.map((b, i) => [b.rotulo, ...itensSeries.map((s) => s.valores[i])]) }}>
          {itensSeries.length === 0 ? <p className="mudo">Nenhum item marcado no período.</p> : (<>
            <Legenda itens={itensSeries.map((s) => ({ rotulo: s.nome, cor: s.cor, tipo: 'linha' }))} />
            <Linhas rotulos={v.baldes.map((b) => b.rotulo)} series={itensSeries} area />
          </>)}
        </Cartao>

        <Cartao titulo="Protocolos em aberto" sub="Prefeitura, condomínio e entregas"
          tabela={{ cab: ['Situação', 'Quantidade'], linhas: v.protocolosStatus.map((s) => [PROTOCOLO_STATUS[s.status as keyof typeof PROTOCOLO_STATUS], s.n]) }}>
          <BarrasH linhas={v.protocolosStatus.map((s) => ({ rotulo: PROTOCOLO_STATUS[s.status as keyof typeof PROTOCOLO_STATUS], valor: s.n, texto: String(s.n) }))} />
          {v.protocolosProx.length > 0 && (
            <ul className="lista viz-lista">
              {v.protocolosProx.slice(0, 4).map((p) => {
                const venc = (p.prazo ?? '') < dataLocal(new Date());
                return <li key={p.id}><Link to={`/projetos/${p.projeto_id}`}><b>{p.projetos?.nome}</b> <span className="mudo">· {p.orgao ?? p.tipo}</span>
                  <span className={`etapa ${venc ? 'alerta' : ''}`}>{venc ? '⬣ vencido em ' : '▲ prazo '}{fmtData(p.prazo)}</span></Link></li>;
              })}
            </ul>
          )}
        </Cartao>

        <Cartao titulo="Composição da carteira" sub="Projetos ativos e pausados, por tipo de estudo e serviço"
          tabela={{ cab: ['Tipo', 'Projetos'], linhas: v.mix.map((m) => [m.rotulo, m.n]) }}>
          <BarrasH linhas={v.mix.map((m) => ({ rotulo: m.rotulo, valor: m.n, texto: String(m.n) }))} />
        </Cartao>

        <Cartao titulo="Projetos pausados" sub={`Retomada só é possível até ${MAX_DIAS_PAUSA} dias de pausa`}>
          {v.pausas.length === 0 ? <p className="mudo">Nenhum projeto pausado.</p> : (
            <ul className="lista viz-lista">
              {v.pausas.map((p) => (
                <li key={p.projeto.id}><Link to={`/projetos/${p.projeto.id}`}>
                  <b>{p.projeto.nome}</b> <span className="mudo">· {p.projeto.clientes?.nome}</span>
                  <span className="viz-pausa"><Medidor valor={p.dias} max={MAX_DIAS_PAUSA} aviso={0.6} perigo={0.8} rotulo="Dias de pausa" />
                    <em>{p.dias >= MAX_DIAS_PAUSA * 0.8 ? '⬣ ' : p.dias >= MAX_DIAS_PAUSA * 0.6 ? '▲ ' : ''}{p.dias} de {MAX_DIAS_PAUSA} dias</em></span>
                </Link></li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>

      <p className="mudo pequeno" style={{ marginTop: 16 }}>
        Indicadores do período “{per.rotulo}”{resp ? ` para ${equipe.find((p) => p.id === resp)?.nome}` : ''}. Comparações usam o período anterior de mesma duração. Os dados vêm do cronômetro, das etapas e dos checklists: quanto mais a equipe registra, mais confiáveis ficam.
      </p>
    </div>
  );
}
