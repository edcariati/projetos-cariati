-- Ligação com o atendimento (0025). Para o banco que já tem as migrations até a 0024. Rode uma única vez.

-- Ligação com o app de Atendimento: o atendimento envia a "ficha de fechamento" do cliente (sem valores)
-- e ela chega numa caixa de entrada do app de Projetos, de onde o administrador cria o projeto com os dados já preenchidos.

create extension if not exists pgcrypto;

-- Chaves de integração (só o hash fica guardado; a chave aparece uma única vez, ao ser gerada)
create table if not exists integracao_chaves (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  chave_hash text not null,
  ativa boolean not null default true,
  criada_em timestamptz not null default now()
);
alter table integracao_chaves enable row level security;   -- sem políticas: ninguém lê pela API, só as funções abaixo

-- Fichas recebidas do atendimento
create table if not exists fichas_atendimento (
  id uuid primary key default gen_random_uuid(),
  lead_id text not null unique,                 -- evita duplicar: reenviar atualiza a mesma ficha
  atendimento_id text,
  ficha jsonb not null,
  status text not null default 'nova' check (status in ('nova','importada')),
  projeto_id uuid references projetos(id) on delete set null,
  recebida_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);
alter table fichas_atendimento enable row level security;
drop policy if exists fichas_leitura on fichas_atendimento;
create policy fichas_leitura on fichas_atendimento for select using (is_admin() or is_gestor());
drop policy if exists fichas_admin on fichas_atendimento;
create policy fichas_admin on fichas_atendimento for update using (is_admin()) with check (is_admin());
drop policy if exists fichas_exclui on fichas_atendimento;
create policy fichas_exclui on fichas_atendimento for delete using (is_admin());

-- Remove qualquer campo de valor em qualquer nível, mesmo que o atendimento mande por engano
create or replace function ficha_sem_valores(j jsonb) returns jsonb
language plpgsql immutable as $$
declare r jsonb; k text; v jsonb;
begin
  if jsonb_typeof(j) = 'object' then
    r := '{}'::jsonb;
    for k, v in select * from jsonb_each(j) loop
      if k !~* '(valor|honorari|investimento|preco|preço|pre[cç]o|orcamento|orçamento)' then
        r := r || jsonb_build_object(k, ficha_sem_valores(v));
      end if;
    end loop;
    return r;
  elsif jsonb_typeof(j) = 'array' then
    select coalesce(jsonb_agg(ficha_sem_valores(e)), '[]'::jsonb) into r from jsonb_array_elements(j) e;
    return r;
  end if;
  return j;
end $$;

-- O administrador gera a chave que o app de Atendimento usa para enviar fichas
create or replace function admin_gerar_chave_integracao(p_nome text default 'Atendimento')
returns text language plpgsql security definer set search_path = public, extensions as $$
declare chave text;
begin
  if not is_admin() then raise exception 'Apenas o administrador gera chaves de integração.'; end if;
  chave := 'cariati_' || encode(gen_random_bytes(24), 'hex');
  insert into integracao_chaves (nome, chave_hash) values (coalesce(nullif(trim(p_nome), ''), 'Atendimento'), crypt(chave, gen_salt('bf', 10)));
  return chave;
end $$;
revoke all on function admin_gerar_chave_integracao(text) from public, anon;
grant execute on function admin_gerar_chave_integracao(text) to authenticated;

-- Chamada pelo app de Atendimento (rpc 'receber_ficha_atendimento'), sem login, protegida pela chave
create or replace function receber_ficha_atendimento(p_chave text, p_ficha jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare lid text; limpa jsonb; existente fichas_atendimento%rowtype; novo uuid;
begin
  if p_chave is null or not exists (select 1 from integracao_chaves where ativa and chave_hash = crypt(p_chave, chave_hash)) then
    raise exception 'Chave de integração inválida.' using errcode = '28000';
  end if;
  if p_ficha is null or jsonb_typeof(p_ficha) <> 'object' then raise exception 'Ficha inválida.'; end if;
  lid := nullif(trim(p_ficha->>'lead_id'), '');
  if lid is null then raise exception 'A ficha precisa do lead_id.'; end if;
  if length(p_ficha::text) > 500000 then raise exception 'Ficha grande demais.'; end if;
  limpa := ficha_sem_valores(p_ficha);

  select * into existente from fichas_atendimento where lead_id = lid;
  if found and existente.status = 'importada' then
    return jsonb_build_object('ok', true, 'id', existente.id, 'status', 'importada', 'aviso', 'Ficha já virou projeto; não foi alterada.');
  end if;
  insert into fichas_atendimento (lead_id, atendimento_id, ficha) values (lid, nullif(p_ficha->>'atendimento_id', ''), limpa)
  on conflict (lead_id) do update set ficha = excluded.ficha, atendimento_id = excluded.atendimento_id, atualizada_em = now()
  returning id into novo;
  return jsonb_build_object('ok', true, 'id', novo, 'status', 'nova');
end $$;
revoke all on function receber_ficha_atendimento(text, jsonb) from public;
grant execute on function receber_ficha_atendimento(text, jsonb) to anon, authenticated;
