import type { EtapaModelo } from './types';
import { Bruto, DIA, ProjetoK, TempoK, baldes, dia, Balde, Gran } from './kpis';
import { dataLocal, listaDiasUteis, somaDias } from './banco';

/** Gestão de horas: previsto × realizado por projeto, pessoa e etapa. */

export type Visao = 'projeto' | 'profissional' | 'etapa';
export const VISOES: [Visao, string][] = [['projeto', 'Projeto'], ['profissional', 'Profissional'], ['etapa', 'Etapa']];

export const PRESETS = [
  { id: '30d', rotulo: 'Últimos 30 dias', dias: 30 },
  { id: '90d', rotulo: 'Últimos 90 dias', dias: 90 },
  { id: 'mes', rotulo: 'Este mês', dias: 0 },
  { id: '12m', rotulo: 'Últimos 12 meses', dias: 365 },
  { id: 'tudo', rotulo: 'Todo o período', dias: 0 },
  { id: 'custom', rotulo: 'Personalizado', dias: 0 },
];
export function intervalo(id: string, primeiroTempo: string | null, hoje = new Date()): { ini: string; fim: string } {
  const h = dataLocal(hoje);
  if (id === 'mes') return { ini: h.slice(0, 8) + '01', fim: h };
  if (id === 'tudo') return { ini: primeiroTempo ? dia(primeiroTempo) : somaDias(h, -365), fim: h };
  const p = PRESETS.find((x) => x.id === id);
  return { ini: somaDias(h, -((p?.dias ?? 30) - 1)), fim: h };
}

const horasDe = (t: TempoK, agora: number) => Math.max(0, (new Date(t.finalizado_em ?? agora).getTime() - new Date(t.iniciado_em).getTime()) / 3_600_000);
const soma = (v: number[]) => v.reduce((s, x) => s + x, 0);

/** Etapas que contam para a estimativa de um projeto: as contratadas, sem pausa/rescisão. */
export const etapasDoProjeto = (p: ProjetoK, modelos: EtapaModelo[]) =>
  p.projeto_etapas.filter((e) => e.status !== 'nao_aplicavel' && modelos.find((m) => m.codigo === e.etapa_codigo)?.fase !== 5);

export function estimativaProjeto(p: ProjetoK, modelos: EtapaModelo[]): { horas: number; origem: 'manual' | 'padrão' } {
  if (p.horas_estimadas != null) return { horas: Number(p.horas_estimadas), origem: 'manual' };
  return { horas: soma(etapasDoProjeto(p, modelos).map((e) => modelos.find((m) => m.codigo === e.etapa_codigo)?.horas_padrao ?? 0)), origem: 'padrão' };
}

export interface Linha {
  id: string; nome: string; sub?: string; href?: string;
  estimadas: number; realizadas: number; restantes: number; pct: number | null; noPeriodo: number; origem?: string; n?: number; status?: string;
}
export interface Resultado {
  visao: Visao; ini: string; fim: string; gran: Gran; baldes: Balde[];
  linhas: Linha[]; estimadas: number; realizadas: number; restantes: number; pct: number | null;
  serieHoras: number[]; serieMeta: number[] | null;
  rotuloEstimada: string; rotuloRealizada: string; nota: string;
}

