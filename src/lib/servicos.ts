import type { TipoEstudo } from './types';

/** Etapas do fluxo que valem para todo projeto (o arquitetônico é o serviço-base). */
export const ETAPAS_BASE = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '20', '21', '22', '23', '24'];

export interface Categoria {
  id: string;
  nome: string;
  /** serviços da categoria, na ordem do catálogo do escritório */
  itens: string[];
  /** etapas do fluxo acrescentadas quando algum serviço da categoria é contratado (vazio = ainda sem etapas próprias) */
  etapas?: string[];
}

/**
 * Catálogo de serviços do escritório (fonte: lista enviada pelo escritório).
 * Cada serviço tem o id `<categoria>-<número>`, ex.: `estrutural-04`.
 */
export const CATEGORIAS: Categoria[] = [
  { id: 'arq', nome: 'Projeto Arquitetônico', itens: [
    'Consultoria Arquitetônica', 'Briefing', 'Programa de Necessidades', 'Levantamento Fotográfico', 'Levantamento da Área de Reforma', 'Levantamento para Regularização de Imóvel',
    'Estudo de Layout', 'Projeto Arquitetônico', 'Projeto Prefeitura', 'Documentação Prefeitura', 'Projeto 3D', 'Estudo de Fachada', 'Documentação Técnica (Aprova Fácil)',
    'Projeto Condomínio', 'Projetos de Reformas'] },
  { id: 'caixa', nome: 'Documentação Caixa', itens: [
    'Consultoria Documentação Caixa', 'PCI — Projeto Complementar de Instalações (inclui CNO)', 'PLS — Cronograma Físico-Financeiro (mensal por duração da obra)',
    'Montagem da Planilha CAIXA', 'Documentação CAIXA (Financiamento)'] },
  { id: 'estrutural', nome: 'Projeto Estrutural', etapas: ['19'], itens: [
    'Consultoria Estrutural', 'Estudo de Viabilidade Estrutural', 'Projeto Estrutural Preliminar', 'Projeto Estrutural Executivo', 'Projeto de Fundações', 'Projeto de Contenção / Escavação',
    'Cálculo Estrutural (Memorial de Cálculo)', 'Projeto de Reforço Estrutural', 'Laudo de Avaliação Estrutural', 'Projeto de Reforma / Retrofit Estrutural', 'Compatibilização Arquitetura/Hidro/Elétrica'] },
  { id: 'hidro', nome: 'Projeto Hidrossanitário', etapas: ['19'], itens: [
    'Consultoria Hidrossanitária', 'Projeto de Água Fria', 'Projeto de Água Quente', 'Projeto de Esgoto Sanitário', 'Projeto de Drenagem Pluvial', 'Projeto de Gás (GLP/GN)',
    'Projeto de Reuso de Água', 'Dimensionamento de Reservatórios', 'Compatibilização Hidrossanitária com Arquitetura/Estrutura'] },
  { id: 'eletrico', nome: 'Projeto Elétrico', etapas: ['19'], itens: [
    'Consultoria Elétrica', 'Projeto de Distribuição (Quadros, Circuitos, Iluminação e Tomadas)', 'Projeto de Força (Motores, Máquinas, Cargas Especiais)', 'Projeto de Iluminação (Natural + Artificial)',
    'Projeto de Telefonia e Dados (Cabeamento Estruturado)', 'Projeto de Aterramento e SPDA', 'Projeto de Energia Solar', 'Compatibilização Elétrica com Arquitetura/Estrutura/Hidrossanitário'] },
  { id: 'reuso', nome: 'Reuso de Água + Cisterna', etapas: ['19'], itens: [
    'Consultoria no Reuso', 'Projeto de Cisterna (Captação de Água Pluvial)', 'Projeto de Tratamento e Filtragem de Água Reutilizável', 'Projeto de Distribuição de Água Reutilizada',
    'Projeto de Bombeamento e Pressurização', 'Projeto de Monitoramento e Controle de Qualidade', 'Projeto de Integração com Sistemas Hidrossanitários', 'Projeto de Sustentabilidade e Economia de Água',
    'Tratamento e Filtragem', 'Compatibilização de Reuso com Arquitetura/Estrutura/Hidrossanitário'] },
  { id: 'evf', nome: 'EVF — Estudo de Viabilidade Financeira', itens: [
    'Consultoria EVF', 'Prévia da Planilha de Produtos e Serviços', 'Levantamento dos Orçamentos – Materiais', 'Levantamento dos Orçamentos – Mão de Obra Especializada',
    'Organização dos Itens Propostos junto ao Projeto', 'Reunião de Apresentação do EVF'] },
  { id: 'interiores', nome: 'Decoração de Interiores', etapas: ['17', '18'], itens: [
    'Consultoria Interiores', 'Pisos e Revestimentos', 'Marmoraria', 'Louças e Metais', 'Pinturas e Texturas', 'Esquadrias e Aberturas', 'Marcenarias', 'Mobiliários Soltos',
    'Luminotécnico', 'Forros e Gessos', 'Eletros', 'Pontos Técnicos dos Eletros'] },
  { id: 'prefeitura', nome: 'Serviços de Prefeitura', etapas: ['16'], itens: [
    'Unificação / Desmembramento', 'Averbação de Construção', 'Desdobro de Lote', 'Regularização de Obras', 'Regularização na Receita Federal (CNO)', 'Habite-se'] },
];

