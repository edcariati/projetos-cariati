export type Setor = 'comercial' | 'administrativo' | 'financeiro' | 'projetos' | 'terceiros';
export type TipoEstudo = 'padrao' | 'ampliacao' | 'mais_projetos';
export type ProjetoStatus = 'ativo' | 'pausado' | 'finalizado' | 'rescindido';
export type EtapaStatus = 'pendente' | 'em_andamento' | 'concluida' | 'nao_aplicavel';
export type ProtocoloTipo = 'prefeitura' | 'condominio' | 'outro_orgao' | 'entrega_cliente' | 'receita_federal' | 'cartorio' | 'concessionaria' | 'pausa_cliente';
export type ProtocoloStatus =
  | 'a_protocolar' | 'protocolado' | 'em_analise' | 'exigencia' | 'aprovado' | 'entregue_ao_cliente';

export type PerfilTipo = 'admin' | 'profissional' | 'cliente';
export type Especialidade = 'arquitetonico' | 'interiores' | 'legal' | 'complementares';
export interface Profile {
  id: string; nome: string; setor: Setor; perfil: PerfilTipo; especialidades: Especialidade[];
  cliente_id: string | null; ativo: boolean; carga_semanal_horas: number; email?: string | null;
}
export interface Parceiro {
  id: string; nome: string; tipo: string; tipo_pessoa: 'fisica' | 'juridica'; documento: string | null; contato: string | null;
  telefone: string | null; whatsapp: string | null; email: string | null; cidade: string | null; uf: string | null;
  observacoes: string | null; ativo: boolean; created_at?: string;
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
  telefone: string | null; email: string | null; observacoes: string | null; created_at?: string;
  tipo_pessoa: 'fisica' | 'juridica'; documento: string | null; rg: string | null; data_nascimento: string | null;
  estado_civil: string | null; nacionalidade: string | null; profissao: string | null; telefone2: string | null; whatsapp: string | null;
  contato_preferido: string | null; origem: string | null; indicado_por: string | null;
  end_cep: string | null; end_logradouro: string | null; end_numero: string | null; end_complemento: string | null; end_bairro: string | null; end_cidade: string | null; end_uf: string | null;
  empresa_razao_social: string | null; empresa_cnpj: string | null; empresa_responsavel: string | null; empresa_responsavel_cpf: string | null;
  obra_intencao: string | null; obra_metragem: number | null;
  obra_cep: string | null; obra_logradouro: string | null; obra_numero: string | null; obra_complemento: string | null; obra_bairro: string | null; obra_cidade: string | null; obra_uf: string | null;
  obra_condominio: string | null; obra_lote: string | null; obra_quadra: string | null; obra_inscricao_municipal: string | null; obra_matricula: string | null; obra_financiada: boolean | null;
  responsavel_comercial: string | null; atualizado_em?: string; atualizado_por?: string | null;
  servicos?: string[]; entregas?: string[] | null; lgpd_consentimento_em?: string | null; servico_estudo?: string | null; servico_aprovacao?: string | null; servicos_observacao?: string | null;
}
export interface EtapaModelo {
  codigo: string; ordem: number; fase: number; titulo: string; rotulo: string; setores: Setor[];
  cliente_participa: boolean; entrada: string | null; saida: string | null; regra: string | null;
  opcional: boolean; aceite_formal: boolean; escopo: string | null; horas_padrao: number;
}
export interface Projeto {
  perfil?: string | null; servicos?: string[] | null; entregas?: string[] | null; tipo_projeto?: string | null; parceiros_complementares?: string | null; servicos_observacao?: string | null;
  id: string; cliente_id: string; nome: string; codigo: string | null; responsavel_id: string | null;
  tem_legal: boolean; tem_interiores: boolean; tem_complementares: boolean; tipo_aprovacao: string | null;
  tipo_estudo: TipoEstudo; tem_habitese: boolean; horas_estimadas: number | null; status: ProjetoStatus; pausado_em: string | null; motivo_pausa: string | null; observacoes: string | null;
  created_at: string; clientes?: Pick<Cliente, 'nome' | 'codigo'> & Partial<Pick<Cliente, 'categoria' | 'servicos' | 'servico_estudo' | 'servico_aprovacao' | 'servicos_observacao'>> | null; profiles?: { nome: string } | null;
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
  iniciado_em: string; finalizado_em: string | null; manual?: boolean; nota?: string | null; tarefa_id?: string | null;
  projetos?: { nome: string } | null; profiles?: { nome: string } | null;
}
export interface BancoAjuste {
  id: string; usuario_id: string; data: string; minutos: number; motivo: string; criado_por: string | null; created_at: string;
}
export interface ProjetoTarefa {
  id: string; projeto_id: string; etapa_codigo: string; ordem: number; titulo: string; descricao: string | null; prioridade: 'Alta' | 'Média' | 'Baixa';
  responsavel_id: string | null; setor_fila: Setor | null; atribuicao_manual: boolean;
}
export interface ProjetoItem {
  id: string; tarefa_id: string; projeto_id: string; ordem: number; texto: string | null; feito: boolean; feito_por: string | null; feito_em: string | null; nota?: string | null;
}
