export type Setor = 'comercial' | 'administrativo' | 'projetos' | 'terceiros';
export type TipoEstudo = 'padrao' | 'ampliacao' | 'mais_projetos';
export type ProjetoStatus = 'ativo' | 'pausado' | 'finalizado' | 'rescindido';
export type EtapaStatus = 'pendente' | 'em_andamento' | 'concluida' | 'nao_aplicavel';
export type ProtocoloTipo = 'prefeitura' | 'condominio' | 'outro_orgao' | 'entrega_cliente';
export type ProtocoloStatus =
  | 'a_protocolar' | 'protocolado' | 'em_analise' | 'exigencia' | 'aprovado' | 'entregue_ao_cliente';

export type PerfilTipo = 'admin' | 'profissional' | 'cliente';
export type Especialidade = 'arquitetonico' | 'interiores' | 'legal' | 'complementares';
export interface Profile {
  id: string; nome: string; setor: Setor; perfil: PerfilTipo; especialidades: Especialidade[];
  cliente_id: string | null; ativo: boolean; carga_semanal_horas: number;
}
export interface ProjetoEquipe {
  id: string; projeto_id: string; usuario_id: string; especialidade: Especialidade; profiles?: { nome: string } | null;
}
export type EtapaCliente = Pick<EtapaModelo, 'codigo' | 'ordem' | 'fase' | 'titulo' | 'rotulo' | 'cliente_participa' | 'opcional' | 'aceite_formal' | 'escopo'>;
export interface Documento {
  id: string; projeto_id: string; etapa_codigo: string; modelo_id: string | null; nome: string;
  codigo_arquivo: string | null; arquivo_path: string; arquivo_nome: string; created_at: string; visivel_cliente: boolean;
}
export interface Cliente {
  id: string; codigo: string | null; nome: string; categoria: string | null; premium: boolean;
  telefone: string | null; email: string | null; observacoes: string | null;
}
export interface EtapaModelo {
  codigo: string; ordem: number; fase: number; titulo: string; rotulo: string; setores: Setor[];
  cliente_participa: boolean; entrada: string | null; saida: string | null; regra: string | null;
  opcional: boolean; aceite_formal: boolean; escopo: string | null;
}
export interface Projeto {
  id: string; cliente_id: string; nome: string; codigo: string | null; responsavel_id: string | null;
  tem_legal: boolean; tem_interiores: boolean; tem_complementares: boolean; tipo_aprovacao: string | null;
  tipo_estudo: TipoEstudo; status: ProjetoStatus; pausado_em: string | null; motivo_pausa: string | null; observacoes: string | null;
  created_at: string; clientes?: Pick<Cliente, 'nome' | 'codigo'> | null; profiles?: { nome: string } | null;
  projeto_etapas?: Pick<ProjetoEtapa, 'etapa_codigo' | 'status'>[];
}
export interface ProjetoEtapa {
  id: string; projeto_id: string; etapa_codigo: string; status: EtapaStatus; responsavel_id: string | null;
  iniciada_em: string | null; concluida_em: string | null; rodadas_ajuste: number; observacao: string | null;
}
export interface Historico {
  id: string; projeto_id: string; etapa_codigo: string | null; tipo: string; texto: string | null;
  created_at: string; profiles?: { nome: string } | null;
}
export interface Protocolo {
  id: string; projeto_id: string; tipo: ProtocoloTipo; orgao: string | null; numero: string | null;
  status: ProtocoloStatus; data_protocolo: string | null; prazo: string | null;
  cliente_notificado: boolean; observacao: string | null; updated_at: string;
  projetos?: { nome: string; clientes: { nome: string } | null } | null;
}
export interface Tempo {
  id: string; projeto_id: string; etapa_codigo: string; usuario_id: string;
  iniciado_em: string; finalizado_em: string | null;
  projetos?: { nome: string } | null; profiles?: { nome: string } | null;
}
export interface BancoAjuste {
  id: string; usuario_id: string; data: string; minutos: number; motivo: string; criado_por: string | null; created_at: string;
}
export interface ProjetoTarefa {
  id: string; projeto_id: string; etapa_codigo: string; ordem: number; titulo: string; descricao: string | null; prioridade: 'Alta' | 'Média' | 'Baixa';
}
export interface ProjetoItem {
  id: string; tarefa_id: string; projeto_id: string; ordem: number; texto: string | null; feito: boolean; feito_por: string | null; feito_em: string | null;
}
