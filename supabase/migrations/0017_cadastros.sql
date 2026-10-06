-- Cadastros: parceiros, e-mail no perfil e funções do administrador para criar, trocar senha e excluir acessos.
-- As senhas nunca ficam guardadas em texto: o banco guarda só o hash (bcrypt), como o próprio Supabase Auth.

alter table profiles add column if not exists email text;
update profiles p set email = lower(u.email) from auth.users u where u.id = p.id and p.email is null;

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)), lower(new.email))
  on conflict (id) do nothing;
  return new;
end $$;

-- ---------- Parceiros (projetistas, engenheiros, topógrafos, fornecedores, despachantes…) ----------
create table if not exists parceiros (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null default 'outro',
  tipo_pessoa text not null default 'juridica' check (tipo_pessoa in ('fisica','juridica')),
  documento text,
  contato text,
  telefone text,
  whatsapp text,
  email text,
  cidade text,
  uf text,
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists parceiros_nome on parceiros (lower(nome));

alter table parceiros enable row level security;
create policy parceiros_ler on parceiros for select to authenticated using ((select is_equipe()));
create policy parceiros_criar on parceiros for insert to authenticated
  with check ((select is_admin()) or (select setor from profiles where id = (select auth.uid())) in ('administrativo','comercial','financeiro'));
create policy parceiros_editar on parceiros for update to authenticated
  using ((select is_admin()) or (select setor from profiles where id = (select auth.uid())) in ('administrativo','comercial','financeiro'))
  with check ((select is_admin()) or (select setor from profiles where id = (select auth.uid())) in ('administrativo','comercial','financeiro'));
create policy parceiros_excluir on parceiros for delete to authenticated using ((select is_admin()));
grant select, insert, update, delete on parceiros to authenticated;

-- ---------- Acessos (só o administrador) ----------
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
  if p_perfil not in ('admin','profissional','cliente') then raise exception 'Perfil inválido'; end if;
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

create or replace function admin_redefinir_senha(p_id uuid, p_senha text)
returns void language plpgsql security definer set search_path = public, extensions, auth as $$
begin
  if not is_admin() then raise exception 'Só o administrador troca senhas'; end if;
  if length(coalesce(p_senha, '')) < 8 then raise exception 'A senha precisa ter pelo menos 8 caracteres'; end if;
  update auth.users set encrypted_password = crypt(p_senha, gen_salt('bf')), updated_at = now() where id = p_id;
  if not found then raise exception 'Acesso não encontrado'; end if;
  delete from auth.sessions where user_id = p_id;   -- obriga a entrar de novo com a senha nova
end $$;

create or replace function admin_alterar_email(p_id uuid, p_email text)
returns void language plpgsql security definer set search_path = public, extensions, auth as $$
declare em text := lower(trim(coalesce(p_email, '')));
begin
  if not is_admin() then raise exception 'Só o administrador altera e-mails'; end if;
  if em !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'E-mail inválido'; end if;
  if exists (select 1 from auth.users where lower(email) = em and id <> p_id) then raise exception 'Já existe um acesso com este e-mail'; end if;
  update auth.users set email = em, updated_at = now() where id = p_id;
  if not found then raise exception 'Acesso não encontrado'; end if;
  update auth.identities set identity_data = identity_data || jsonb_build_object('email', em), updated_at = now() where user_id = p_id and provider = 'email';
  update public.profiles set email = em where id = p_id;
end $$;

-- Exclui o acesso. Quem já trabalhou em projetos, tempos ou histórico não pode ser apagado (perderia o registro): desative o acesso.
create or replace function admin_excluir_usuario(p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions, auth as $$
begin
  if not is_admin() then raise exception 'Só o administrador exclui acessos'; end if;
  if p_id = auth.uid() then raise exception 'Você não pode excluir o seu próprio acesso'; end if;
  if (select perfil from public.profiles where id = p_id) = 'admin'
     and not exists (select 1 from public.profiles where perfil = 'admin' and ativo and id <> p_id) then
    raise exception 'É preciso manter pelo menos um administrador ativo';
  end if;
  begin
    delete from auth.users where id = p_id;
  exception when foreign_key_violation then
    raise exception 'Esta pessoa tem projetos, tempos ou histórico registrados. Desative o acesso em vez de excluir.';
  end;
  if not found then raise exception 'Acesso não encontrado'; end if;
end $$;

revoke all on function admin_criar_usuario(text, text, text, text, text, text[], uuid, numeric) from public, anon;
revoke all on function admin_redefinir_senha(uuid, text) from public, anon;
revoke all on function admin_alterar_email(uuid, text) from public, anon;
revoke all on function admin_excluir_usuario(uuid) from public, anon;
grant execute on function admin_criar_usuario(text, text, text, text, text, text[], uuid, numeric) to authenticated;
grant execute on function admin_redefinir_senha(uuid, text) to authenticated;
grant execute on function admin_alterar_email(uuid, text) to authenticated;
grant execute on function admin_excluir_usuario(uuid) to authenticated;
