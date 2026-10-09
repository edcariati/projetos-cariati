import type { EtapaModelo, Profile, Projeto, Protocolo } from './types';
import { dataLocal, listaDiasUteis, somaDias } from './banco';

export const DIA = 86_400_000;

export interface EtapaK { etapa_codigo: string; status: string; iniciada_em: string | null; concluida_em: string | null; rodadas_ajuste: number }
export type ProjetoK = Omit<Projeto, 'projeto_etapas'> & { projeto_etapas: EtapaK[] };
export interface TempoK { projeto_id: string; etapa_codigo: string; usuario_id: string; iniciado_em: string; finalizado_em: string | null }
export interface ItemK { feito_em: string; feito_por: string | null }
export interface Bruto { projetos: ProjetoK[]; modelos: EtapaModelo[]; tempos: TempoK[]; pessoas: Profile[]; protocolos: Protocolo[]; itens: ItemK[] }

/** Prazo de referência (dias corridos) de cada etapa quando a equipe ainda não tem histórico suficiente. Ajustável. */
export const REF_PADRAO: Record<string, number> = {
  '01': 10, '02': 2, '03': 5, '04': 3, '05': 3, '06': 7, '07': 10, '08': 3, '09': 7, '10': 5, '11': 10, '12': 3, '13': 7, '14': 5,
  '15': 30, '16': 30, '17': 20, '18': 20, '19': 25, '20': 3, '21': 3, '22': 3, '23': 3, '24': 2, H1: 15, H2: 30, H3: 5,
};
export const MIN_AMOSTRAS = 3;

export interface Ref { dias: number; origem: 'histórico' | 'padrão'; n: number }
const mediana = (v: number[]) => { const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const diasEntre = (a: string, b: string | number) => (new Date(b).getTime() - new Date(a).getTime()) / DIA;

/** Prazo de cada etapa: mediana real da equipe (com ao menos 3 etapas concluídas) ou o padrão. */
export function refEtapas(projetos: ProjetoK[]): Record<string, Ref> {
  const amostras: Record<string, number[]> = {};
  for (const p of projetos) for (const e of p.projeto_etapas)
    if (e.status === 'concluida' && e.iniciada_em && e.concluida_em) (amostras[e.etapa_codigo] ??= []).push(Math.max(0.5, diasEntre(e.iniciada_em, e.concluida_em)));
  const out: Record<string, Ref> = {};
  for (const cod of Object.keys(REF_PADRAO)) {
    const a = amostras[cod] ?? [];
    out[cod] = a.length >= MIN_AMOSTRAS ? { dias: Math.max(1, mediana(a)), origem: 'histórico', n: a.length } : { dias: REF_PADRAO[cod], origem: 'padrão', n: a.length };
  }
  return out;
}

export type Nivel = 'ok' | 'atrasada' | 'grave' | 'critica';
export interface Atraso { projeto: ProjetoK; etapa: string; dias: number; ref: number; razao: number; nivel: Nivel }
export const nivelDe = (razao: number): Nivel => (razao > 2 ? 'critica' : razao > 1.5 ? 'grave' : razao > 1 ? 'atrasada' : 'ok');

/** Todas as etapas em andamento dos projetos ativos, com o tempo que já estão paradas em relação ao prazo de referência. */
export function etapasAbertas(projetos: ProjetoK[], ref: Record<string, Ref>, agora = Date.now()): Atraso[] {
  const out: Atraso[] = [];
  for (const p of projetos) {
    if (p.status !== 'ativo') continue;
    for (const e of p.projeto_etapas) {
      if (e.status !== 'em_andamento' || !e.iniciada_em) continue;
      const dias = Math.max(0, diasEntre(e.iniciada_em, agora)), r = ref[e.etapa_codigo]?.dias ?? 7;
      out.push({ projeto: p, etapa: e.etapa_codigo, dias, ref: r, razao: dias / r, nivel: nivelDe(dias / r) });
    }
  }
  return out.sort((a, b) => b.razao - a.razao);
}

/** Data (ISO) em que o projeto saiu da carteira, ou null se ainda está nela. */
export function fimProjeto(p: ProjetoK): string | null {
  if (p.status === 'ativo' || p.status === 'pausado') return null;
  const e24 = p.projeto_etapas.find((e) => e.etapa_codigo === '24' && e.concluida_em)?.concluida_em;
  if (e24) return e24;
  const ult = p.projeto_etapas.map((e) => e.concluida_em).filter(Boolean).sort().pop();
  return ult ?? p.pausado_em ?? p.created_at;
}
export const dia = (iso: string) => dataLocal(new Date(iso));
const naCarteira = (p: ProjetoK, d: string) => dia(p.created_at) <= d && (() => { const f = fimProjeto(p); return !f || dia(f) > d; })();
export const carteiraEm = (ps: ProjetoK[], d: string) => ps.filter((p) => naCarteira(p, d)).length;

export type Gran = 'semana' | 'mes';
export interface Balde { chave: string; rotulo: string; ini: string; fim: string }
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const segunda = (d: string) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return dataLocal(x); };

