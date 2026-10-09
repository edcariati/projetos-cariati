import type { EtapaStatus, ProjetoStatus, ProtocoloStatus, ProtocoloTipo, Setor } from './types';

export const SETOR: Record<Setor, string> = {
  comercial: 'Comercial', administrativo: 'Administrativo', financeiro: 'Financeiro', projetos: 'Setor de Projetos', terceiros: 'Terceiros',
};
export const FASES: Record<number, string> = {
  1: 'Abertura e briefing', 2: 'Estudos e aprovações', 3: 'Desenvolvimento',
  4: 'Entrega e encerramento', 5: 'Pausa e retomada', 6: 'Habite-se',
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
  prefeitura: 'Prefeitura', condominio: 'Condomínio', receita_federal: 'Receita Federal', cartorio: 'Cartório', concessionaria: 'Concessionária',
  outro_orgao: 'Outro órgão', entrega_cliente: 'Entrega de projeto ao cliente', pausa_cliente: 'Pausa a pedido do cliente',
};
/** Protocolos internos (processo do escritório com o cliente) × externos (junto a um órgão). */
export const TIPOS_INTERNOS: ProtocoloTipo[] = ['entrega_cliente', 'pausa_cliente'];
export const TIPOS_EXTERNOS: ProtocoloTipo[] = ['prefeitura', 'condominio', 'receita_federal', 'cartorio', 'concessionaria', 'outro_orgao'];
export const ehInterno = (t: ProtocoloTipo) => TIPOS_INTERNOS.includes(t);

/** Protocolos internos usam os mesmos status com nomes próprios. */
const STATUS_INTERNO: Partial<Record<ProtocoloTipo, Partial<Record<ProtocoloStatus, string>>>> = {
  entrega_cliente: { a_protocolar: 'A entregar', protocolado: 'Entrega agendada', entregue_ao_cliente: 'Entregue (termo assinado)' },
  pausa_cliente: { a_protocolar: 'Termo a emitir', protocolado: 'Termo enviado ao cliente', entregue_ao_cliente: 'Termo assinado' },
};
export const statusProtocolo = (tipo: ProtocoloTipo, s: ProtocoloStatus) => STATUS_INTERNO[tipo]?.[s] || PROTOCOLO_STATUS[s];
export const opcoesStatus = (tipo: ProtocoloTipo) =>
  (Object.keys(PROTOCOLO_STATUS) as ProtocoloStatus[]).filter((s) => !ehInterno(tipo) || s in (STATUS_INTERNO[tipo] ?? {}));

/** Tipos de aprovação do projeto legal (Habite-se é um serviço à parte e não entra aqui). */
export const TIPOS_APROVACAO = ['residencial', 'comercial', 'unificação', 'averbação', 'regularização'];

/** Tipos de projeto do “Novo projeto”: etiqueta do nome e o que cada um preenche sozinho. */
export const TIPOS_PROJETO: { id: string; rotulo: string; etiqueta: string; legal?: boolean; aprov?: string[]; estudo?: 'ampliacao'; interiores?: boolean }[] = [
  { id: 'unifamiliar', rotulo: 'Residencial unifamiliar', etiqueta: 'RESIDÊNCIA', legal: true, aprov: ['residencial'] },
  { id: 'multifamiliar', rotulo: 'Residencial multifamiliar', etiqueta: 'PORTAL', legal: true, aprov: ['residencial'] },
  { id: 'comercial', rotulo: 'Comercial', etiqueta: 'COMERCIAL', legal: true, aprov: ['comercial'] },
  { id: 'reforma', rotulo: 'Reforma', etiqueta: 'REFORMA' },
  { id: 'interiores', rotulo: 'Interiores', etiqueta: 'INTERIORES', interiores: true },
  { id: 'ampliacao', rotulo: 'Ampliação', etiqueta: 'AMPLIAÇÃO', legal: true, aprov: ['residencial'], estudo: 'ampliacao' },
  { id: 'regularizacao', rotulo: 'Regularização', etiqueta: 'REGULARIZAÇÃO', legal: true, aprov: ['regularização'] },
  { id: 'outros', rotulo: 'Outros…', etiqueta: '' },
];

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

export const PERFIL: Record<string, string> = { admin: 'Administrador', profissional: 'Profissional', cliente: 'Cliente' };
export const ESPECIALIDADE: Record<string, string> = {
  arquitetonico: 'Arquitetônico', interiores: 'Interiores', legal: 'Legal (aprovações)', complementares: 'Complementares',
};

export const TIPO_ESTUDO: Record<string, string> = { padrao: 'Estudo padrão', ampliacao: 'Ampliação', mais_projetos: '+ Projetos' };
export const TIPO_ESTUDO_DESC: Record<string, string> = {
  padrao: 'Construção nova: briefing, estudo de planta baixa e estudo de fachada, cada um com apresentação e aceite.',
  ampliacao: 'O cliente já tem espaço construído: aferição no espaço, estudo de layout e estudo 3D no lugar da fachada.',
  mais_projetos: 'Perfil D e E (+ Projetos): croqui e fachadas juntos, apresentados numa só reunião.',
};
/** Na ampliação, as etapas de fachada (11 a 14) são o estudo 3D. */
const ETAPAS_3D: Record<string, string> = {
  '11': 'Estudo 3D', '12': 'Agendamento da apresentação do estudo 3D', '13': 'Apresentação do estudo 3D', '14': 'Aceite formal do estudo 3D',
};
export const tituloEtapa = (codigo: string, titulo: string, tipo?: string) => (tipo === 'ampliacao' && ETAPAS_3D[codigo]) || titulo;

export const PARCEIRO_TIPO: Record<string, string> = {
  estrutural: 'Projeto estrutural', eletrica_hidraulica: 'Elétrica e hidráulica', engenharia: 'Engenharia / obra', topografia: 'Topografia',
  paisagismo: 'Paisagismo', luminotecnico: 'Luminotécnico', despachante: 'Despachante', fornecedor: 'Fornecedor', outro: 'Outro',
};
