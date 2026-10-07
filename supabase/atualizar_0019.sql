-- Catálogo de serviços e perfis editáveis (0019). Para o banco que já tem as migrations até a 0018. Rode uma única vez.

-- ===== 0019_catalogo_servicos.sql =====
-- Catálogo de serviços e perfis de cliente editáveis pelo administrador (Cadastros → Serviços e perfis).
-- Os ids dos serviços (ex.: estrutural-04) ficam gravados nos clientes: por isso um serviço em uso só é desativado, nunca apagado.

create table if not exists servico_categorias (
  id text primary key,
  nome text not null,
  etapas text[] not null default '{}',          -- etapas do fluxo acrescentadas quando algum serviço da categoria é contratado
  execucao text not null default 'escritorio' check (execucao in ('escritorio','parceiro')),  -- parceiro = a Cariati acompanha e confere a compatibilização
  ordem int not null default 0,
  ativo boolean not null default true
);
create table if not exists servico_itens (
  id text primary key,                          -- <categoria>-<número>, estável
  categoria_id text not null references servico_categorias(id) on delete cascade,
  nome text not null,
  ordem int not null default 0,
  ativo boolean not null default true
);
create index if not exists servico_itens_cat on servico_itens (categoria_id, ordem);
create table if not exists perfis_cliente (
  id text primary key,                          -- A1, A2, B, C, D…
  nome text not null,
  faixa text not null default '',               -- texto exibido, ex.: 150 a 250 m²
  estudo text not null default 'padrao' check (estudo in ('padrao','ampliacao','mais_projetos')),
  entregas text[] not null default '{}',        -- checklist padrão da proposta
  area_min numeric(8,1), area_max numeric(8,1), -- usados para sugerir o perfil pela metragem
  sugerir boolean not null default true,
  ordem int not null default 0,
  ativo boolean not null default true
);

alter table servico_categorias enable row level security;
alter table servico_itens enable row level security;
alter table perfis_cliente enable row level security;
create policy servcat_ler on servico_categorias for select to authenticated using (true);   -- o cliente também vê os nomes dos serviços do próprio projeto
create policy servcat_escrever on servico_categorias for all to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy servit_ler on servico_itens for select to authenticated using (true);
create policy servit_escrever on servico_itens for all to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy perfcli_ler on perfis_cliente for select to authenticated using (true);
create policy perfcli_escrever on perfis_cliente for all to authenticated using ((select is_admin())) with check ((select is_admin()));
grant select, insert, update, delete on servico_categorias, servico_itens, perfis_cliente to authenticated;

insert into servico_categorias (id, nome, etapas, ordem, execucao) values
  ('arq', 'Projeto Arquitetônico', array[]::text[], 1, 'escritorio'),
  ('caixa', 'Documentação Caixa', array[]::text[], 2, 'escritorio'),
  ('estrutural', 'Projeto Estrutural', array['19']::text[], 3, 'parceiro'),
  ('hidro', 'Projeto Hidrossanitário', array['19']::text[], 4, 'parceiro'),
  ('eletrico', 'Projeto Elétrico', array['19']::text[], 5, 'parceiro'),
  ('reuso', 'Reuso de Água + Cisterna', array['19']::text[], 6, 'parceiro'),
  ('evf', 'EVF — Estudo de Viabilidade Financeira', array[]::text[], 7, 'escritorio'),
  ('interiores', 'Decoração de Interiores', array['17', '18']::text[], 8, 'escritorio'),
  ('prefeitura', 'Serviços de Prefeitura', array['16']::text[], 9, 'escritorio')
on conflict (id) do nothing;

