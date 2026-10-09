import type { TipoEstudo } from './types';

export interface Item { id: string; nome: string; ativo: boolean; /** entra sozinho quando o cliente é Premium */ premium?: boolean }
export interface Categoria {
  id: string; nome: string;
  /** etapas do fluxo acrescentadas quando algum serviço da categoria é contratado (vazio = ainda sem etapas próprias) */
  etapas: string[];
  /** quem executa: o escritório ou um parceiro (nesse caso a Cariati acompanha e confere a compatibilização) */
  execucao: 'escritorio' | 'parceiro';
  itens: Item[]; ativo: boolean;
}
export interface Perfil {
  id: string; nome: string; faixa: string;
  /** checklist padrão da proposta para este perfil */
  entregas: string[]; estudo: TipoEstudo;
  area_min: number | null; area_max: number | null; sugerir: boolean; ativo: boolean;
}
export interface Catalogo { categorias: Categoria[]; perfis: Perfil[]; doBanco: boolean }

/**
 * Catálogo padrão do escritório (fonte: lista enviada pelo escritório). É o ponto de partida gravado no banco
 * (migração 0019) e o que o app usa se as tabelas ainda não existirem. Depois disso, o administrador edita em Cadastros → Serviços e perfis.
 */
interface CategoriaPadrao { id: string; nome: string; itens: string[]; etapas?: string[] }

/**
 * Catálogo de serviços do escritório (fonte: lista enviada pelo escritório).
 * Cada serviço tem o id `<categoria>-<número>`, ex.: `estrutural-04`.
 */
const CATEGORIAS_PADRAO: CategoriaPadrao[] = [
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


type PerfilPadrao = Omit<Perfil, 'area_min' | 'area_max' | 'sugerir' | 'ativo'>;
const A_BASE = ['Briefing detalhado e programa de necessidades', 'Levantamento fotográfico da área'];
const A_CRIACAO = ['Criação Personalizada e exclusiva', 'Estudo de Layout e fluxos', 'Estudo de Volumetrias', 'Estudo de Ventilação e iluminação natural analítica'];
const A_PROJ = ['Projeto Arquitetônico completo', 'Projeto para Aprovação na Prefeitura + Documentação'];
const A3D = ['Projeto 3D – Fachada', 'Projeto 3D – Parte interna referência visual', 'Projeto em fotorrealismo Parte interna e externa'];
const CROQUI = [
  'Ideia do cliente (Alinhamento da ideia do Croqui)', 'Formatação do projeto (Apresentação com base no croqui)',
  'Apresentação da planta do croqui apresentado (com escolha do tipo de telhado padrão)', 'Documento da prefeitura', 'Aprovação prefeitura', 'Não há alterações no projeto apresentado'];

const PERFIS_PADRAO: PerfilPadrao[] = [
  { id: 'A4', nome: 'Perfil A4', faixa: '1500 m² ou mais', estudo: 'padrao', entregas: [...A_BASE, ...A_CRIACAO, ...A_PROJ, 'Projeto 3D – Fachada', 'Projeto 3D – Parte interna referência visual', 'Projeto em fotorrealismo Parte interna e externa', 'Tour 360 do Projetos', 'Vídeo do projeto em 3D realista', 'Documentação Técnica Aprova Digital', 'Projeto para Aprovação em Condomínio (se necessário)', 'Reunião de apresentação e ajustes', 'Compatibilização com os projetos complementares'] },
  { id: 'A3', nome: 'Perfil A3', faixa: '800 a 1500 m²', estudo: 'padrao', entregas: [...A_BASE, ...A_CRIACAO, ...A_PROJ, ...A3D, 'Documentação Técnica Aprova Digital', 'Projeto para Aprovação em Condomínio (se necessário)', 'Reunião de apresentação e ajustes', 'Compatibilização com os projetos complementares'] },
  { id: 'A2', nome: 'Perfil A2', faixa: '500 a 800 m²', estudo: 'padrao', entregas: [...A_BASE, ...A_CRIACAO, ...A_PROJ, ...A3D, 'Documentação Técnica Aprova Digital', 'Projeto para Aprovação em Condomínio (se necessário)', 'Reunião de apresentação e ajustes', 'Compatibilização com os projetos complementares'] },
  { id: 'A1', nome: 'Perfil A1', faixa: '250 a 500 m²', estudo: 'padrao', entregas: [...A_BASE, 'Estudo de Layout e fluxos', ...A_PROJ, ...A3D, 'Documentação Técnica Aprova Digital', 'Projeto para Aprovação em Condomínio (se necessário)', 'Reunião de apresentação e ajustes'] },
  { id: 'B', nome: 'Perfil B', faixa: '150 a 250 m²', estudo: 'padrao', entregas: [...A_BASE, 'Estudo de Layout e fluxos', ...A_PROJ, 'Projeto 3D – Fachada (Referência Visual realista)', 'Projeto 3D – Parte interna (Referência Visual realista)', 'Documentação Técnica Aprova Digital', 'Projeto para Aprovação em Condomínio (se necessário)', 'Reunião de apresentação e ajustes'] },
  { id: 'C', nome: 'Perfil C', faixa: '30 a 150 m²', estudo: 'padrao', entregas: [...A_BASE, 'Estudo de Layout e fluxos', ...A_PROJ, 'Projeto 3D – Fachada (Referência Visual realista)', 'Documentação Técnica AprovaDigital', 'Projeto para Aprovação em Condomínio (se necessário)', 'Reunião de apresentação e ajustes'] },
  { id: 'D', nome: 'Perfil D (+ Projetos)', faixa: '100 a 150 m²', estudo: 'mais_projetos', entregas: CROQUI },
  { id: 'E', nome: 'Perfil E (+ Projetos)', faixa: '30 a 100 m²', estudo: 'mais_projetos', entregas: CROQUI },
];

const FAIXAS: Record<string, [number | null, number | null, boolean]> = { A4: [1500, null, true], A3: [800, 1500, true], A2: [500, 800, true], A1: [250, 500, true], B: [150, 250, true], C: [30, 150, true], D: [100, 150, false], E: [30, 100, false] };

export const PADRAO: Catalogo = {
  doBanco: false,
  categorias: CATEGORIAS_PADRAO.map((c) => ({ id: c.id, nome: c.nome, etapas: c.etapas ?? [], execucao: ['estrutural', 'hidro', 'eletrico', 'reuso'].includes(c.id) ? 'parceiro' : 'escritorio', ativo: true, itens: c.itens.map((nome, i) => ({ id: idServico(c.id, i), nome, ativo: true })) })),
  perfis: PERFIS_PADRAO.map((p) => ({ ...p, area_min: FAIXAS[p.id][0], area_max: FAIXAS[p.id][1], sugerir: FAIXAS[p.id][2], ativo: true })),
};

export function idServico(cat: string, n: number) { return `${cat}-${String(n + 1).padStart(2, '0')}`; }


export const NOTA_PARCEIRO = 'Executado por parceiro. A Cariati acompanha o projeto e confere a compatibilização com o arquitetônico.';
