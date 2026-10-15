-- Catálogo de obras (0024). Para o banco que já tem as migrations até a 0023 (e o catálogo da 0019). Rode uma única vez.

-- Catálogo: Gestão de Obras, Administração de Obras e Gestão de Engenharia (lista completa de serviços da Cariati).
-- Os serviços de parceiros novos (automação, segurança, fotovoltaico, bombeiros, ambiental) ficam fora do catálogo.
insert into servico_categorias (id, nome, etapas, ordem, execucao) values
  ('obras', 'Gestão de Obras', array[]::text[], 10, 'escritorio'),
  ('admobra', 'Administração de Obras', array[]::text[], 11, 'escritorio'),
  ('engenharia', 'Gestão de Engenharia', array[]::text[], 12, 'escritorio')
on conflict (id) do nothing;
insert into servico_itens (id, categoria_id, nome, ordem) values
  ('obras-01', 'obras', 'Consultorias Internas e Externas', 1),
  ('obras-02', 'obras', 'Visitas Técnicas Internas e Externas', 2),
  ('obras-03', 'obras', 'Acompanhamento de Obras', 3),
  ('obras-04', 'obras', 'Gestão Financeira de Obras', 4),
  ('obras-05', 'obras', 'Compras e Contratações para Obras', 5),
  ('admobra-01', 'admobra', 'Suprimentos e materiais · Compra de materiais', 1),
  ('admobra-02', 'admobra', 'Suprimentos e materiais · Ordens de compra', 2),
  ('admobra-03', 'admobra', 'Suprimentos e materiais · Conferência de materiais no canteiro', 3),
  ('admobra-04', 'admobra', 'Suprimentos e materiais · Controle de materiais', 4),
  ('admobra-05', 'admobra', 'Suprimentos e materiais · Aprovação de orçamentos para próxima etapa', 5),
  ('admobra-06', 'admobra', 'Contratação e prestadores de serviço · Cotação e mapa de fornecedores', 6),
  ('admobra-07', 'admobra', 'Contratação e prestadores de serviço · Contratação de prestadores de serviço', 7),
  ('admobra-08', 'admobra', 'Contratação e prestadores de serviço · Controle da prestação de serviço', 8),
  ('admobra-09', 'admobra', 'Contratação e prestadores de serviço · Medição de serviço', 9),
  ('admobra-10', 'admobra', 'Financeiro e controle · Ordens de pagamento', 10),
  ('admobra-11', 'admobra', 'Financeiro e controle · Contas a pagar e a receber', 11),
  ('admobra-12', 'admobra', 'Financeiro e controle · Fluxo de caixa e adiantamentos', 12),
  ('admobra-13', 'admobra', 'Financeiro e controle · Planilhas de evolução', 13),
  ('admobra-14', 'admobra', 'Financeiro e controle · Controle de aditivos e imprevistos', 14),
  ('admobra-15', 'admobra', 'Documental e fiscal · Gestão de notas fiscais e documentação fiscal', 15),
  ('admobra-16', 'admobra', 'Documental e fiscal · Relatório periódico de prestação de contas', 16),
  ('engenharia-01', 'engenharia', 'Início e preparação · Protocolo de início de obra', 1),
  ('engenharia-02', 'engenharia', 'Início e preparação · Vistoria de vizinhos', 2),
  ('engenharia-03', 'engenharia', 'Início e preparação · Conferência de projetos com a realidade do canteiro', 3),
  ('engenharia-04', 'engenharia', 'Início e preparação · Mobilização e desmobilização do canteiro', 4),
  ('engenharia-05', 'engenharia', 'Fiscalização e qualidade · Fiscalização das etapas de execução', 5),
  ('engenharia-06', 'engenharia', 'Fiscalização e qualidade · Fiscalização da qualidade de materiais e execução', 6),
  ('engenharia-07', 'engenharia', 'Fiscalização e qualidade · Conferência de material recebido', 7),
  ('engenharia-08', 'engenharia', 'Fiscalização e qualidade · Vistoria de conformidade de EPI', 8),
  ('engenharia-09', 'engenharia', 'Coordenação e acompanhamento · Acompanhamento semanal da execução', 9),
  ('engenharia-10', 'engenharia', 'Coordenação e acompanhamento · Conferência de dúvidas e divergências de projeto', 10),
  ('engenharia-11', 'engenharia', 'Coordenação e acompanhamento · Alinhamento e organização das equipes', 11),
  ('engenharia-12', 'engenharia', 'Coordenação e acompanhamento · Organização das contratações junto ao canteiro', 12),
  ('engenharia-13', 'engenharia', 'Coordenação e acompanhamento · KPIs de evolução e qualificação de prestadores', 13),
  ('engenharia-14', 'engenharia', 'Segurança, meio ambiente e registro · Gestão de resíduos da obra', 14),
  ('engenharia-15', 'engenharia', 'Segurança, meio ambiente e registro · Registro formal da obra', 15),
  ('engenharia-16', 'engenharia', 'Gestão de mudanças e riscos · Gestão de mudanças de escopo', 16),
  ('engenharia-17', 'engenharia', 'Gestão de mudanças e riscos · Gestão de riscos', 17),
  ('engenharia-18', 'engenharia', 'Controle de prazo e entrega · Controle de prazo com Curva S', 18),
  ('engenharia-19', 'engenharia', 'Controle de prazo e entrega · Entrega formal da obra', 19)
on conflict (id) do nothing;