export const idServico = (cat: string, i: number) => `${cat}-${String(i + 1).padStart(2, '0')}`;
export const nomeServico = (id: string) => {
  const [c, n] = id.split('-'); const cat = CATEGORIAS.find((x) => x.id === c);
  return cat ? { categoria: cat.nome, nome: cat.itens[Number(n) - 1] ?? id } : { categoria: '', nome: id };
};

export interface Perfil {
  id: string; nome: string; faixa: string;
  /** checklist padrão da proposta para este perfil */
  entregas: string[];
  estudo: TipoEstudo;
}

const A_BASE = ['Briefing detalhado e programa de necessidades', 'Levantamento fotográfico da área'];
const A_CRIACAO = ['Criação Personalizada e exclusiva', 'Estudo de Layout e fluxos', 'Estudo de Volumetrias', 'Estudo de Ventilação e iluminação natural analítica'];
const A_PROJ = ['Projeto Arquitetônico completo', 'Projeto para Aprovação na Prefeitura + Documentação'];
const A3D = ['Projeto 3D – Fachada', 'Projeto 3D – Parte interna referência visual', 'Projeto em fotorrealismo Parte interna e externa'];
const CROQUI = [
  'Ideia do cliente (Alinhamento da ideia do Croqui)', 'Formatação do projeto (Apresentação com base no croqui)',
  'Apresentação da planta do croqui apresentado (com escolha do tipo de telhado padrão)', 'Documento da prefeitura', 'Aprovação prefeitura', 'Não há alterações no projeto apresentado'];

/** Entregáveis do projeto arquitetônico por perfil do cliente (por metragem). */
export const PERFIS: Perfil[] = [
  { id: 'A4', nome: 'Perfil A4', faixa: '1500 m² ou mais', estudo: 'padrao', entregas: [...A_BASE, ...A_CRIACAO, ...A_PROJ, 'Projeto 3D – Fachada', 'Projeto 3D – Parte interna referência visual', 'Projeto em fotorrealismo Parte interna e externa', 'Tour 360 do Projetos', 'Vídeo do projeto em 3D realista', 'Documentação Técnica Aprova Digital', 'Projeto para Aprovação em Condomínio (se necessário)', 'Reunião de apresentação e ajustes', 'Compatibilização com os projetos complementares'] },
  { id: 'A3', nome: 'Perfil A3', faixa: '800 a 1500 m²', estudo: 'padrao', entregas: [...A_BASE, ...A_CRIACAO, ...A_PROJ, ...A3D, 'Documentação Técnica Aprova Digital', 'Projeto para Aprovação em Condomínio (se necessário)', 'Reunião de apresentação e ajustes', 'Compatibilização com os projetos complementares'] },
  { id: 'A2', nome: 'Perfil A2', faixa: '500 a 800 m²', estudo: 'padrao', entregas: [...A_BASE, ...A_CRIACAO, ...A_PROJ, ...A3D, 'Documentação Técnica Aprova Digital', 'Projeto para Aprovação em Condomínio (se necessário)', 'Reunião de apresentação e ajustes', 'Compatibilização com os projetos complementares'] },
  { id: 'A1', nome: 'Perfil A1', faixa: '250 a 500 m²', estudo: 'padrao', entregas: [...A_BASE, 'Estudo de Layout e fluxos', ...A_PROJ, ...A3D, 'Documentação Técnica Aprova Digital', 'Projeto para Aprovação em Condomínio (se necessário)', 'Reunião de apresentação e ajustes'] },
  { id: 'B', nome: 'Perfil B', faixa: '150 a 250 m²', estudo: 'padrao', entregas: [...A_BASE, 'Estudo de Layout e fluxos', ...A_PROJ, 'Projeto 3D – Fachada (Referência Visual realista)', 'Projeto 3D – Parte interna (Referência Visual realista)', 'Documentação Técnica Aprova Digital', 'Projeto para Aprovação em Condomínio (se necessário)', 'Reunião de apresentação e ajustes'] },
  { id: 'C', nome: 'Perfil C', faixa: '30 a 150 m²', estudo: 'padrao', entregas: [...A_BASE, 'Estudo de Layout e fluxos', ...A_PROJ, 'Projeto 3D – Fachada (Referência Visual realista)', 'Documentação Técnica AprovaDigital', 'Projeto para Aprovação em Condomínio (se necessário)', 'Reunião de apresentação e ajustes'] },
  { id: 'D', nome: 'Perfil D (+ Projetos)', faixa: '100 a 150 m²', estudo: 'mais_projetos', entregas: CROQUI },
  { id: 'E', nome: 'Perfil E (+ Projetos)', faixa: '30 a 100 m²', estudo: 'mais_projetos', entregas: CROQUI },
];
export const perfilPorId = (id: string | null | undefined) => PERFIS.find((p) => p.id === id);

