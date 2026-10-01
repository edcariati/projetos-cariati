-- Banco de horas: carga horária, lançamentos manuais (compensações / horas extras) e leitura pelo Administrativo.
-- Saldo = horas trabalhadas (cronômetro) + lançamentos − horas previstas (carga semanal ÷ 5 × dias úteis).

alter table profiles add column carga_semanal_horas numeric(5,2) not null default 40
  check (carga_semanal_horas between 0 and 80);

create or replace function eh_administrativo() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and ativo and perfil in ('admin','profissional') and setor = 'administrativo') $$;
create or replace function pode_ver_banco_horas() returns boolean language sql stable security definer set search_path = public as $$
  select is_admin() or eh_administrativo() $$;

-- a carga horária também só o administrador altera
create or replace function proteger_perfil() returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- sem usuário logado (SQL Editor, painel do Supabase) a alteração é permitida
  if auth.uid() is not null and not is_admin() then
    new.perfil := old.perfil; new.setor := old.setor; new.cliente_id := old.cliente_id;
    new.ativo := old.ativo; new.especialidades := old.especialidades;
    new.carga_semanal_horas := old.carga_semanal_horas;
  end if;
  return new;
end $$;

-- o Administrativo passa a ler os tempos de toda a equipe (cada profissional continua vendo só os próprios)
drop policy tempos_ler on tempos;
create policy tempos_ler on tempos for select to authenticated using (pode_ver_banco_horas() or usuario_id = auth.uid());

create table banco_horas_ajustes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references profiles(id) on delete cascade,
  data date not null default current_date,
  minutos int not null check (minutos <> 0),           -- positivo = crédito (hora extra, feriado abonado); negativo = débito (folga, compensação)
  motivo text not null,
  criado_por uuid references profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index on banco_horas_ajustes(usuario_id, data);
alter table banco_horas_ajustes enable row level security;
create policy ajustes_ler on banco_horas_ajustes for select to authenticated
  using (pode_ver_banco_horas() or usuario_id = auth.uid());
create policy ajustes_criar on banco_horas_ajustes for insert to authenticated
  with check (pode_ver_banco_horas() and criado_por = auth.uid());
create policy ajustes_excluir on banco_horas_ajustes for delete to authenticated using (pode_ver_banco_horas());

-- Horas trabalhadas por pessoa e por dia (fuso de São Paulo), para análise no Excel ou no Supabase
create view banco_horas_dia with (security_invoker = true) as
select usuario_id, (iniciado_em at time zone 'America/Sao_Paulo')::date as dia,
       sum(extract(epoch from (finalizado_em - iniciado_em)))::int as segundos
from tempos where finalizado_em is not null
group by usuario_id, (iniciado_em at time zone 'America/Sao_Paulo')::date;