export function baldes(ini: string, fim: string, gran: Gran): Balde[] {
  const out: Balde[] = [];
  if (gran === 'semana') {
    for (let s = segunda(ini); s <= fim; s = somaDias(s, 7)) out.push({ chave: s, rotulo: `${s.slice(8)}/${s.slice(5, 7)}`, ini: s, fim: somaDias(s, 6) });
  } else {
    let y = +ini.slice(0, 4), m = +ini.slice(5, 7) - 1;
    for (;;) {
      const a = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      if (a > fim) break;
      const ult = dataLocal(new Date(y, m + 1, 0));
      out.push({ chave: a.slice(0, 7), rotulo: `${MES[m]}${m === 0 || !out.length ? '/' + String(y).slice(2) : ''}`, ini: a, fim: ult });
      if (++m > 11) { m = 0; y++; }
    }
  }
  return out;
}
export const noBalde = (b: Balde, d: string) => d >= b.ini && d <= b.fim;

export const PERIODOS = [
  { id: '30d', rotulo: '30 dias', dias: 30, gran: 'semana' as Gran },
  { id: '90d', rotulo: '90 dias', dias: 90, gran: 'semana' as Gran },
  { id: '6m', rotulo: '6 meses', dias: 182, gran: 'mes' as Gran },
  { id: '12m', rotulo: '12 meses', dias: 365, gran: 'mes' as Gran },
];

export interface Delta { atual: number; anterior: number; pct: number | null }
const delta = (atual: number, anterior: number): Delta => ({ atual, anterior, pct: anterior ? ((atual - anterior) / anterior) * 100 : null });

export interface Insight { nivel: 'bom' | 'atencao' | 'critico' | 'info'; texto: string }

export interface Visao {
  ini: string; fim: string; gran: Gran; baldes: Balde[];
  ativos: number; pausados: number; carteira: Delta; carteiraSerie: number[];
  entradas: Delta; saidas: Delta; entradasSerie: number[]; saidasSerie: number[];
  horas: Delta; horasSerie: number[]; metaSerie: number[]; capacidadeSemanal: number;
  utilizacao: Delta; ciclo: Delta; ciclosN: number; rodadas: number | null;
  abertas: Atraso[]; atrasadas: Atraso[];
  porEtapa: { codigo: string; rotulo: string; fase: number; noPrazo: number; atrasadas: number }[];
  duracaoEtapas: { codigo: string; rotulo: string; dias: number; ref: number; n: number }[];
  horasEtapa: { codigo: string; rotulo: string; horas: number; n: number }[];
  pessoas: { id: string; nome: string; horas: number; meta: number; carga: number; porBalde: number[]; itens: number[]; saldo: number }[];
  protocolosStatus: { status: string; n: number }[]; protocolosProx: Protocolo[]; protocolosVencidos: number;
  mix: { rotulo: string; n: number }[];
  pausas: { projeto: ProjetoK; dias: number }[];
  itensSerie: number[]; itensTotal: number; itensAnt: number;
  insights: Insight[];
}

