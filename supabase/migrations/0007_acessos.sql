-- Acessos: administrador, profissional e cliente, cada um vendo só o que é seu.
-- Perfis: admin (vê e gerencia tudo) · profissional (vê os projetos dele) · cliente (vê o próprio projeto)

alter table profiles add column perfil text not null default 'profissional'
  check (perfil in ('admin','profissional','cliente'));
update profiles set perfil = 'admin' where papel = 'admin';
alter table profiles add column especialidades text[] not null default '{}';   -- arquitetonico, interiores, legal, complementares
alter table profiles add column cliente_id uuid references clientes(id) on delete set null; -- só para perfil cliente
alter table profiles add column ativo boolean not null default true;

drop policy profiles_ler on profiles;
drop policy profiles_editar_proprio on profiles;

-- ---------- funções auxiliares (rodam com privilégio do banco, evitam recursão nas regras) ----------
create or replace function is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and perfil = 'admin' and ativo) $$;
create or replace function is_cliente() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and perfil = 'cliente' and ativo) $$;
create or replace function is_equipe() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and perfil in ('admin','profissional') and ativo) $$;
create or replace function meu_cliente() returns uuid language sql stable security definer set search_path = public as $$
  select cliente_id from profiles where id = auth.uid() and perfil = 'cliente' and ativo $$;

alter table profiles drop column papel;
drop type papel;

-- Equipe de cada projeto: quem cuida de qual especialidade
create table projeto_equipe (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references projetos(id) on delete cascade,
  usuario_id uuid not null references profiles(id) on delete cascade,
  especialidade text not null check (especialidade in ('arquitetonico','interiores','legal','complementares')),
  unique (projeto_id, usuario_id, especialidade)
);
create index on projeto_equipe(usuario_id);

alter table projeto_documentos add column visivel_cliente boolean not null default false;

-- Quem pode ver o projeto:
--   admin: todos · profissional: onde é responsável ou está na equipe, e todos se for do setor
--   administrativo/comercial · cliente: os projetos do próprio cadastro
create or replace function pode_ver_projeto(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from projetos pr where pr.id = p and (
      is_admin()
      or (is_equipe() and (
            pr.responsavel_id = auth.uid()
            or exists (select 1 from projeto_equipe e where e.projeto_id = pr.id and e.usuario_id = auth.uid())
            or (select setor from profiles where id = auth.uid()) in ('administrativo','comercial')))
      or pr.cliente_id = meu_cliente()
    )
  )
$$;

-- Quem cria o projeto vira o responsável, se não indicar outro
create or replace function definir_responsavel() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.responsavel_id is null and not is_admin() then new.responsavel_id := auth.uid(); end if;
  return new;
end $$;
create trigger projetos_definir_responsavel before insert on projetos
  for each row execute function definir_responsavel();

-- Só o administrador muda perfil, setor, vínculo com cliente e situação; cada pessoa muda o próprio nome
create or replace function proteger_perfil() returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- sem usuário logado (SQL Editor, painel do Supabase) a alteração é permitida: é assim que nasce o primeiro admin
  if auth.uid() is not null and not is_admin() then
    new.perfil := old.perfil; new.setor := old.setor; new.cliente_id := old.cliente_id;
    new.ativo := old.ativo; new.especialidades := old.especialidades;
  end if;
  return new;
end $$;
create trigger profiles_proteger before update on profiles for each row execute function proteger_perfil();

-- ---------- regras de acesso (RLS) ----------
do $$
declare t text; pol record;
begin
  foreach t in array array['clientes','projetos','projeto_etapas','historico','protocolos','protocolo_andamentos',
                           'projeto_documentos','etapa_modelos','documento_modelos','tempos'] loop
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on %I', pol.policyname, t);
    end loop;
  end loop;
end $$;

alter table projeto_equipe enable row level security;

-- perfis: a equipe vê todos; o cliente vê só o próprio e o responsável pelos seus projetos
create policy profiles_ler on profiles for select to authenticated using (
  is_equipe() or id = auth.uid()
  or id in (select responsavel_id from projetos where cliente_id = meu_cliente() and responsavel_id is not null));
create policy profiles_editar on profiles for update to authenticated
  using (id = auth.uid() or is_admin()) with check (id = auth.uid() or is_admin());

create policy clientes_ler on clientes for select to authenticated using (is_equipe() or id = meu_cliente());
create policy clientes_criar on clientes for insert to authenticated with check (is_equipe());
create policy clientes_editar on clientes for update to authenticated using (is_equipe()) with check (is_equipe());
create policy clientes_excluir on clientes for delete to authenticated using (is_admin());

-- (responsavel_id / cliente_id são checados direto para o projeto recém-criado já ser visível a quem o criou)
create policy projetos_ler on projetos for select to authenticated using (
  is_admin() or responsavel_id = auth.uid() or cliente_id = meu_cliente() or pode_ver_projeto(id));
