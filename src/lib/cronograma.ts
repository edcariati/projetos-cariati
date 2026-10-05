import type { EtapaModelo, Protocolo } from './types';
import { DIA, ProjetoK, Ref } from './kpis';

/** Cronograma dos projetos em andamento: etapas feitas (datas reais), a etapa atual (com o prazo de referência) e as próximas, projetadas em sequência. */
export interface Seg {
  projeto: ProjetoK; etapa: string; rotulo: string; fase: number;
  ini: number; fim: number; tipo: 'feita' | 'atual' | 'prevista'; atrasada: boolean; prazo: number | null; ref: number;
}
export interface LinhaCrono { projeto: ProjetoK; segs: Seg[]; fimPrevisto: number; atrasado: boolean }
export interface Crono { linhas: LinhaCrono[]; inicio: number; fim: number }

export function montarCronograma(projetos: ProjetoK[], modelos: EtapaModelo[], ref: Record<string, Ref>, agora = Date.now()): Crono {
  const ord = (c: string) => modelos.find((m) => m.codigo === c)?.ordem ?? 0;
  const rot = (c: string) => modelos.find((m) => m.codigo === c)?.rotulo ?? c;
  const faseDe = (c: string) => modelos.find((m) => m.codigo === c)?.fase ?? 0;
  const linhas: LinhaCrono[] = [];
  for (const p of projetos.filter((x) => x.status === 'ativo')) {
    const etapas = [...p.projeto_etapas].filter((e) => e.status !== 'nao_aplicavel' && faseDe(e.etapa_codigo) !== 5).sort((a, b) => ord(a.etapa_codigo) - ord(b.etapa_codigo));
    const segs: Seg[] = [];
    let cursor = agora;
    for (const e of etapas) {
      const r = ref[e.etapa_codigo]?.dias ?? 7;
      if (e.status === 'concluida' && e.iniciada_em && e.concluida_em) {
        segs.push({ projeto: p, etapa: e.etapa_codigo, rotulo: rot(e.etapa_codigo), fase: faseDe(e.etapa_codigo), ini: new Date(e.iniciada_em).getTime(), fim: new Date(e.concluida_em).getTime(), tipo: 'feita', atrasada: false, prazo: null, ref: r });
      } else if (e.status === 'em_andamento' && e.iniciada_em) {
        const ini = new Date(e.iniciada_em).getTime(), prazo = ini + r * DIA, atrasada = agora > prazo;
        const fim = Math.max(agora, prazo);
        segs.push({ projeto: p, etapa: e.etapa_codigo, rotulo: rot(e.etapa_codigo), fase: faseDe(e.etapa_codigo), ini, fim, tipo: 'atual', atrasada, prazo, ref: r });
        if (faseDe(e.etapa_codigo) !== 6) cursor = Math.max(cursor, fim);
      }
    }
    for (const e of etapas) {
      if (e.status !== 'pendente' || faseDe(e.etapa_codigo) === 6) continue;
      const r = ref[e.etapa_codigo]?.dias ?? 7;
      segs.push({ projeto: p, etapa: e.etapa_codigo, rotulo: rot(e.etapa_codigo), fase: faseDe(e.etapa_codigo), ini: cursor, fim: cursor + r * DIA, tipo: 'prevista', atrasada: false, prazo: cursor + r * DIA, ref: r });
      cursor += r * DIA;
    }
    if (!segs.length) continue;
    linhas.push({ projeto: p, segs, fimPrevisto: Math.max(...segs.map((s) => s.fim)), atrasado: segs.some((s) => s.atrasada) });
  }
  linhas.sort((a, b) => a.fimPrevisto - b.fimPrevisto);
  const inicio = Math.max(agora - 120 * DIA, Math.min(agora, ...linhas.flatMap((l) => l.segs.map((s) => s.ini))));
  const fim = Math.min(agora + 300 * DIA, Math.max(agora + 30 * DIA, ...linhas.map((l) => l.fimPrevisto)));
  return { linhas, inicio, fim };
}

export interface Evento { data: string; tipo: 'etapa' | 'protocolo' | 'entrega'; titulo: string; sub: string; projetoId: string; vencido: boolean }
const dia = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Datas que importam no calendário: prazo da etapa atual, prazos de protocolos e entrega prevista de cada projeto. */
export function montarEventos(c: Crono, protocolos: Protocolo[], agora = Date.now()): Evento[] {
  const ev: Evento[] = [];
  for (const l of c.linhas) {
    for (const s of l.segs.filter((x) => x.tipo === 'atual' && x.prazo)) {
      ev.push({ data: dia(s.prazo!), tipo: 'etapa', titulo: `${l.projeto.nome}`, sub: `Prazo da etapa ${s.etapa} · ${s.rotulo}`, projetoId: l.projeto.id, vencido: s.atrasada });
    }
    ev.push({ data: dia(l.fimPrevisto), tipo: 'entrega', titulo: l.projeto.nome, sub: 'Entrega prevista do projeto', projetoId: l.projeto.id, vencido: false });
  }
  for (const p of protocolos.filter((x) => x.prazo && x.status !== 'entregue_ao_cliente')) {
    ev.push({ data: p.prazo!, tipo: 'protocolo', titulo: p.projetos?.nome ?? 'Protocolo', sub: `Prazo do protocolo${p.orgao ? ` · ${p.orgao}` : ''}`, projetoId: p.projeto_id, vencido: new Date(p.prazo! + 'T23:59:59').getTime() < agora });
  }
  return ev.sort((a, b) => (a.data < b.data ? -1 : 1));
}
