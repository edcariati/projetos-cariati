import type { EtapaStatus, ProjetoStatus, ProtocoloStatus, ProtocoloTipo, Setor } from './types';

export const SETOR: Record<Setor, string> = {
  comercial: 'Comercial', administrativo: 'Administrativo', projetos: 'Setor de Projetos', terceiros: 'Terceiros',
};
export const FASES: Record<number, string> = {
  1: 'Abertura e briefing', 2: 'Estudos e aprovações', 3: 'Desenvolvimento',
  4: 'Entrega e encerramento', 5: 'Pausa e retomada',
};
export const PROJETO_STATUS: Record<ProjetoStatus, string> = {
  ativo: 'Ativo', pausado: 'Pausado', finalizado: 'Finalizado', rescindido: 'Rescindido',
};
export const ETAPA_STATUS: Record<EtapaStatus, string> = {
  pendente: 'Pendente', em_andamento: 'Em andamento', concluida: 'Concluída', nao_aplicavel: 'Não contratada',
};
export const PROTOCOLO_STATUS: Record<ProtocoloStatus, string> = {
  a_protocolar: 'A protocolar', protocolado: 'Protocolado', em_analise: 'Em análise',
  exigencia: 'Com exigência', aprovado: 'Aprovado', entregue_ao_cliente: 'Entregue ao cliente',
};
export const PROTOCOLO_TIPO: Record<ProtocoloTipo, string> = {
  prefeitura: 'Prefeitura', condominio: 'Condomínio', outro_orgao: 'Outro órgão', entrega_cliente: 'Entrega ao cliente',
};

/** Entregas ao cliente usam os mesmos status com nomes e opções próprios. */
const STATUS_ENTREGA: Partial<Record<ProtocoloStatus, string>> = {
  a_protocolar: 'A entregar', protocolado: 'Entrega agendada', entregue_ao_cliente: 'Entregue (termo assinado)',
};
export const statusProtocolo = (tipo: ProtocoloTipo, s: ProtocoloStatus) =>
  (tipo === 'entrega_cliente' && STATUS_ENTREGA[s]) || PROTOCOLO_STATUS[s];
export const opcoesStatus = (tipo: ProtocoloTipo) =>
  (Object.keys(PROTOCOLO_STATUS) as ProtocoloStatus[]).filter((s) => tipo !== 'entrega_cliente' || s in STATUS_ENTREGA);

export const TIPOS_APROVACAO = ['residencial', 'comercial', 'habite-se', 'unificação', 'averbação'];

export const fmtData = (d: string | null | undefined) =>
  d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('pt-BR') : '—';

export const diasAte = (d: string | null) =>
  d ? Math.round((new Date(d + 'T12:00:00').getTime() - Date.now()) / 86_400_000) : null;

/** 3725 → "1 h 02 min"; 600 → "10 min"; 45 → "45 s" */
export function fmtDur(seg: number | null | undefined) {
  if (seg == null) return '—';
  const s = Math.max(0, Math.round(seg));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m) return `${m} min`;
  return `${s} s`;
}
/** Relógio do cronômetro: 3725 → "01:02:05" */
export function fmtRelogio(seg: number) {
  const s = Math.max(0, Math.floor(seg));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}
