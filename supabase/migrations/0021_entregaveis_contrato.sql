-- Entregáveis do contrato: o perfil do cliente e os serviços contratados viram uma lista conferível dentro de cada projeto,
-- para o profissional saber o que precisa entregar e marcar o que já foi feito.
create table if not exists projeto_entregaveis (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references projetos(id) on delete cascade,
  texto text not null,
  origem text not null default 'perfil' check (origem in ('perfil', 'servico', 'avulso')),
  servico_id text,                                  -- id do serviço do catálogo, quando vem de um serviço
  etapa_codigo text references etapa_modelos(codigo),   -- etapa em que costuma ser entregue (opcional)
  ordem int not null default 0,
  feito boolean not null default false,
  feito_por uuid references profiles(id),
  feito_em timestamptz,
  nota text,
  created_at timestamptz not null default now()
);
create index if not exists projeto_entregaveis_projeto on projeto_entregaveis(projeto_id);

create or replace function registrar_entregavel_feito() returns trigger language plpgsql as $$
begin
  if new.feito and not old.feito then new.feito_por := auth.uid(); new.feito_em := now();
  elsif not new.feito then new.feito_por := null; new.feito_em := null;
  else new.feito_por := old.feito_por; new.feito_em := old.feito_em; end if;
  return new;
end $$;
drop trigger if exists entregavel_feito on projeto_entregaveis;
create trigger entregavel_feito before update on projeto_entregaveis for each row execute function registrar_entregavel_feito();

alter table projeto_entregaveis enable row level security;
drop policy if exists pentreg_ler on projeto_entregaveis;
create policy pentreg_ler on projeto_entregaveis for select to authenticated using (is_equipe() and pode_ver_projeto(projeto_id));
drop policy if exists pentreg_incluir on projeto_entregaveis;
create policy pentreg_incluir on projeto_entregaveis for insert to authenticated with check (is_equipe() and pode_ver_projeto(projeto_id));
drop policy if exists pentreg_editar on projeto_entregaveis;
create policy pentreg_editar on projeto_entregaveis for update to authenticated
  using (is_equipe() and pode_ver_projeto(projeto_id)) with check (is_equipe() and pode_ver_projeto(projeto_id));
drop policy if exists pentreg_excluir on projeto_entregaveis;
create policy pentreg_excluir on projeto_entregaveis for delete to authenticated using (is_equipe() and pode_ver_projeto(projeto_id));
grant select, insert, update, delete on projeto_entregaveis to authenticated;