const horasDe = (t: TempoK, agora: number) => (new Date(t.finalizado_em ?? agora).getTime() - new Date(t.iniciado_em).getTime()) / 3_600_000;
const soma = (v: number[]) => v.reduce((s, x) => s + x, 0);
const media = (v: number[]) => (v.length ? soma(v) / v.length : 0);

export function calcular(b: Bruto, periodoId: string, resp: string, agoraMs = Date.now()): Visao {
  const per = PERIODOS.find((p) => p.id === periodoId) ?? PERIODOS[0];
  const hoje = dataLocal(new Date(agoraMs));
  const ini = somaDias(hoje, -(per.dias - 1)), fim = hoje;
  const iniAnt = somaDias(ini, -per.dias), fimAnt = somaDias(ini, -1);
  const projetos = resp ? b.projetos.filter((p) => p.responsavel_id === resp) : b.projetos;
  const tempos = resp ? b.tempos.filter((t) => t.usuario_id === resp) : b.tempos;
  const pessoasTodas = b.pessoas.filter((p) => p.perfil !== 'cliente' && p.ativo);
  const pessoas = resp ? pessoasTodas.filter((p) => p.id === resp) : pessoasTodas;
  const ref = refEtapas(b.projetos);
  const rot = (cod: string) => b.modelos.find((m) => m.codigo === cod)?.rotulo ?? cod;
  const ms = (cod: string) => b.modelos.find((m) => m.codigo === cod);

  const ontem = somaDias(hoje, -1);
  const bal = baldes(ini, fim, per.gran).filter((x, i, a) => x.ini <= ontem || i < a.length - 1);   // a semana/mês que começa hoje ainda não tem dia encerrado
  const entra = (d: string) => projetos.filter((p) => dia(p.created_at) === d).length;
  const entradasDe = (a: string, z: string) => projetos.filter((p) => dia(p.created_at) >= a && dia(p.created_at) <= z).length;
  const saidasDe = (a: string, z: string) => projetos.filter((p) => { const f = fimProjeto(p); return p.status !== 'rescindido' && f && dia(f) >= a && dia(f) <= z; }).length;
  void entra;

  const horasEm = (a: string, z: string) => soma(tempos.filter((t) => { const d = dia(t.iniciado_em); return d >= a && d <= z; }).map((t) => horasDe(t, agoraMs)));
  const capacidadeSemanal = soma(pessoas.map((p) => p.carga_semanal_horas || 0));
  const metaEm = (a: string, z: string, ps = pessoas) => listaDiasUteis(a, z, new Date(agoraMs)).length * soma(ps.map((p) => (p.carga_semanal_horas || 0) / 5));
  const horasAtual = horasEm(ini, fim), horasAnt = horasEm(iniAnt, fimAnt);
  const metaAtual = metaEm(ini, fim), metaAnt = metaEm(iniAnt, fimAnt);

  const abertas = etapasAbertas(projetos, ref, agoraMs);
  const atrasadas = abertas.filter((a) => a.nivel !== 'ok');

  const porEtapa = b.modelos.filter((m) => abertas.some((a) => a.etapa === m.codigo)).map((m) => {
    const ab = abertas.filter((a) => a.etapa === m.codigo);
    return { codigo: m.codigo, rotulo: m.rotulo, fase: m.fase, noPrazo: ab.filter((a) => a.nivel === 'ok').length, atrasadas: ab.filter((a) => a.nivel !== 'ok').length };
  });

  // duração real das etapas concluídas no período (mediana) frente ao prazo de referência
  const dur: Record<string, number[]> = {};
  for (const p of projetos) for (const e of p.projeto_etapas)
    if (e.status === 'concluida' && e.iniciada_em && e.concluida_em && dia(e.concluida_em) >= ini && dia(e.concluida_em) <= fim)
      (dur[e.etapa_codigo] ??= []).push(Math.max(0.5, diasEntre(e.iniciada_em, e.concluida_em)));
  const duracaoEtapas = Object.entries(dur).map(([codigo, v]) => ({ codigo, rotulo: rot(codigo), dias: mediana(v), ref: ref[codigo]?.dias ?? 7, n: v.length }))
    .sort((a, b2) => b2.dias / b2.ref - a.dias / a.ref);

  // horas trabalhadas por etapa (média por projeto)
  const he: Record<string, Record<string, number>> = {};
  for (const t of tempos) { const d = dia(t.iniciado_em); if (d < ini || d > fim) continue; ((he[t.etapa_codigo] ??= {})[t.projeto_id] ??= 0); he[t.etapa_codigo][t.projeto_id] += horasDe(t, agoraMs); }
  const horasEtapa = Object.entries(he).map(([codigo, m]) => ({ codigo, rotulo: rot(codigo), horas: media(Object.values(m)), n: Object.keys(m).length })).sort((a, b2) => b2.horas - a.horas);

  // por pessoa
  const itens = resp ? b.itens.filter((i) => i.feito_por === resp) : b.itens;
  const itensEm = (a: string, z: string, uid?: string) => itens.filter((i) => { const d = dia(i.feito_em); return d >= a && d <= z && (!uid || i.feito_por === uid); }).length;
  const pessoasK = pessoas.map((p) => {
    const mine = tempos.filter((t) => t.usuario_id === p.id);
    const h = (a: string, z: string) => soma(mine.filter((t) => { const d = dia(t.iniciado_em); return d >= a && d <= z; }).map((t) => horasDe(t, agoraMs)));
    const meta = metaEm(ini, fim, [p]);
    return { id: p.id, nome: p.nome, horas: h(ini, fim), meta, carga: p.carga_semanal_horas || 0, porBalde: bal.map((x) => h(x.ini, x.fim)), itens: bal.map((x) => itensEm(x.ini, x.fim, p.id)), saldo: h(ini, fim) - meta };
  }).sort((a, b2) => b2.horas - a.horas);

  // protocolos
  const abertosP = b.protocolos.filter((p) => p.status !== 'entregue_ao_cliente' && (!resp || projetos.some((x) => x.id === p.projeto_id)));
  const ORD = ['a_protocolar', 'protocolado', 'em_analise', 'exigencia', 'aprovado'];
  const protocolosStatus = ORD.map((s) => ({ status: s, n: abertosP.filter((p) => p.status === s).length }));
  const dAte = (d: string | null) => (d ? Math.round((new Date(d + 'T12:00:00').getTime() - agoraMs) / DIA) : null);
  const protocolosVencidos = abertosP.filter((p) => p.prazo && (dAte(p.prazo) ?? 0) < 0).length;
  const protocolosProx = abertosP.filter((p) => p.prazo && (dAte(p.prazo) ?? 99) <= 14).sort((a, b2) => (a.prazo! < b2.prazo! ? -1 : 1));

  // mix da carteira
  const carteiraAtual = projetos.filter((p) => p.status === 'ativo' || p.status === 'pausado');
  const mix = [
    { rotulo: 'Estudo padrão', n: carteiraAtual.filter((p) => p.tipo_estudo === 'padrao').length },
    { rotulo: 'Ampliação', n: carteiraAtual.filter((p) => p.tipo_estudo === 'ampliacao').length },
    { rotulo: '+ Projetos', n: carteiraAtual.filter((p) => p.tipo_estudo === 'mais_projetos').length },
    { rotulo: 'Projeto legal', n: carteiraAtual.filter((p) => p.tem_legal).length },
    { rotulo: 'Interiores', n: carteiraAtual.filter((p) => p.tem_interiores).length },
    { rotulo: 'Complementares', n: carteiraAtual.filter((p) => p.tem_complementares).length },
    { rotulo: 'Habite-se', n: carteiraAtual.filter((p) => p.tem_habitese).length },
  ];

  const pausas = projetos.filter((p) => p.status === 'pausado' && p.pausado_em)
    .map((p) => ({ projeto: p, dias: Math.max(0, Math.round((agoraMs - new Date(p.pausado_em + 'T12:00:00').getTime()) / DIA)) })).sort((a, b2) => b2.dias - a.dias);

  // ciclo (criação até saída) dos projetos concluídos no período
  const ciclosDe = (a: string, z: string) => projetos.filter((p) => { const f = fimProjeto(p); return p.status === 'finalizado' && f && dia(f) >= a && dia(f) <= z; })
    .map((p) => diasEntre(p.created_at, fimProjeto(p)!));
  const cicloA = ciclosDe(ini, fim), cicloB = ciclosDe(iniAnt, fimAnt);

  const apres = projetos.flatMap((p) => p.projeto_etapas.filter((e) => ['07', '09', '11', '13'].includes(e.etapa_codigo) && (e.status === 'concluida' || e.status === 'em_andamento')));
  const rodadas = apres.length ? media(apres.map((e) => e.rodadas_ajuste)) : null;

  const entradasSerie = bal.map((x) => entradasDe(x.ini, x.fim)), saidasSerie = bal.map((x) => saidasDe(x.ini, x.fim));
  const horasSerie = bal.map((x) => horasEm(x.ini, x.fim));
  const metaSerie = bal.map((x) => metaEm(x.ini, x.fim));
  const carteiraSerie = bal.map((x) => carteiraEm(projetos, x.fim > fim ? fim : x.fim));
  const itensSerie = bal.map((x) => itensEm(x.ini, x.fim));

  const v: Visao = {
    ini, fim, gran: per.gran, baldes: bal,
    ativos: projetos.filter((p) => p.status === 'ativo').length, pausados: projetos.filter((p) => p.status === 'pausado').length,
    carteira: delta(carteiraEm(projetos, fim), carteiraEm(projetos, somaDias(ini, -1))), carteiraSerie,
    entradas: delta(entradasDe(ini, fim), entradasDe(iniAnt, fimAnt)), saidas: delta(saidasDe(ini, fim), saidasDe(iniAnt, fimAnt)), entradasSerie, saidasSerie,
    horas: delta(horasAtual, horasAnt), horasSerie, metaSerie, capacidadeSemanal,
    utilizacao: delta(metaAtual ? (horasAtual / metaAtual) * 100 : 0, metaAnt ? (horasAnt / metaAnt) * 100 : 0),
    ciclo: delta(media(cicloA), media(cicloB)), ciclosN: cicloA.length, rodadas,
    abertas, atrasadas, porEtapa, duracaoEtapas, horasEtapa, pessoas: pessoasK,
    protocolosStatus, protocolosProx, protocolosVencidos, mix, pausas,
    itensSerie, itensTotal: itensEm(ini, fim), itensAnt: itensEm(iniAnt, fimAnt), insights: [],
  };
  v.insights = insights(v, rot, ms);
  return v;
}