insert into servico_itens (id, categoria_id, nome, ordem) values
  ('arq-01', 'arq', 'Consultoria Arquitetônica', 1),
  ('arq-02', 'arq', 'Briefing', 2),
  ('arq-03', 'arq', 'Programa de Necessidades', 3),
  ('arq-04', 'arq', 'Levantamento Fotográfico', 4),
  ('arq-05', 'arq', 'Levantamento da Área de Reforma', 5),
  ('arq-06', 'arq', 'Levantamento para Regularização de Imóvel', 6),
  ('arq-07', 'arq', 'Estudo de Layout', 7),
  ('arq-08', 'arq', 'Projeto Arquitetônico', 8),
  ('arq-09', 'arq', 'Projeto Prefeitura', 9),
  ('arq-10', 'arq', 'Documentação Prefeitura', 10),
  ('arq-11', 'arq', 'Projeto 3D', 11),
  ('arq-12', 'arq', 'Estudo de Fachada', 12),
  ('arq-13', 'arq', 'Documentação Técnica (Aprova Fácil)', 13),
  ('arq-14', 'arq', 'Projeto Condomínio', 14),
  ('arq-15', 'arq', 'Projetos de Reformas', 15),
  ('caixa-01', 'caixa', 'Consultoria Documentação Caixa', 1),
  ('caixa-02', 'caixa', 'PCI — Projeto Complementar de Instalações (inclui CNO)', 2),
  ('caixa-03', 'caixa', 'PLS — Cronograma Físico-Financeiro (mensal por duração da obra)', 3),
  ('caixa-04', 'caixa', 'Montagem da Planilha CAIXA', 4),
  ('caixa-05', 'caixa', 'Documentação CAIXA (Financiamento)', 5),
  ('estrutural-01', 'estrutural', 'Consultoria Estrutural', 1),
  ('estrutural-02', 'estrutural', 'Estudo de Viabilidade Estrutural', 2),
  ('estrutural-03', 'estrutural', 'Projeto Estrutural Preliminar', 3),
  ('estrutural-04', 'estrutural', 'Projeto Estrutural Executivo', 4),
  ('estrutural-05', 'estrutural', 'Projeto de Fundações', 5),
  ('estrutural-06', 'estrutural', 'Projeto de Contenção / Escavação', 6),
  ('estrutural-07', 'estrutural', 'Cálculo Estrutural (Memorial de Cálculo)', 7),
  ('estrutural-08', 'estrutural', 'Projeto de Reforço Estrutural', 8),
  ('estrutural-09', 'estrutural', 'Laudo de Avaliação Estrutural', 9),
  ('estrutural-10', 'estrutural', 'Projeto de Reforma / Retrofit Estrutural', 10),
  ('estrutural-11', 'estrutural', 'Compatibilização Arquitetura/Hidro/Elétrica', 11),
  ('hidro-01', 'hidro', 'Consultoria Hidrossanitária', 1),
  ('hidro-02', 'hidro', 'Projeto de Água Fria', 2),
  ('hidro-03', 'hidro', 'Projeto de Água Quente', 3),
  ('hidro-04', 'hidro', 'Projeto de Esgoto Sanitário', 4),
  ('hidro-05', 'hidro', 'Projeto de Drenagem Pluvial', 5),
  ('hidro-06', 'hidro', 'Projeto de Gás (GLP/GN)', 6),
  ('hidro-07', 'hidro', 'Projeto de Reuso de Água', 7),
  ('hidro-08', 'hidro', 'Dimensionamento de Reservatórios', 8),
  ('hidro-09', 'hidro', 'Compatibilização Hidrossanitária com Arquitetura/Estrutura', 9),
  ('eletrico-01', 'eletrico', 'Consultoria Elétrica', 1),
  ('eletrico-02', 'eletrico', 'Projeto de Distribuição (Quadros, Circuitos, Iluminação e Tomadas)', 2),
  ('eletrico-03', 'eletrico', 'Projeto de Força (Motores, Máquinas, Cargas Especiais)', 3),
  ('eletrico-04', 'eletrico', 'Projeto de Iluminação (Natural + Artificial)', 4),
  ('eletrico-05', 'eletrico', 'Projeto de Telefonia e Dados (Cabeamento Estruturado)', 5),
  ('eletrico-06', 'eletrico', 'Projeto de Aterramento e SPDA', 6),
  ('eletrico-07', 'eletrico', 'Projeto de Energia Solar', 7),
  ('eletrico-08', 'eletrico', 'Compatibilização Elétrica com Arquitetura/Estrutura/Hidrossanitário', 8),
  ('reuso-01', 'reuso', 'Consultoria no Reuso', 1),
  ('reuso-02', 'reuso', 'Projeto de Cisterna (Captação de Água Pluvial)', 2),
  ('reuso-03', 'reuso', 'Projeto de Tratamento e Filtragem de Água Reutilizável', 3),
  ('reuso-04', 'reuso', 'Projeto de Distribuição de Água Reutilizada', 4),
  ('reuso-05', 'reuso', 'Projeto de Bombeamento e Pressurização', 5),
  ('reuso-06', 'reuso', 'Projeto de Monitoramento e Controle de Qualidade', 6),
  ('reuso-07', 'reuso', 'Projeto de Integração com Sistemas Hidrossanitários', 7),
  ('reuso-08', 'reuso', 'Projeto de Sustentabilidade e Economia de Água', 8),
  ('reuso-09', 'reuso', 'Tratamento e Filtragem', 9),
  ('reuso-10', 'reuso', 'Compatibilização de Reuso com Arquitetura/Estrutura/Hidrossanitário', 10),
  ('evf-01', 'evf', 'Consultoria EVF', 1),
  ('evf-02', 'evf', 'Prévia da Planilha de Produtos e Serviços', 2),
  ('evf-03', 'evf', 'Levantamento dos Orçamentos – Materiais', 3),
  ('evf-04', 'evf', 'Levantamento dos Orçamentos – Mão de Obra Especializada', 4),
  ('evf-05', 'evf', 'Organização dos Itens Propostos junto ao Projeto', 5),
  ('evf-06', 'evf', 'Reunião de Apresentação do EVF', 6),
  ('interiores-01', 'interiores', 'Consultoria Interiores', 1),
  ('interiores-02', 'interiores', 'Pisos e Revestimentos', 2),
  ('interiores-03', 'interiores', 'Marmoraria', 3),
  ('interiores-04', 'interiores', 'Louças e Metais', 4),
  ('interiores-05', 'interiores', 'Pinturas e Texturas', 5),
  ('interiores-06', 'interiores', 'Esquadrias e Aberturas', 6),
  ('interiores-07', 'interiores', 'Marcenarias', 7),
  ('interiores-08', 'interiores', 'Mobiliários Soltos', 8),
  ('interiores-09', 'interiores', 'Luminotécnico', 9),
  ('interiores-10', 'interiores', 'Forros e Gessos', 10),
  ('interiores-11', 'interiores', 'Eletros', 11),
  ('interiores-12', 'interiores', 'Pontos Técnicos dos Eletros', 12),
  ('prefeitura-01', 'prefeitura', 'Unificação / Desmembramento', 1),
  ('prefeitura-02', 'prefeitura', 'Averbação de Construção', 2),
  ('prefeitura-03', 'prefeitura', 'Desdobro de Lote', 3),
  ('prefeitura-04', 'prefeitura', 'Regularização de Obras', 4),
  ('prefeitura-05', 'prefeitura', 'Regularização na Receita Federal (CNO)', 5),
  ('prefeitura-06', 'prefeitura', 'Habite-se', 6)
