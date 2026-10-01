-- Cronômetro por etapa: cada "iniciar/parar" vira um registro de tempo trabalhado.
create table tempos (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references projetos(id) on delete cascade,
  etapa_codigo text not null references etapa_modelos(codigo),
  usuario_id uuid not null references profiles(id) default auth.uid(),
  iniciado_em timestamptz not null default now(),
  finalizado_em timestamptz,                -- nulo = cronômetro rodando
  check (finalizado_em is null or finalizado_em >= iniciado_em)
);
create index on tempos(projeto_id, etapa_codigo);
create index on tempos(etapa_codigo) where finalizado_em is not null;
-- cada pessoa só pode ter um cronômetro rodando por vez
create unique index tempos_um_ativo_por_usuario on tempos(usuario_id) where finalizado_em is null;

alter table tempos enable row level security;
create policy tempos_ler on tempos for select to authenticated using (true);
create policy tempos_criar on tempos for insert to authenticated with check (usuario_id = auth.uid());
create policy tempos_editar on tempos for update to authenticated using (usuario_id = auth.uid() or is_admin()) with check (usuario_id = auth.uid() or is_admin());
create policy tempos_excluir on tempos for delete to authenticated using (is_admin());

-- Funções usadas pelo app (hora sempre do servidor, não do aparelho)
create or replace function iniciar_cronometro(p_projeto uuid, p_etapa text) returns tempos
language plpgsql as $$
declare r tempos;
begin
  update tempos set finalizado_em = now() where usuario_id = auth.uid() and finalizado_em is null;
  insert into tempos (projeto_id, etapa_codigo) values (p_projeto, p_etapa) returning * into r;
  return r;
end $$;

create or replace function parar_cronometro() returns void
language sql as $$
  update tempos set finalizado_em = now() where usuario_id = auth.uid() and finalizado_em is null
$$;

-- Banco de tempos para análise (também dá para abrir no Supabase ou exportar para o Excel)
create view tempo_etapa_projeto with (security_invoker = true) as
select projeto_id, etapa_codigo, count(*) as sessoes,
       sum(extract(epoch from (finalizado_em - iniciado_em)))::int as segundos
from tempos where finalizado_em is not null
group by projeto_id, etapa_codigo;

create view tempo_medio_etapa with (security_invoker = true) as
select e.etapa_codigo, m.titulo, count(*) as projetos,
       avg(e.segundos)::int as media_seg, min(e.segundos) as min_seg, max(e.segundos) as max_seg
from tempo_etapa_projeto e join etapa_modelos m on m.codigo = e.etapa_codigo
group by e.etapa_codigo, m.titulo;
