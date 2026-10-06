-- Cadastro completo do cliente: dados pessoais, contato, endereço atual, empresa e a obra (campos do levantamento de dados do protocolo 00).
alter table clientes
  add column tipo_pessoa text not null default 'fisica' check (tipo_pessoa in ('fisica','juridica')),
  add column documento text,                    -- CPF ou CNPJ, só números
  add column rg text,
  add column data_nascimento date,
  add column estado_civil text,
  add column nacionalidade text,
  add column profissao text,
  add column telefone2 text,
  add column whatsapp text,
  add column contato_preferido text,            -- whatsapp, telefone ou e-mail
  add column origem text,                       -- como chegou ao escritório
  add column indicado_por text,
  -- endereço atual
  add column end_cep text, add column end_logradouro text, add column end_numero text, add column end_complemento text,
  add column end_bairro text, add column end_cidade text, add column end_uf text,
  -- empresa (quando o contrato é em nome de empresa)
  add column empresa_razao_social text, add column empresa_cnpj text, add column empresa_responsavel text, add column empresa_responsavel_cpf text,
  -- obra
  add column obra_intencao text,                -- residencial, comercial, institucional...
  add column obra_metragem numeric(10,2),       -- metragem aproximada (m²)
  add column obra_cep text, add column obra_logradouro text, add column obra_numero text, add column obra_complemento text,
  add column obra_bairro text, add column obra_cidade text, add column obra_uf text,
  add column obra_condominio text, add column obra_lote text, add column obra_quadra text,
  add column obra_inscricao_municipal text,     -- IPTU
  add column obra_matricula text,
  add column obra_financiada boolean,
  add column responsavel_comercial uuid references profiles(id) on delete set null,
  add column atualizado_em timestamptz not null default now(),
  add column atualizado_por uuid references profiles(id) on delete set null;

-- o mesmo CPF/CNPJ não pode ter dois cadastros
create unique index clientes_documento_unico on clientes (documento) where documento is not null and documento <> '';
create index clientes_nome_busca on clientes (lower(nome));
create index clientes_cidade on clientes (end_cidade);

create or replace function clientes_marcar_edicao() returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end $$;
create trigger clientes_edicao before update on clientes for each row execute function clientes_marcar_edicao();
