-- Perfil Gestor (0022). Para o banco que já tem as migrations até a 0021. Rode uma única vez.

-- Perfil Gestor: enxerga o escritório inteiro (painéis, horas, prazos) mas não altera nada.
-- Quem altera projetos e prazos é o administrador e quem conduz cada projeto.
alter table profiles drop constraint if exists profiles_perfil_check;
alter table profiles add constraint profiles_perfil_check check (perfil in ('admin','gestor','profissional','cliente'));

create or replace function is_gestor() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and perfil = 'gestor' and ativo) $$;
-- a equipe (e, para leitura, o gestor) passa pelas regras de consulta já existentes
create or replace function is_equipe() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and perfil in ('admin','gestor','profissional') and ativo) $$;
create or replace function pode_ver_banco_horas() returns boolean language sql stable security definer set search_path = public as $$
  select is_admin() or is_gestor() or eh_administrativo() $$;

create or replace function pode_ver_projeto(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from projetos pr where pr.id = p and (
      is_admin() or is_gestor()
      or (is_equipe() and (
            pr.responsavel_id = auth.uid()
            or exists (select 1 from projeto_equipe e where e.projeto_id = pr.id and e.usuario_id = auth.uid())
            or (select setor::text from profiles where id = auth.uid()) in ('administrativo','comercial','financeiro')))
      or pr.cliente_id = meu_cliente()
    )) $$;

create or replace function projetos_visiveis() returns setof uuid
language sql stable security definer set search_path = public as $$
  select pr.id from projetos pr
   where is_admin() or is_gestor() or pr.cliente_id = meu_cliente()
      or (is_equipe() and (
            pr.responsavel_id = auth.uid()
            or pr.id in (select e.projeto_id from projeto_equipe e where e.usuario_id = auth.uid())
            or (select setor::text from profiles where id = auth.uid()) in ('administrativo','comercial','financeiro')))
$$;

-- o gestor só consulta: qualquer gravação feita por ele é barrada
create or replace function bloquear_gestor() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_gestor() then raise exception 'O perfil Gestor é só de consulta: peça ao administrador ou a quem conduz o projeto.'; end if;
  return coalesce(new, old);
end $$;
do $$ declare t text; begin
  foreach t in array array['clientes','projetos','projeto_etapas','historico','protocolos','protocolo_andamentos','projeto_documentos','projeto_equipe',
    'projeto_tarefas','projeto_tarefa_itens','tempos','banco_horas_ajustes','parceiros','projeto_entregaveis','servico_categorias','servico_itens','perfis_cliente'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists gestor_so_consulta on %I', t);
      execute format('create trigger gestor_so_consulta before insert or update or delete on %I for each row execute function bloquear_gestor()', t);
    end if;
  end loop;
end $$;

-- criar acesso também aceita o perfil gestor
create or replace function admin_criar_usuario(
  p_email text, p_senha text, p_nome text, p_perfil text,
  p_setor text default 'projetos', p_especialidades text[] default '{}',
  p_cliente_id uuid default null, p_carga numeric default 40)
returns uuid language plpgsql security definer set search_path = public, extensions, auth as $$
declare uid uuid := gen_random_uuid(); em text := lower(trim(coalesce(p_email, '')));
begin
  if not is_admin() then raise exception 'Só o administrador cria acessos'; end if;
  if em !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'E-mail inválido'; end if;
  if length(coalesce(p_senha, '')) < 8 then raise exception 'A senha precisa ter pelo menos 8 caracteres'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome'; end if;
  if p_perfil not in ('admin','gestor','profissional','cliente') then raise exception 'Perfil inválido'; end if;
  if p_perfil = 'cliente' and p_cliente_id is null then raise exception 'Escolha o cadastro do cliente'; end if;
  if exists (select 1 from auth.users where lower(email) = em) then raise exception 'Já existe um acesso com este e-mail'; end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change, email_change_token_new,
                          email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', em,
          crypt(p_senha, gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('nome', trim(p_nome)), now(), now(),
          '', '', '', '', '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', em, 'email_verified', true),
          'email', now(), now(), now());

  update public.profiles set nome = trim(p_nome), email = em, perfil = p_perfil,
         setor = coalesce(p_setor, 'projetos')::public.setor,
         especialidades = coalesce(p_especialidades, '{}'),
         cliente_id = case when p_perfil = 'cliente' then p_cliente_id end,
         carga_semanal_horas = coalesce(p_carga, 40), ativo = true
   where id = uid;
  return uid;
end $$;