on conflict (id) do nothing;

insert into perfis_cliente (id, nome, faixa, estudo, entregas, area_min, area_max, sugerir, ordem) values
  ('A4', 'Perfil A4', '1500 m² ou mais', 'padrao', array['Briefing detalhado e programa de necessidades', 'Levantamento fotográfico da área', 'Criação Personalizada e exclusiva', 'Estudo de Layout e fluxos', 'Estudo de Volumetrias', 'Estudo de Ventilação e iluminação natural analítica', 'Projeto Arquitetônico completo', 'Projeto para Aprovação na Prefeitura + Documentação', 'Projeto 3D – Fachada', 'Projeto 3D – Parte interna referência visual', 'Projeto em fotorrealismo Parte interna e externa', 'Tour 360 do Projetos', 'Vídeo do projeto em 3D realista', 'Documentação Técnica Aprova Digital', 'Projeto para Aprovação em Condomínio (se necessário)', 'Reunião de apresentação e ajustes', 'Compatibilização com os projetos complementares']::text[], 1500, null, true, 1),
  ('A3', 'Perfil A3', '800 a 1500 m²', 'padrao', array['Briefing detalhado e programa de necessidades', 'Levantamento fotográfico da área', 'Criação Personalizada e exclusiva', 'Estudo de Layout e fluxos', 'Estudo de Volumetrias', 'Estudo de Ventilação e iluminação natural analítica', 'Projeto Arquitetônico completo', 'Projeto para Aprovação na Prefeitura + Documentação', 'Projeto 3D – Fachada', 'Projeto 3D – Parte interna referência visual', 'Projeto em fotorrealismo Parte interna e externa', 'Documentação Técnica Aprova Digital', 'Projeto para Aprovação em Condomínio (se necessário)', 'Reunião de apresentação e ajustes', 'Compatibilização com os projetos complementares']::text[], 800, 1500, true, 2),
  ('A2', 'Perfil A2', '500 a 800 m²', 'padrao', array['Briefing detalhado e programa de necessidades', 'Levantamento fotográfico da área', 'Criação Personalizada e exclusiva', 'Estudo de Layout e fluxos', 'Estudo de Volumetrias', 'Estudo de Ventilação e iluminação natural analítica', 'Projeto Arquitetônico completo', 'Projeto para Aprovação na Prefeitura + Documentação', 'Projeto 3D – Fachada', 'Projeto 3D – Parte interna referência visual', 'Projeto em fotorrealismo Parte interna e externa', 'Documentação Técnica Aprova Digital', 'Projeto para Aprovação em Condomínio (se necessário)', 'Reunião de apresentação e ajustes', 'Compatibilização com os projetos complementares']::text[], 500, 800, true, 3),
  ('A1', 'Perfil A1', '250 a 500 m²', 'padrao', array['Briefing detalhado e programa de necessidades', 'Levantamento fotográfico da área', 'Estudo de Layout e fluxos', 'Projeto Arquitetônico completo', 'Projeto para Aprovação na Prefeitura + Documentação', 'Projeto 3D – Fachada', 'Projeto 3D – Parte interna referência visual', 'Projeto em fotorrealismo Parte interna e externa', 'Documentação Técnica Aprova Digital', 'Projeto para Aprovação em Condomínio (se necessário)', 'Reunião de apresentação e ajustes']::text[], 250, 500, true, 4),
  ('B', 'Perfil B', '150 a 250 m²', 'padrao', array['Briefing detalhado e programa de necessidades', 'Levantamento fotográfico da área', 'Estudo de Layout e fluxos', 'Projeto Arquitetônico completo', 'Projeto para Aprovação na Prefeitura + Documentação', 'Projeto 3D – Fachada (Referência Visual realista)', 'Projeto 3D – Parte interna (Referência Visual realista)', 'Documentação Técnica Aprova Digital', 'Projeto para Aprovação em Condomínio (se necessário)', 'Reunião de apresentação e ajustes']::text[], 150, 250, true, 5),
  ('C', 'Perfil C', '30 a 150 m²', 'padrao', array['Briefing detalhado e programa de necessidades', 'Levantamento fotográfico da área', 'Estudo de Layout e fluxos', 'Projeto Arquitetônico completo', 'Projeto para Aprovação na Prefeitura + Documentação', 'Projeto 3D – Fachada (Referência Visual realista)', 'Documentação Técnica AprovaDigital', 'Projeto para Aprovação em Condomínio (se necessário)', 'Reunião de apresentação e ajustes']::text[], 30, 150, true, 6),
  ('D', 'Perfil D (+ Projetos)', '100 a 150 m²', 'mais_projetos', array['Ideia do cliente (Alinhamento da ideia do Croqui)', 'Formatação do projeto (Apresentação com base no croqui)', 'Apresentação da planta do croqui apresentado (com escolha do tipo de telhado padrão)', 'Documento da prefeitura', 'Aprovação prefeitura', 'Não há alterações no projeto apresentado']::text[], 100, 150, false, 7),
  ('E', 'Perfil E (+ Projetos)', '30 a 100 m²', 'mais_projetos', array['Ideia do cliente (Alinhamento da ideia do Croqui)', 'Formatação do projeto (Apresentação com base no croqui)', 'Apresentação da planta do croqui apresentado (com escolha do tipo de telhado padrão)', 'Documento da prefeitura', 'Aprovação prefeitura', 'Não há alterações no projeto apresentado']::text[], 30, 100, false, 8)
on conflict (id) do nothing;

