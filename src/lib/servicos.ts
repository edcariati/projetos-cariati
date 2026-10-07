import type { TipoEstudo } from './types';

/** Etapas do fluxo que valem para todo projeto (o arquitetônico é o serviço-base). */
export const ETAPAS_BASE = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '20', '21', '22', '23', '24'];

export interface Servico {
  id: string;
  nome: string;
  resumo: string;
  /** o que o cliente recebe */
  entregas: string[];
  /** etapas do fluxo que este serviço acrescenta */
  etapas: string[];
  /** serviço-base: sempre contratado */
  base?: boolean;
}

/**
 * Catálogo de serviços do escritório. Para incluir um serviço novo basta acrescentar um item aqui;
 * ele aparece no cadastro do cliente e na confirmação.
 */
export const SERVICOS: Servico[] = [
  {
    id: 'arquitetonico', nome: 'Projeto arquitetônico', base: true,
    resumo: 'Do briefing à entrega: estudo de planta baixa e de fachada, com aceite formal, e o projeto arquitetônico completo.',
    entregas: ['Estudo de planta baixa (apresentação e aceite)', 'Estudo de fachada (apresentação e aceite)', 'Projeto arquitetônico executivo', 'Reunião de entrega e encerramento'],
    etapas: [],
  },
  {
    id: 'legal', nome: 'Projeto legal (aprovação na Prefeitura)',
    resumo: 'Elaboração e protocolo do projeto para aprovação nos órgãos competentes.',
    entregas: ['Projeto legal', 'Protocolo e acompanhamento da aprovação', 'Documentos aprovados'],
    etapas: ['16'],
  },
  {
    id: 'interiores', nome: 'Projeto de interiores',
    resumo: 'Estudo de interiores com apresentação e o detalhamento para execução.',
    entregas: ['Estudo de interiores', 'Detalhamento de interiores'],
    etapas: ['17', '18'],
  },
  {
    id: 'complementares', nome: 'Projetos complementares',
    resumo: 'Coordenação e compatibilização dos projetos elétrico, hidrossanitário, iluminação e estrutural, feitos por parceiros.',
    entregas: ['Projeto elétrico', 'Projeto hidrossanitário', 'Projeto de iluminação', 'Projeto estrutural', 'Compatibilização com o arquitetônico'],
    etapas: ['19'],
  },
  {
    id: 'habitese', nome: 'Habite-se',
    resumo: 'Documentos, entrada na Prefeitura e entrega do Habite-se, depois da regularização ou com a obra pronta.',
    entregas: ['Documentos e relatório fotográfico', 'Entrada do processo na Prefeitura', 'Documentos aprovados com termo de retirada'],
    etapas: ['H1', 'H2', 'H3'],
  },
];

export const SERVICOS_OPCIONAIS = SERVICOS.filter((s) => !s.base);
export const servicoPorId = (id: string) => SERVICOS.find((s) => s.id === id);

export const ESTUDOS: { id: TipoEstudo; nome: string; desc: string }[] = [
  { id: 'padrao', nome: 'Construção nova', desc: 'Briefing, estudo de planta baixa e estudo de fachada, cada um com apresentação e aceite.' },
  { id: 'ampliacao', nome: 'Ampliação', desc: 'Parte do que já existe: estudo de ampliação em vez do estudo completo.' },
  { id: 'mais_projetos', nome: '+ Projetos (perfil D e E)', desc: 'Cliente que já tem o arquitetônico: contrata projetos adicionais, sem estudo de fachada.' },
];

/** Etapas do fluxo que o projeto vai ter com os serviços escolhidos. */
export function etapasDe(ids: string[]): string[] {
  const extra = ids.flatMap((i) => servicoPorId(i)?.etapas ?? []);
  return [...ETAPAS_BASE, ...extra];
}

/** Marcas do projeto (as mesmas do “Novo projeto”) a partir dos serviços do cliente. */
export const flagsDe = (ids: string[]) => ({
  legal: ids.includes('legal'), interiores: ids.includes('interiores'), complementares: ids.includes('complementares'), habitese: ids.includes('habitese'),
});