const fmt1 = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const nomeEtapa = (cod: string, rot: (c: string) => string) => `${cod} ${rot(cod)}`;

function insights(v: Visao, rot: (c: string) => string, _ms: (c: string) => EtapaModelo | undefined): Insight[] {
  const out: Insight[] = [];
  const crit = v.atrasadas.filter((a) => a.nivel === 'critica' || a.nivel === 'grave');
  if (v.atrasadas.length) {
    const a = v.atrasadas[0];
    out.push({ nivel: crit.length ? 'critico' : 'atencao', texto: `${v.atrasadas.length} de ${v.abertas.length} etapas em andamento passaram do prazo de referência. A mais atrasada: ${a.projeto.nome}, etapa ${nomeEtapa(a.etapa, rot)}, há ${Math.round(a.dias)} dias (previsto ${fmt1(a.ref)}).` });
  } else if (v.abertas.length) out.push({ nivel: 'bom', texto: `Nenhuma das ${v.abertas.length} etapas em andamento passou do prazo de referência.` });

  const gargalo = [...v.porEtapa].sort((a, b) => b.noPrazo + b.atrasadas - (a.noPrazo + a.atrasadas))[0];
  if (gargalo && gargalo.noPrazo + gargalo.atrasadas >= 2)
    out.push({ nivel: 'info', texto: `Possível gargalo: a etapa ${nomeEtapa(gargalo.codigo, rot)} concentra ${gargalo.noPrazo + gargalo.atrasadas} projetos ao mesmo tempo.` });

  const e = v.entradas.atual, s = v.saidas.atual;
  out.push({ nivel: e > s ? 'info' : s > e ? 'bom' : 'info', texto: `No período entraram ${e} projeto${e === 1 ? '' : 's'} e saíram ${s}: a carteira ${e > s ? 'cresceu' : s > e ? 'diminuiu' : 'ficou estável'}${v.carteira.anterior ? ` (de ${v.carteira.anterior} para ${v.carteira.atual})` : ''}.` });

  if (v.horas.pct !== null) out.push({ nivel: 'info', texto: `Horas trabalhadas: ${fmt1(v.horas.atual)} h, ${Math.abs(Math.round(v.horas.pct))}% ${v.horas.pct >= 0 ? 'acima' : 'abaixo'} do período anterior.` });
  const u = v.utilizacao.atual;
  if (v.capacidadeSemanal && v.horas.atual) out.push({ nivel: u > 110 ? 'atencao' : u < 65 ? 'atencao' : 'bom', texto: u > 110 ? `A equipe trabalhou ${Math.round(u)}% da carga contratada: sinal de sobrecarga (horas extras entram no banco de horas).` : u < 65 ? `A equipe registrou só ${Math.round(u)}% da carga contratada no cronômetro: há folga de capacidade, ou horas sem registro.` : `Utilização da carga horária em ${Math.round(u)}%, dentro da faixa saudável.` });
  const sobre = v.pessoas.filter((p) => p.meta > 0 && p.horas / p.meta > 1.15);
  if (sobre.length) out.push({ nivel: 'atencao', texto: `${sobre.map((p) => p.nome).join(', ')} ${sobre.length > 1 ? 'passaram' : 'passou'} de 115% da meta de horas no período.` });

  const pc = v.pausas.filter((p) => p.dias > 150);
  if (pc.length) out.push({ nivel: 'critico', texto: `${pc.map((p) => `${p.projeto.nome} (${p.dias} dias)`).join(', ')} em pausa perto do limite de 180 dias: contatar o cliente ou preparar a rescisão.` });
  if (v.protocolosVencidos) out.push({ nivel: 'critico', texto: `${v.protocolosVencidos} protocolo${v.protocolosVencidos === 1 ? '' : 's'} com prazo vencido.` });
  else if (v.protocolosProx.length) out.push({ nivel: 'atencao', texto: `${v.protocolosProx.length} protocolo${v.protocolosProx.length === 1 ? '' : 's'} com prazo nos próximos 14 dias.` });
  if (v.rodadas !== null && v.rodadas >= 2) out.push({ nivel: 'atencao', texto: `Média de ${fmt1(v.rodadas)} rodadas de ajuste nas apresentações (o contrato prevê até 3): revisar briefing e estudo inicial.` });
  const cr = v.ciclo;
  if (v.ciclosN && cr.anterior) out.push({ nivel: cr.atual <= cr.anterior ? 'bom' : 'atencao', texto: `Ciclo médio de ${Math.round(cr.atual)} dias do contrato à entrega (${v.ciclosN} projeto${v.ciclosN === 1 ? '' : 's'}), ${Math.abs(Math.round(cr.atual - cr.anterior))} dias ${cr.atual <= cr.anterior ? 'mais rápido' : 'mais lento'} que antes.` });
  return out;
}