/** Perfil sugerido pela metragem (D e E dependem do tipo de serviço, então não entram). */
export function perfilSugerido(m2: number): string | null {
  if (!Number.isFinite(m2) || m2 <= 0) return null;
  if (m2 >= 1500) return 'A4'; if (m2 >= 800) return 'A3'; if (m2 >= 500) return 'A2'; if (m2 >= 250) return 'A1'; if (m2 >= 150) return 'B'; return 'C';
}

export const ESTUDOS: { id: TipoEstudo; nome: string; desc: string }[] = [
  { id: 'padrao', nome: 'Construção nova', desc: 'Briefing, estudo de planta baixa e estudo de fachada, cada um com apresentação e aceite.' },
  { id: 'ampliacao', nome: 'Ampliação', desc: 'Parte do que já existe: estudo de ampliação em vez do estudo completo.' },
  { id: 'mais_projetos', nome: '+ Projetos (perfil D e E)', desc: 'Projeto a partir do croqui do cliente, sem estudo de fachada.' },
];

/** Marcas do projeto (as mesmas do “Novo projeto”) a partir do perfil e dos serviços escolhidos. */
export function flagsDe(ids: string[], perfil?: string | null) {
  const cats = new Set(ids.map((i) => i.split('-')[0]));
  const aprov = (p: string | null | undefined) => (perfilPorId(p)?.entregas ?? []).some((e) => /prefeitura/i.test(e));
  const preff = ids.filter((i) => i.startsWith('prefeitura-') && i !== 'prefeitura-06').length > 0 || ids.some((i) => ['arq-09', 'arq-10', 'arq-13'].includes(i));
  return {
    legal: preff || aprov(perfil),
    interiores: cats.has('interiores'),
    complementares: ['caixa', 'estrutural', 'hidro', 'eletrico', 'reuso'].some((c) => cats.has(c)),
    habitese: ids.includes('prefeitura-06'),
  };
}

/** Etapas do fluxo que o projeto vai ter com o perfil e os serviços escolhidos. */
export function etapasDe(ids: string[], perfil?: string | null): string[] {
  const f = flagsDe(ids, perfil);
  const extra = [...(f.legal ? ['16'] : []), ...(f.interiores ? ['17', '18'] : []), ...(f.complementares ? ['19'] : []), ...(f.habitese ? ['H1', 'H2', 'H3'] : [])];
  return [...ETAPAS_BASE, ...extra];
}

/** Categorias contratadas que ainda não têm etapas próprias no fluxo (viram só marca no cadastro). */
export const semFluxo = (ids: string[]) => CATEGORIAS.filter((c) => !c.etapas?.length && c.id !== 'arq' && ids.some((i) => i.startsWith(c.id + '-')));