create policy projetos_criar on projetos for insert to authenticated with check (is_equipe());
create policy projetos_editar on projetos for update to authenticated using (is_equipe() and pode_ver_projeto(id)) with check (is_equipe());
create policy projetos_excluir on projetos for delete to authenticated using (is_admin());

create policy etapas_ler on projeto_etapas for select to authenticated using (pode_ver_projeto(projeto_id));
create policy etapas_criar on projeto_etapas for insert to authenticated with check (is_equipe());
create policy etapas_editar on projeto_etapas for update to authenticated using (is_equipe() and pode_ver_projeto(projeto_id)) with check (is_equipe());
create policy etapas_excluir on projeto_etapas for delete to authenticated using (is_admin());

create policy historico_ler on historico for select to authenticated using (is_equipe() and pode_ver_projeto(projeto_id));
create policy historico_criar on historico for insert to authenticated with check (is_equipe() and pode_ver_projeto(projeto_id));
create policy historico_excluir on historico for delete to authenticated using (is_admin());

create policy protocolos_ler on protocolos for select to authenticated using (pode_ver_projeto(projeto_id));
create policy protocolos_criar on protocolos for insert to authenticated with check (is_equipe() and pode_ver_projeto(projeto_id));
create policy protocolos_editar on protocolos for update to authenticated using (is_equipe() and pode_ver_projeto(projeto_id)) with check (is_equipe());
create policy protocolos_excluir on protocolos for delete to authenticated using (is_admin());

create policy andamentos_ler on protocolo_andamentos for select to authenticated using (
  is_equipe() and exists (select 1 from protocolos p where p.id = protocolo_id and pode_ver_projeto(p.projeto_id)));
create policy andamentos_criar on protocolo_andamentos for insert to authenticated with check (
  is_equipe() and exists (select 1 from protocolos p where p.id = protocolo_id and pode_ver_projeto(p.projeto_id)));
create policy andamentos_excluir on protocolo_andamentos for delete to authenticated using (is_admin());

-- documentos: a equipe vê todos do projeto; o cliente só os que foram liberados para ele
create policy projdoc_ler on projeto_documentos for select to authenticated using (
  pode_ver_projeto(projeto_id) and (is_equipe() or (is_cliente() and visivel_cliente)));
create policy projdoc_criar on projeto_documentos for insert to authenticated with check (is_equipe() and pode_ver_projeto(projeto_id));
create policy projdoc_editar on projeto_documentos for update to authenticated using (is_equipe() and pode_ver_projeto(projeto_id)) with check (is_equipe());
create policy projdoc_excluir on projeto_documentos for delete to authenticated using (is_admin());

-- o fluxo interno (regras, prazos, orientações) é só da equipe; o cliente usa a visão resumida abaixo
create policy modelos_ler on etapa_modelos for select to authenticated using (is_equipe());
create policy modelos_admin on etapa_modelos for all to authenticated using (is_admin()) with check (is_admin());
create policy docmod_ler on documento_modelos for select to authenticated using (is_equipe());
create policy docmod_admin on documento_modelos for all to authenticated using (is_admin()) with check (is_admin());

create view etapas_cliente as   -- sem regras internas; roda com o privilégio do banco de propósito
  select codigo, ordem, fase, titulo, rotulo, cliente_participa, opcional, aceite_formal, escopo from etapa_modelos;
grant select on etapas_cliente to authenticated;

create policy equipe_ler on projeto_equipe for select to authenticated using (is_equipe() and pode_ver_projeto(projeto_id));
create policy equipe_admin on projeto_equipe for all to authenticated using (is_admin()) with check (is_admin());

-- tempos: o administrador vê todos; cada profissional vê os próprios; cliente nunca vê
create policy tempos_ler on tempos for select to authenticated using (is_admin() or usuario_id = auth.uid());
create policy tempos_criar on tempos for insert to authenticated with check (
  is_equipe() and usuario_id = auth.uid() and pode_ver_projeto(projeto_id));
create policy tempos_editar on tempos for update to authenticated
  using (is_admin() or usuario_id = auth.uid()) with check (is_admin() or usuario_id = auth.uid());
create policy tempos_excluir on tempos for delete to authenticated using (is_admin());

-- arquivos: a equipe acessa os dos seus projetos; o cliente só os documentos liberados
drop policy documentos_ler on storage.objects;
drop policy documentos_enviar on storage.objects;
drop policy documentos_excluir on storage.objects;
create policy documentos_ler on storage.objects for select to authenticated using (
  bucket_id = 'documentos' and (
    (is_equipe() and pode_ver_projeto(((storage.foldername(name))[1])::uuid))
    or (is_cliente() and exists (
        select 1 from projeto_documentos d where d.arquivo_path = name and d.visivel_cliente and pode_ver_projeto(d.projeto_id)))));
create policy documentos_enviar on storage.objects for insert to authenticated with check (
  bucket_id = 'documentos' and is_equipe() and pode_ver_projeto(((storage.foldername(name))[1])::uuid));
create policy documentos_excluir on storage.objects for delete to authenticated using (bucket_id = 'documentos' and is_admin());
