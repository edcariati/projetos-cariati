-- Serviços contratados no cadastro do cliente (0018). Para o banco que já tem as migrations até a 0017. Rode uma única vez.

-- ===== 0018_servicos_cliente.sql =====
-- Serviços contratados no cadastro do cliente (aparecem na confirmação do cadastro e pré-preenchem o novo projeto).
alter table clientes
  add column if not exists servicos text[] not null default '{}',          -- ids do catálogo (src/lib/servicos.ts): arquitetonico, legal, interiores, complementares, habitese…
  add column if not exists servico_estudo text,                             -- padrao | ampliacao | mais_projetos
  add column if not exists servico_aprovacao text,                          -- tipo de aprovação do projeto legal
  add column if not exists servicos_observacao text;