export function calcularHoras(b: Bruto, visao: Visao, ini: string, fim: string, opc: { somenteAtivos: boolean; projetoId: string }, agoraMs = Date.now()): Resultado {
  const dias = (new Date(fim).getTime() - new Date(ini).getTime()) / DIA;
  const gran: Gran = dias > 120 ? 'mes' : 'semana';
  const bal = baldes(ini, fim, gran);
  const noInt = (t: TempoK) => { const d = dia(t.iniciado_em); return d >= ini && d <= fim; };
  const pessoas = b.pessoas.filter((p) => p.perfil !== 'cliente' && p.ativo);
  const nomeP = (id: string) => pessoas.find((p) => p.id === id)?.nome ?? '—';
  let linhas: Linha[] = [];
  let rotuloEstimada = 'Estimadas', rotuloRealizada = 'Realizadas', nota = '';
  let temposSel = b.tempos;
  let serieMeta: number[] | null = null;

  if (visao === 'projeto') {
    const projetos = b.projetos.filter((p) => (!opc.somenteAtivos || p.status === 'ativo' || p.status === 'pausado') && p.status !== 'rescindido');
    const total = new Map<string, number>(), per = new Map<string, number>();
    for (const t of b.tempos) {
      const h = horasDe(t, agoraMs);
      total.set(t.projeto_id, (total.get(t.projeto_id) ?? 0) + h);
      if (noInt(t)) per.set(t.projeto_id, (per.get(t.projeto_id) ?? 0) + h);
    }
    linhas = projetos.map((p) => {
      const est = estimativaProjeto(p, b.modelos), real = total.get(p.id) ?? 0;
      return { id: p.id, nome: p.nome, sub: p.clientes?.nome, href: `/projetos/${p.id}`, estimadas: est.horas, realizadas: real, restantes: est.horas - real,
        pct: est.horas > 0 ? (real / est.horas) * 100 : null, noPeriodo: per.get(p.id) ?? 0, origem: est.origem, status: p.status };
    }).filter((l) => l.realizadas > 0 || l.noPeriodo > 0 || l.estimadas > 0);
    rotuloRealizada = 'Realizadas (acumulado)';
    nota = 'Estimativa do projeto (editável na página do projeto) ou, sem ela, a soma das horas padrão das etapas contratadas. As horas realizadas são o acumulado desde o início do projeto; a coluna “No período” mostra só o intervalo escolhido.';
    if (opc.projetoId) temposSel = b.tempos.filter((t) => t.projeto_id === opc.projetoId);
    else temposSel = b.tempos.filter((t) => linhas.some((l) => l.id === t.projeto_id));
  } else if (visao === 'profissional') {
    const ontem = somaDias(dataLocal(new Date(agoraMs)), -1);
    const limite = fim < ontem ? fim : ontem;
    linhas = pessoas.map((p) => {
      const real = soma(b.tempos.filter((t) => t.usuario_id === p.id && noInt(t)).map((t) => horasDe(t, agoraMs)));
      const meta = listaDiasUteis(ini, limite, new Date(agoraMs)).length * ((p.carga_semanal_horas || 0) / 5);
      return { id: p.id, nome: p.nome, sub: `${p.carga_semanal_horas || 0} h por semana`, estimadas: meta, realizadas: real, restantes: meta - real, pct: meta > 0 ? (real / meta) * 100 : null, noPeriodo: real };
    }).filter((l) => l.realizadas > 0 || l.estimadas > 0);
    rotuloEstimada = 'Meta de horas'; rotuloRealizada = 'Realizadas';
    nota = 'Meta = carga semanal de cada pessoa × dias úteis encerrados no período. Acima de 100% indica horas extras (veja o Banco de horas).';
    serieMeta = bal.map((x) => {
      const fimB = x.fim < limite ? x.fim : limite;
      return listaDiasUteis(x.ini, fimB, new Date(agoraMs)).length * soma(pessoas.map((p) => (p.carga_semanal_horas || 0) / 5));
    });
    temposSel = b.tempos.filter((t) => !opc.projetoId || t.projeto_id === opc.projetoId);
  } else {
    const porPE = new Map<string, Map<string, number>>();
    for (const t of b.tempos) {
      if (!noInt(t)) continue;
      const m = porPE.get(t.etapa_codigo) ?? new Map<string, number>();
      m.set(t.projeto_id, (m.get(t.projeto_id) ?? 0) + horasDe(t, agoraMs));
      porPE.set(t.etapa_codigo, m);
    }
    linhas = b.modelos.filter((m) => porPE.has(m.codigo)).map((m) => {
      const mp = porPE.get(m.codigo)!, n = mp.size, media = soma([...mp.values()]) / n;
      return { id: m.codigo, nome: `${m.codigo} ${m.rotulo}`, sub: `${n} projeto${n === 1 ? '' : 's'}`, estimadas: m.horas_padrao, realizadas: media, restantes: m.horas_padrao - media,
        pct: m.horas_padrao > 0 ? (media / m.horas_padrao) * 100 : null, noPeriodo: media, n };
    });
    rotuloEstimada = 'Padrão por projeto'; rotuloRealizada = 'Média por projeto';
    nota = 'Compara a média real de horas por projeto em cada etapa com a estimativa padrão. Se a média real passa sempre do padrão, ajuste o padrão (administrador) para as próximas estimativas ficarem mais realistas.';
  }
  linhas.sort((a, b2) => (b2.pct ?? -1) - (a.pct ?? -1) || b2.realizadas - a.realizadas);

  const serieHoras = bal.map((x) => soma(temposSel.filter((t) => { const d = dia(t.iniciado_em); return d >= x.ini && d <= x.fim; }).map((t) => horasDe(t, agoraMs))));
  const estimadas = soma(linhas.map((l) => l.estimadas)), realizadas = soma(linhas.map((l) => l.realizadas));
  return { visao, ini, fim, gran, baldes: bal, linhas, estimadas, realizadas, restantes: estimadas - realizadas, pct: estimadas > 0 ? (realizadas / estimadas) * 100 : null,
    serieHoras, serieMeta, rotuloEstimada, rotuloRealizada, nota };
}

/** Acumulado de um projeto ao longo do tempo, frente à estimativa (evolução). */
export function evolucaoProjeto(b: Bruto, projetoId: string, agoraMs = Date.now()) {
  const p = b.projetos.find((x) => x.id === projetoId);
  const ts = b.tempos.filter((t) => t.projeto_id === projetoId).sort((a, c) => (a.iniciado_em < c.iniciado_em ? -1 : 1));
  if (!p || !ts.length) return null;
  const ini = dia(ts[0].iniciado_em), fim = dataLocal(new Date(agoraMs));
  const gran: Gran = (new Date(fim).getTime() - new Date(ini).getTime()) / DIA > 120 ? 'mes' : 'semana';
  const bal = baldes(ini, fim, gran);
  let acc = 0;
  const acumulado = bal.map((x) => { acc += soma(ts.filter((t) => { const d = dia(t.iniciado_em); return d >= x.ini && d <= x.fim; }).map((t) => horasDe(t, agoraMs))); return acc; });
  const est = estimativaProjeto(p, b.modelos).horas;
  return { rotulos: bal.map((x) => x.rotulo), acumulado, estimado: bal.map(() => est), est };
}
