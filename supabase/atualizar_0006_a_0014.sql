-- PARTE 1 de 2: atualiza o banco que já tem as migrations 0001 a 0005 (tempos, acessos, banco de horas, protocolos, Habite-se, provisionamento, Financeiro, horas estimadas).
-- Cole tudo no SQL Editor do Supabase e clique em Run. Rode uma única vez. Depois, rode a PARTE 2 (acessos).

-- ===== 0006_tempos.sql =====
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

-- ===== 0007_acessos.sql =====
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

-- ===== 0008_banco_horas.sql =====
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

-- ===== 0009_protocolos_etapas.sql =====
-- Protocolo de tarefas por etapa (modelos do Vobi): tarefas e checklists marcáveis em cada projeto,
-- tipo de estudo (padrão, ampliação, + projetos) e pausa/retomada com tentativas de contato.

alter table projetos add column tipo_estudo text not null default 'padrao'
  check (tipo_estudo in ('padrao','ampliacao','mais_projetos'));

-- Modelos (editáveis pelo administrador)
create table tarefa_modelos (
  id uuid primary key default gen_random_uuid(),
  etapa_codigo text not null references etapa_modelos(codigo) on delete cascade,
  variante text not null default 'todas' check (variante in ('todas','padrao','ampliacao','mais_projetos','apos_solicitacao','apos_ausencia')),
  ordem int not null,
  titulo text not null,
  descricao text,
  prioridade text not null default 'Baixa' check (prioridade in ('Alta','Média','Baixa'))
);
create index on tarefa_modelos(etapa_codigo);
create table tarefa_item_modelos (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references tarefa_modelos(id) on delete cascade,
  ordem int not null,
  texto text not null
);
create index on tarefa_item_modelos(tarefa_id);

-- Instâncias em cada projeto
create table projeto_tarefas (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references projetos(id) on delete cascade,
  etapa_codigo text not null references etapa_modelos(codigo),
  modelo_id uuid references tarefa_modelos(id) on delete set null,
  ordem int not null,
  titulo text not null,
  descricao text,
  prioridade text not null default 'Baixa'
);
create index on projeto_tarefas(projeto_id, etapa_codigo);
create table projeto_tarefa_itens (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references projeto_tarefas(id) on delete cascade,
  projeto_id uuid not null references projetos(id) on delete cascade,
  ordem int not null,
  texto text,                                  -- nulo = a própria tarefa é o item (tarefa sem checklist)
  feito boolean not null default false,
  feito_por uuid references profiles(id),
  feito_em timestamptz
);
create index on projeto_tarefa_itens(projeto_id);
create index on projeto_tarefa_itens(tarefa_id);

-- Ao marcar um item, registra quem e quando (a data deixa de ser digitada à mão)
create or replace function registrar_item_feito() returns trigger language plpgsql as $$
begin
  if new.feito and not old.feito then new.feito_por := auth.uid(); new.feito_em := now();
  elsif not new.feito then new.feito_por := null; new.feito_em := null;
  else new.feito_por := old.feito_por; new.feito_em := old.feito_em; end if;
  return new;
end $$;
create trigger itens_feito before update on projeto_tarefa_itens for each row execute function registrar_item_feito();

-- Copia as tarefas de uma etapa para o projeto (uma única vez por etapa)
create or replace function inserir_tarefas(p_projeto uuid, p_etapa text, p_variantes text[]) returns int
language plpgsql security definer set search_path = public as $$
declare t record; nt uuid; n int := 0;
begin
  if exists (select 1 from projeto_tarefas where projeto_id = p_projeto and etapa_codigo = p_etapa) then return 0; end if;
  for t in select * from tarefa_modelos where etapa_codigo = p_etapa and variante = any (p_variantes) order by ordem loop
    insert into projeto_tarefas (projeto_id, etapa_codigo, modelo_id, ordem, titulo, descricao, prioridade)
    values (p_projeto, p_etapa, t.id, t.ordem, t.titulo, t.descricao, t.prioridade) returning id into nt;
    if exists (select 1 from tarefa_item_modelos where tarefa_id = t.id) then
      insert into projeto_tarefa_itens (tarefa_id, projeto_id, ordem, texto)
        select nt, p_projeto, i.ordem, i.texto from tarefa_item_modelos i where i.tarefa_id = t.id order by i.ordem;
    else
      insert into projeto_tarefa_itens (tarefa_id, projeto_id, ordem, texto) values (nt, p_projeto, 1, null);
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function inserir_tarefas(uuid, text, text[]) from public, anon, authenticated;

-- Usada pelo app para abrir os checklists da pausa (P1/P2), da retomada (P3) e da rescisão (P4)
create or replace function instanciar_tarefas_etapa(p_projeto uuid, p_etapa text) returns int
language plpgsql security definer set search_path = public as $$
declare v text[]; tipo text;
begin
  if not (is_equipe() and pode_ver_projeto(p_projeto)) then raise exception 'Sem permissão para este projeto'; end if;
  select tipo_estudo into tipo from projetos where id = p_projeto;
  if p_etapa = 'P3' then
    v := array['todas', case when exists (select 1 from projeto_tarefas where projeto_id = p_projeto and etapa_codigo = 'P2')
                             then 'apos_ausencia' else 'apos_solicitacao' end];
  else
    v := array['todas', tipo];
  end if;
  return inserir_tarefas(p_projeto, p_etapa, v);
end $$;

-- Etapas do projeto: no estudo "+ projetos" a fachada é feita junto com a planta baixa (etapas 11 a 14 não se aplicam)
create or replace function instanciar_etapas() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into projeto_etapas (projeto_id, etapa_codigo, status)
  select new.id, m.codigo,
    case
      when m.fase = 5 then 'nao_aplicavel'::etapa_status
      when m.escopo = 'legal' and not new.tem_legal then 'nao_aplicavel'
      when m.escopo = 'interiores' and not new.tem_interiores then 'nao_aplicavel'
      when m.escopo = 'complementares' and not new.tem_complementares then 'nao_aplicavel'
      when new.tipo_estudo = 'mais_projetos' and m.codigo in ('11','12','13','14') then 'nao_aplicavel'
      else 'pendente'
    end
  from etapa_modelos m;

  update projeto_etapas set status = 'em_andamento', iniciada_em = now()
   where projeto_id = new.id and etapa_codigo = '01';
  insert into historico (projeto_id, etapa_codigo, tipo, texto)
  values (new.id, '01', 'etapa_iniciada', 'Projeto criado');

  perform inserir_tarefas(new.id, e.etapa_codigo, array['todas', new.tipo_estudo])
  from projeto_etapas e join etapa_modelos m on m.codigo = e.etapa_codigo
  where e.projeto_id = new.id and e.status <> 'nao_aplicavel' and m.fase <= 4;
  return new;
end $$;

-- Acesso: só a equipe, e só nos projetos que pode ver
alter table tarefa_modelos enable row level security;
alter table tarefa_item_modelos enable row level security;
alter table projeto_tarefas enable row level security;
alter table projeto_tarefa_itens enable row level security;
create policy tarefamod_ler on tarefa_modelos for select to authenticated using (is_equipe());
create policy tarefamod_admin on tarefa_modelos for all to authenticated using (is_admin()) with check (is_admin());
create policy tarefaitem_ler on tarefa_item_modelos for select to authenticated using (is_equipe());
create policy tarefaitem_admin on tarefa_item_modelos for all to authenticated using (is_admin()) with check (is_admin());
create policy ptarefas_ler on projeto_tarefas for select to authenticated using (is_equipe() and pode_ver_projeto(projeto_id));
create policy ptarefas_excluir on projeto_tarefas for delete to authenticated using (is_admin());
create policy pitens_ler on projeto_tarefa_itens for select to authenticated using (is_equipe() and pode_ver_projeto(projeto_id));
create policy pitens_editar on projeto_tarefa_itens for update to authenticated
  using (is_equipe() and pode_ver_projeto(projeto_id)) with check (is_equipe() and pode_ver_projeto(projeto_id));

-- Etapa 01 passa a cobrir o levantamento de dados do protocolo (antes do contrato)
update etapa_modelos set titulo = 'Levantamento de dados e contrato', rotulo = 'Contrato',
  entrada = 'Primeiro contato do cliente', saida = 'Contrato assinado e oportunidade promovida a projeto'
 where codigo = '01';
update etapa_modelos set entrada = 'Pedido do cliente', saida = 'Termo de pausa assinado' where codigo = 'P1';
update etapa_modelos set entrada = '3 tentativas de contato sem resposta (uma por semana)', saida = 'Projeto pausado e cliente notificado por e-mail' where codigo = 'P2';

-- Modelos do protocolo
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('01', 'todas', 1, 'Coleta de dados inicial', null, 'Média') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Intenção de projeto (residencial, comercial, institucional etc.)'), (2, 'Metragem aproximada'), (3, 'Nome completo'), (4, 'Telefone'), (5, 'E-mail'), (6, 'Endereço atual'), (7, 'Endereço da obra'), (8, 'Lote'), (9, 'Quadra')) as v(o, x);
insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('01', 'todas', 2, 'Realizar cadastro do cliente no Vobi', null, 'Média');
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('01', 'todas', 3, 'Agendamento da reunião de apresentação do escritório', null, 'Média') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Marcar reunião com cliente'), (2, 'Inserir reunião no sistema e notificar responsável')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('01', 'todas', 4, 'Reunião de apresentação do escritório', null, 'Alta') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Preenchimento de ata'), (2, 'Anexar ata de reunião no Vobi')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('01', 'todas', 5, 'Agendamento da reunião de apresentação de proposta', null, 'Média') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Marcar reunião com cliente'), (2, 'Inserir reunião no sistema e notificar responsável')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('01', 'todas', 6, 'Reunião de apresentação de proposta', null, 'Alta') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Elaboração da ata da reunião'), (2, 'Enviar ata para o aceite do cliente'), (3, 'Ata: dado aceite pelo cliente')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('01', 'todas', 7, 'Coleta de dados complementares', null, 'Média') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'IPTU'), (2, 'Documento de identidade com foto, contendo CPF'), (3, 'Estado civil'), (4, 'Nacionalidade'), (5, 'Profissão'), (6, 'Matrícula/certidão (se disponível)'), (7, 'Fotos do terreno'), (8, 'Inscrição municipal/IPTU (se disponível)'), (9, 'Obra financiada (sim ou não)'), (10, 'Caso empresa: CNPJ'), (11, 'Caso empresa: razão social'), (12, 'Caso empresa: contrato social (constando o responsável que irá assinar)')) as v(o, x);
insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('01', 'todas', 8, 'Abastecimento de informações na database', null, 'Média');
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('01', 'todas', 9, 'Contrato de prestação de serviço', null, 'Alta') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Preenchimento do contrato'), (2, 'Envio do contrato'), (3, 'Recebimento do contrato assinado')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('01', 'todas', 10, 'Promover oportunidade para projeto', 'Etiquetas: o número representa a ordem em que a informação aparece no projeto: 00 Premium, 0 Diretor, Adm/Finanças, Colaborador, 1 Tipo de projeto, 2 Complemento, 3 Tipo de maquete (se houver).', 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Concluir a oportunidade e aplicar os demais templates para projeto'), (2, 'Verificar com o diretor qual o colaborador responsável pelo início do projeto'), (3, 'Aplicar a etiqueta de equipe de acordo com os colaboradores responsáveis'), (4, 'Aplicar as etiquetas ao projeto de acordo com os serviços do contrato')) as v(o, x);
insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('03', 'todas', 1, 'Avaliação interna', null, 'Baixa');
insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('03', 'mais_projetos', 2, 'Análise do dossiê do comercial', null, 'Baixa');
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('03', 'todas', 3, 'Envio do briefing ao cliente', null, 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Envio ao cliente'), (2, 'Preenchido pelo cliente')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('04', 'todas', 1, 'Agendar reunião de briefing', 'Agendar a reunião apenas após o recebimento do briefing pelo cliente.', 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Marcar reunião com cliente'), (2, 'Inserir reunião no sistema e notificar responsável')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('05', 'padrao', 1, 'Reunião de briefing', null, 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Preenchimento de ata'), (2, 'Anexar ata de reunião no Vobi'), (3, 'Enviar ata de reunião ao cliente')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('05', 'ampliacao', 2, 'Reunião de briefing', null, 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Preenchimento de ata'), (2, 'Enviar ata de reunião ao cliente'), (3, 'Ata: dado aceite pelo cliente')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('05', 'mais_projetos', 3, 'Reunião de briefing', null, 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Preenchimento de ata'), (2, 'Anexar ata de reunião no Vobi'), (3, 'Enviar ata de reunião ao cliente')) as v(o, x);
insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('06', 'padrao', 1, 'Aferição no terreno', null, 'Baixa');
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('06', 'ampliacao', 2, 'Aferição no espaço alvo da ampliação', null, 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Salvar imagens da aferição no servidor')) as v(o, x);
insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('06', 'ampliacao', 3, 'Passar aferição a limpo', null, 'Baixa');
insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('06', 'mais_projetos', 4, 'Solicitação de fotos do terreno', null, 'Baixa');
insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('07', 'todas', 1, 'Análise de zoneamento e das informações do comercial', null, 'Baixa');
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('07', 'padrao', 2, 'Estudo layout', 'Informar a data que começou o estudo inicial e das revisões que foram solicitadas. Dar como finalizada essa etapa apenas quando houver o aceite do cliente.', 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Elaboração inicial (REVIN)'), (2, 'Revisão 01'), (3, 'Revisão 02')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('07', 'ampliacao', 3, 'Estudo layout', 'Informar a data que começou o estudo inicial e das revisões que foram solicitadas. Dar como finalizada essa etapa apenas quando houver o aceite do cliente.', 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Elaboração inicial (REVIN)'), (2, 'Revisão 01'), (3, 'Revisão 02')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('07', 'mais_projetos', 4, 'Estudo preliminar: formatar croqui e fazer fachadas', 'Informar a data que começou o estudo inicial e das revisões que foram solicitadas. Dar como finalizada essa etapa apenas quando houver o aceite do cliente.', 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Elaboração inicial (REVIN)'), (2, 'Revisão 01'), (3, 'Revisão 02')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('08', 'padrao', 1, 'Agendar reunião de apresentação de estudo inicial', null, 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Marcar reunião com cliente'), (2, 'Inserir reunião no sistema e notificar responsável')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('08', 'ampliacao', 2, 'Agendar reunião inicial para apresentação do estudo inicial', null, 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Marcar reunião com cliente'), (2, 'Inserir reunião no sistema e notificar responsável')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('08', 'mais_projetos', 3, 'Agendar reunião de apresentação de estudo preliminar', null, 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Marcar reunião com cliente'), (2, 'Inserir reunião no sistema e notificar responsável')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('09', 'padrao', 1, 'Reunião de apresentação de estudo inicial', null, 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Preenchimento de ata'), (2, 'Enviar ata de reunião ao cliente'), (3, 'Enviar projeto para aceite'), (4, 'Enviar ata para aceite'), (5, 'Ata e projeto: dado aceite pelo cliente')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('09', 'ampliacao', 2, 'Reunião para apresentação do estudo inicial', null, 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Preenchimento de ata'), (2, 'Enviar ata de reunião ao cliente'), (3, 'Ata: dado aceite pelo cliente')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('09', 'mais_projetos', 3, 'Reunião de apresentação de estudo preliminar', null, 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Preenchimento de ata'), (2, 'Enviar ata de reunião ao cliente'), (3, 'Enviar projeto para aceite'), (4, 'Enviar ata para aceite'), (5, 'Ata e projeto: dado aceite pelo cliente')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('11', 'padrao', 1, 'Estudo fachada', 'Informar a data que começou o estudo inicial e das revisões que foram solicitadas. Dar como finalizada essa etapa apenas quando houver o aceite do cliente.', 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Elaboração inicial (REVIN)'), (2, 'Revisão 01'), (3, 'Revisão 02'), (4, 'Aceite dado pelo cliente')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('11', 'ampliacao', 2, 'Estudo 3D', 'Informar a data que começou o estudo inicial e das revisões que foram solicitadas. Dar como finalizada essa etapa apenas quando houver o aceite do cliente.', 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Elaboração inicial (REVIN)'), (2, 'Revisão 01'), (3, 'Revisão 02'), (4, 'Aceite dado pelo cliente')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('12', 'padrao', 1, 'Agendar reunião de apresentação', null, 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Marcar reunião com cliente')) as v(o, x);
insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('12', 'ampliacao', 2, 'Agendar reunião de apresentação do estudo 3D', null, 'Baixa');
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('13', 'padrao', 1, 'Reunião de apresentação de estudo de fachada', null, 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Preenchimento de ata'), (2, 'Enviar ata de reunião ao cliente'), (3, 'Enviar projeto para aceite'), (4, 'Ata e projeto: dado aceite pelo cliente')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('13', 'ampliacao', 2, 'Reunião de apresentação do estudo 3D', null, 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Preenchimento de ata'), (2, 'Enviar ata de reunião ao cliente'), (3, 'Enviar projeto para aceite'), (4, 'Ata e projeto: dado aceite pelo cliente')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('P1', 'todas', 1, 'Solicitado pausa pelo cliente', 'Caso o cliente venha a solicitar a pausa do projeto, deverá ser enviado o TERMO DE SOLICITAÇÃO PAUSA DE PROJETO.', 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Cliente solicitou pausa do projeto'), (2, 'Emissão do termo de pausa e envio para o cliente'), (3, 'Termo assinado')) as v(o, x);
insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('P2', 'todas', 1, '1ª tentativa de contato (semana 01)', null, 'Baixa');
insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('P2', 'todas', 2, '2ª tentativa de contato (semana 02)', null, 'Baixa');
insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('P2', 'todas', 3, '3ª tentativa de contato (semana 03)', null, 'Baixa');
insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('P2', 'todas', 4, 'Notificação por e-mail da pausa de projeto', null, 'Baixa');
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('P2', 'todas', 5, 'Solicitado pausa pelo cliente', 'Caso o cliente retorne após as tentativas de contato solicitando a pausa do projeto, deverá ser enviado o TERMO DE SOLICITAÇÃO PAUSA DE PROJETO.', 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Cliente solicitou pausa do projeto'), (2, 'Emissão do termo de pausa e envio para o cliente'), (3, 'Termo assinado')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('P3', 'apos_solicitacao', 1, 'Retomada do projeto após pausa', 'Quando o cliente entrar em contato solicitando a retomada, deverá ser enviado o TERMO DE SOLICITAÇÃO DE RETOMADA DE PROJETO APÓS SOLICITAÇÃO DE PAUSA.', 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Emissão do termo e envio ao cliente'), (2, 'Termo assinado pelo cliente')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('P3', 'apos_ausencia', 2, 'Retomada do projeto após pausa', 'Quando o cliente entrar em contato solicitando a retomada, deverá ser enviado o TERMO DE SOLICITAÇÃO DE RETOMADA DE PROJETO APÓS PAUSA POR AUSÊNCIA DE RETORNO.', 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Emissão do termo e envio ao cliente'), (2, 'Termo assinado pelo cliente')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('P3', 'todas', 3, 'Aditivo de retomada', 'Do fluxo do setor: com a retomada, as informações do projeto são reanalisadas e replanejadas antes de seguir.', 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Conferir a etapa em que o projeto parou'), (2, 'Emissão do aditivo e envio ao cliente'), (3, 'Aditivo assinado pelo cliente')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('P4', 'todas', 1, 'Rescisão por ausência de retomada', 'Do fluxo do setor: passados 180 dias de pausa sem pedido de retomada.', 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Enviar o termo de rescisão no 181º dia')) as v(o, x);

-- Projetos que já existiam recebem as tarefas das etapas em que se aplicam
do $$
declare e record;
begin
  for e in select pe.projeto_id, pe.etapa_codigo, p.tipo_estudo
           from projeto_etapas pe join projetos p on p.id = pe.projeto_id join etapa_modelos m on m.codigo = pe.etapa_codigo
           where pe.status <> 'nao_aplicavel' and m.fase <= 4 loop
    perform inserir_tarefas(e.projeto_id, e.etapa_codigo, array['todas', e.tipo_estudo]);
  end loop;
end $$;

-- ===== 0010_habitese.sql =====
-- Habite-se (protocolo 02): serviço após a regularização ou com a obra pronta.
-- Três etapas opcionais (fase 6), que seguem em paralelo ao fluxo principal e podem ser iniciadas a qualquer momento.

alter table projetos add column tem_habitese boolean not null default false;

insert into etapa_modelos (codigo, ordem, fase, titulo, rotulo, setores, cliente_participa, entrada, saida, regra, opcional, aceite_formal, escopo) values
('H1',31,6,'Habite-se: documentos','Documentos','{projetos,terceiros}',true,'Obra pronta ou regularização concluída','Documentos e relatório fotográfico prontos','Solicitado após a etapa de regularização ou depois que a obra ficar pronta',true,false,'habitese'),
('H2',32,6,'Habite-se: entrada na Prefeitura','Prefeitura','{projetos,administrativo,terceiros}',false,'Documentos prontos','Processo deferido','Taxas do Habite-se e do ISS seguem para o financeiro; os comprovantes são anexados no Aprova Digital',true,false,'habitese'),
('H3',33,6,'Habite-se: entrega dos documentos aprovados','Entrega','{projetos,administrativo}',true,'Processo deferido','Documentos entregues com termo de retirada','Imprimir os documentos aprovados e os emitidos pela Prefeitura e emitir o termo de retirada',true,false,'habitese');

-- projetos que já existiam recebem as etapas do Habite-se como "não contratadas"
insert into projeto_etapas (projeto_id, etapa_codigo, status)
select p.id, m.codigo, 'nao_aplicavel' from projetos p cross join etapa_modelos m where m.fase = 6
on conflict (projeto_id, etapa_codigo) do nothing;

-- Etapas do projeto: Habite-se só se aplica quando contratado; no estudo "+ projetos" a fachada é junto com a planta
create or replace function instanciar_etapas() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into projeto_etapas (projeto_id, etapa_codigo, status)
  select new.id, m.codigo,
    case
      when m.fase = 5 then 'nao_aplicavel'::etapa_status
      when m.escopo = 'legal' and not new.tem_legal then 'nao_aplicavel'
      when m.escopo = 'interiores' and not new.tem_interiores then 'nao_aplicavel'
      when m.escopo = 'complementares' and not new.tem_complementares then 'nao_aplicavel'
      when m.escopo = 'habitese' and not new.tem_habitese then 'nao_aplicavel'
      when new.tipo_estudo = 'mais_projetos' and m.codigo in ('11','12','13','14') then 'nao_aplicavel'
      else 'pendente'
    end
  from etapa_modelos m;

  update projeto_etapas set status = 'em_andamento', iniciada_em = now()
   where projeto_id = new.id and etapa_codigo = '01';
  insert into historico (projeto_id, etapa_codigo, tipo, texto)
  values (new.id, '01', 'etapa_iniciada', 'Projeto criado');

  perform inserir_tarefas(new.id, e.etapa_codigo, array['todas', new.tipo_estudo])
  from projeto_etapas e join etapa_modelos m on m.codigo = e.etapa_codigo
  where e.projeto_id = new.id and e.status <> 'nao_aplicavel' and (m.fase <= 4 or m.fase = 6);
  return new;
end $$;

-- Inicia o Habite-se num projeto (contratado ou não, em andamento ou já finalizado)
create or replace function iniciar_habitese(p_projeto uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (is_equipe() and pode_ver_projeto(p_projeto)) then raise exception 'Sem permissão para este projeto'; end if;
  insert into projeto_etapas (projeto_id, etapa_codigo, status)
    select p_projeto, codigo, 'nao_aplicavel' from etapa_modelos where fase = 6
  on conflict (projeto_id, etapa_codigo) do nothing;
  update projetos set tem_habitese = true,
         status = case when status = 'finalizado' then 'ativo'::projeto_status else status end
   where id = p_projeto;
  update projeto_etapas set status = 'pendente'
   where projeto_id = p_projeto and status = 'nao_aplicavel' and etapa_codigo in (select codigo from etapa_modelos where fase = 6);
  update projeto_etapas set status = 'em_andamento', iniciada_em = now()
   where projeto_id = p_projeto and etapa_codigo = 'H1' and status = 'pendente';
  perform inserir_tarefas(p_projeto, m.codigo, array['todas']) from etapa_modelos m where m.fase = 6;
  insert into historico (projeto_id, etapa_codigo, tipo, texto) values (p_projeto, 'H1', 'etapa_iniciada', 'Habite-se iniciado');
end $$;

-- Documentos do Habite-se
insert into documento_modelos (etapa_codigo, nome, padrao_arquivo, ordem) values
('H1','Termo de Habite-se','TDH_CAXXXXXX_REVXX',1),
('H1','Declaração de veracidade','TDV_CAXXXXXX_REVXX',2),
('H1','Procuração (pessoa física ou jurídica)','PRC_CAXXXXXX_REVXX',3),
('H1','Declaração de CTRS','CTR_CAXXXXXX_REVXX',4),
('H1','Isenção da CTRS','ICTR_CAXXXXXX_REVXX',5),
('H1','Relatório fotográfico',null,6),
('H3','Termo de retirada de documento','TDRD_CAXXXXXX_REVXX',1);

-- Tarefas e checklists do protocolo
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('H1', 'todas', 1, 'Solicitação e emissão de documentos', null, 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Termo de Habite-se (análise simplificada)'), (2, 'Declaração de veracidade'), (3, 'Alvará de construção'), (4, 'Ficha cadastral com histórico'), (5, 'Certidão de registro de imóveis (matrícula) atualizada'), (6, 'Procuração assinada pelo responsável e proprietário'), (7, 'Documento de identidade do proprietário'), (8, 'E-mail do proprietário'), (9, 'Telefone do proprietário')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('H1', 'todas', 2, 'Notas fiscais e declarações', null, 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Notas fiscais de madeira ou estrutura metálica'), (2, 'Declaração de origem florestal'), (3, 'Notas fiscais de caçamba (CTRs)'), (4, 'Declaração de CTR (quando houver a dispensa do uso de transporte e controle de resíduos ou não houver nota fiscal)')) as v(o, x);
insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('H1', 'todas', 3, 'PGRCC aprovado (quando necessário: acima de 300 m²)', null, 'Baixa');
insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('H1', 'todas', 4, 'AVCB (quando comercial enquadrado nesta exigência)', null, 'Baixa');
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('H1', 'todas', 5, 'Relatório fotográfico', 'As fotos devem enquadrar da melhor forma possível a totalidade da construção, sempre valorizando o posicionamento para melhor visualizar os afastamentos entre a construção e a divisa do lote e a presença de elementos importantes, como, por exemplo, a calçada e os acessos na foto da fachada.', 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Foto da fachada (frente)'), (2, 'Foto do recuo frontal'), (3, 'Foto do recuo lateral esquerdo'), (4, 'Foto do recuo lateral direito'), (5, 'Foto do recuo posterior (fundos)'), (6, 'Foto das áreas livres (poço de luz), quando houver')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('H2', 'todas', 1, 'Entrada do processo na Prefeitura', null, 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Selecionar a modalidade Habite-se no Aprova Digital e seguir os passos para a situação da solicitação (nova, 2ª via, retificação, planta vistada)'), (2, 'Anexar os documentos adquiridos ou emitidos nas etapas anteriores em seus devidos campos'), (3, 'Preencher os dados do proprietário com as informações coletadas'), (4, 'Preencher o campo 9 (áreas licenciadas) com as metragens do terreno e das edificações, de acordo com o projeto e o alvará de construção'), (5, 'Preencher o campo 11 (quadro de compartimentos) com as informações do projeto, do alvará de construção e/ou do termo de compromisso, separados por pavimento'), (6, 'Encaminhar a taxa do Habite-se (guia eventual) para o financeiro'), (7, 'Anexar o comprovante de pagamento da guia eventual no Aprova Digital'), (8, 'Encaminhar a taxa de ISS para o financeiro'), (9, 'Anexar o comprovante de pagamento do ISS no Aprova Digital'), (10, 'Processo deferido')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('H3', 'todas', 1, 'Agendar reunião de entrega dos documentos aprovados', null, 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Marcar reunião com cliente')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('H3', 'todas', 2, 'Reunião de entrega dos documentos aprovados', null, 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Imprimir documentos aprovados'), (2, 'Imprimir documentos emitidos pela Prefeitura'), (3, 'Emitir e imprimir termo de retirada'), (4, 'Explicar e entregar todos os documentos ao cliente')) as v(o, x);

-- ===== 0011_provisionamento.sql =====
-- Provisionamento: ao abrir o projeto, as tarefas de cada protocolo já nascem atribuídas a quem faz.
-- Regra: etapa do Setor de Projetos -> profissional da especialidade na equipe (arquitetônico, legal, interiores,
-- complementares) ou, na falta dele, o responsável pelo projeto. Etapa do Administrativo/Comercial -> fila do setor.

alter table projeto_tarefas
  add column responsavel_id uuid references profiles(id) on delete set null,
  add column setor_fila setor,
  add column atribuicao_manual boolean not null default false;
create index on projeto_tarefas(responsavel_id);
create index on projeto_tarefas(setor_fila) where responsavel_id is null;

-- setor que cuida da etapa (primeiro setor da lista, sem contar terceiros)
create or replace function fila_etapa(p_etapa text) returns setor language sql stable as $$
  select u.s from etapa_modelos m, unnest(m.setores) with ordinality as u(s, n)
  where m.codigo = p_etapa and u.s <> 'terceiros' order by u.n limit 1
$$;

-- profissional que faz a tarefa (nulo = fila do setor)
create or replace function responsavel_etapa(p_projeto uuid, p_etapa text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare esp text; r uuid;
begin
  if fila_etapa(p_etapa) is distinct from 'projetos' then return null; end if;
  esp := case when p_etapa = '15' then 'arquitetonico'
              when p_etapa in ('16','H1','H2','H3') then 'legal'
              when p_etapa in ('17','18') then 'interiores'
              when p_etapa = '19' then 'complementares' end;
  if esp is not null then
    select usuario_id into r from projeto_equipe where projeto_id = p_projeto and especialidade = esp order by id limit 1;
    if r is not null then return r; end if;
  end if;
  select responsavel_id into r from projetos where id = p_projeto;
  return r;
end $$;

-- cópia das tarefas para o projeto, já com a atribuição
create or replace function inserir_tarefas(p_projeto uuid, p_etapa text, p_variantes text[]) returns int
language plpgsql security definer set search_path = public as $$
declare t record; nt uuid; n int := 0;
begin
  if exists (select 1 from projeto_tarefas where projeto_id = p_projeto and etapa_codigo = p_etapa) then return 0; end if;
  for t in select * from tarefa_modelos where etapa_codigo = p_etapa and variante = any (p_variantes) order by ordem loop
    insert into projeto_tarefas (projeto_id, etapa_codigo, modelo_id, ordem, titulo, descricao, prioridade, responsavel_id, setor_fila)
    values (p_projeto, p_etapa, t.id, t.ordem, t.titulo, t.descricao, t.prioridade,
            responsavel_etapa(p_projeto, p_etapa), fila_etapa(p_etapa)) returning id into nt;
    if exists (select 1 from tarefa_item_modelos where tarefa_id = t.id) then
      insert into projeto_tarefa_itens (tarefa_id, projeto_id, ordem, texto)
        select nt, p_projeto, i.ordem, i.texto from tarefa_item_modelos i where i.tarefa_id = t.id order by i.ordem;
    else
      insert into projeto_tarefa_itens (tarefa_id, projeto_id, ordem, texto) values (nt, p_projeto, 1, null);
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- reatribui quando muda o responsável ou a equipe (tarefas já iniciadas ou atribuídas à mão não mudam)
create or replace function atribuir_tarefas(p_projeto uuid) returns void
language sql security definer set search_path = public as $$
  update projeto_tarefas t set responsavel_id = responsavel_etapa(t.projeto_id, t.etapa_codigo)
   where t.projeto_id = p_projeto and not t.atribuicao_manual
     and not exists (select 1 from projeto_tarefa_itens i where i.tarefa_id = t.id and i.feito)
$$;
revoke execute on function atribuir_tarefas(uuid) from public, anon, authenticated;
revoke execute on function responsavel_etapa(uuid, text) from public, anon, authenticated;

create or replace function reatribuir_por_projeto() returns trigger language plpgsql security definer set search_path = public as $$
begin perform atribuir_tarefas(new.id); return new; end $$;
create trigger projetos_reatribuir after update of responsavel_id on projetos
  for each row when (old.responsavel_id is distinct from new.responsavel_id) execute function reatribuir_por_projeto();

create or replace function reatribuir_por_equipe() returns trigger language plpgsql security definer set search_path = public as $$
begin perform atribuir_tarefas(coalesce(new.projeto_id, old.projeto_id)); return coalesce(new, old); end $$;
create trigger equipe_reatribuir after insert or update or delete on projeto_equipe
  for each row execute function reatribuir_por_equipe();

-- a equipe pode reatribuir uma tarefa ("assumir", "passar para"); o resto da tarefa fica protegido
create policy ptarefas_editar on projeto_tarefas for update to authenticated
  using (is_equipe() and pode_ver_projeto(projeto_id)) with check (is_equipe() and pode_ver_projeto(projeto_id));
create or replace function proteger_tarefa() returns trigger language plpgsql as $$
begin
  new.projeto_id := old.projeto_id; new.etapa_codigo := old.etapa_codigo; new.modelo_id := old.modelo_id;
  new.ordem := old.ordem; new.titulo := old.titulo; new.descricao := old.descricao;
  new.prioridade := old.prioridade; new.setor_fila := old.setor_fila;
  return new;
end $$;
create trigger tarefas_proteger before update on projeto_tarefas for each row execute function proteger_tarefa();

-- projetos que já existiam: atribui as tarefas
update projeto_tarefas t set responsavel_id = responsavel_etapa(t.projeto_id, t.etapa_codigo), setor_fila = fila_etapa(t.etapa_codigo);

-- ===== 0012_complementares_finalizacao.sql =====
-- Protocolos 04 COMPLEMENTARES e 05 FINALIZAÇÃO (modelos do Vobi).
-- 19 Complementares: 11 tarefas · 21 Agendamento da entrega · 22 Preparação (compilado) · 23 Reunião de entrega · 24 Encerramento.

insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('19', 'todas', 1, 'Avaliação interna', null, 'Baixa');
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('19', 'todas', 2, 'Gerar IFC do projeto', null, 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Gerar IFC do projeto'), (2, 'Solicitar ao Administrativo o envio do IFC ao profissional de complementares')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('19', 'todas', 3, 'Agendar reunião de pontos técnicos com o cliente', null, 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Marcar reunião com cliente')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('19', 'todas', 4, 'Reunião de pontos técnicos', null, 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Preenchimento de ata'), (2, 'Enviar ata de reunião ao cliente'), (3, 'Ata dado aceite pelo cliente')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('19', 'todas', 5, 'Projeto de pontos técnicos', null, 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Projeto dos pontos elétricos'), (2, 'Projeto dos pontos hidrossanitários'), (3, 'Projeto dos pontos de iluminação'), (4, 'Enviar projeto para o profissional responsável pela elaboração dos complementares')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('19', 'todas', 6, 'Fazer compatibilização dos complementares recebidos', 'Deverá ser feita a análise dos documentos que os profissionais responsáveis pelos complementares enviar. Deverá ser uma análise minuciosa e atenta.', 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Importar no arquivo do projeto 3D o IFC recebido'), (2, 'Caso necessário, criar arquivo com os comentários da compatibilização no PowerPoint'), (3, 'Compatibilização efetuada')) as v(o, x);
insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('19', 'todas', 7, 'Fazer cálculo de movimentação de terra (quando houver obra)', null, 'Baixa');
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('19', 'todas', 8, 'Entrega final dos complementares', null, 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Elétrica finalizada'), (2, 'Hidrossanitário finalizada'), (3, 'Estrutural finalizada')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('19', 'todas', 9, 'Imprimir projetos complementares', 'Imprimir os complementares elaborados.', 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Marcenaria'), (2, 'Marmoraria'), (3, 'Paginação'), (4, 'Forro de gesso'), (5, 'Luminotécnico'), (6, 'Revestimentos'), (7, 'Lista de móveis soltos'), (8, 'Espelhos'), (9, 'Esquadrias')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('19', 'todas', 10, 'Agendar reunião para entrega dos projetos complementares', null, 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Marcar reunião com cliente'), (2, 'Inserir reunião no sistema e notificar responsável')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('19', 'todas', 11, 'Reunião para entrega dos projetos complementares finalizados', null, 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Imprimir projetos finalizados'), (2, 'Imprimir termo de retirada')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('21', 'todas', 1, 'Agendar reunião de entrega de projetos', null, 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Marcar reunião com cliente'), (2, 'Inserir reunião no sistema e notificar responsável')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('22', 'todas', 1, 'Compilado dos documentos', null, 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Imprimir documentos para entrega'), (2, 'Preparar e-mail/pendrive para entrega digital'), (3, 'Emitir 2 vias do termo de retirada devidamente preenchido')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('23', 'todas', 1, 'Reunião de entrega de projetos', null, 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Reunião realizada'), (2, 'Retirar foto com o cliente')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('24', 'todas', 1, 'Fazer arquivamento', null, 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Analisar documentos da pasta do cliente e arquivar os documentos pertinentes')) as v(o, x);
with t as (insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade)
  values ('24', 'todas', 2, 'Atualizar no sistema', null, 'Baixa') returning id)
insert into tarefa_item_modelos (tarefa_id, ordem, texto) select t.id, v.o, v.x from t, (values (1, 'Dar como finalizado no Vobi'), (2, 'Remover projeto do quadro físico')) as v(o, x);

-- Projetos que já existiam recebem as tarefas dessas etapas (as que já têm tarefas não mudam)
do $$
declare e record;
begin
  for e in select pe.projeto_id, pe.etapa_codigo, p.tipo_estudo
           from projeto_etapas pe join projetos p on p.id = pe.projeto_id
           where pe.status <> 'nao_aplicavel' and pe.etapa_codigo = any (array['19','21','22','23','24']) loop
    perform inserir_tarefas(e.projeto_id, e.etapa_codigo, array['todas', e.tipo_estudo]);
  end loop;
end $$;

-- ===== 0013_setor_financeiro.sql =====
-- Setor Financeiro: acompanha todos os projetos (só leitura, a menos que seja responsável), sem acesso a tempos nem banco de horas.
alter type setor add value if not exists 'financeiro';

-- Comparação por texto: o valor novo do enum só pode ser usado depois que esta transação terminar
create or replace function pode_ver_projeto(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from projetos pr where pr.id = p and (
      is_admin()
      or (is_equipe() and (
            pr.responsavel_id = auth.uid()
            or exists (select 1 from projeto_equipe e where e.projeto_id = pr.id and e.usuario_id = auth.uid())
            or (select setor::text from profiles where id = auth.uid()) in ('administrativo','comercial','financeiro')))
      or pr.cliente_id = meu_cliente()
    )
  )
$$;

-- ===== 0014_horas_estimadas.sql =====
-- Horas estimadas: base para comparar previsto × realizado por projeto, etapa e pessoa (Gestão de horas).
-- Cada etapa tem uma estimativa padrão (editável); cada projeto pode ter a própria estimativa. Sem a do projeto, vale a soma das etapas que se aplicam a ele.
alter table etapa_modelos add column horas_padrao numeric(6,1) not null default 0 check (horas_padrao >= 0);
alter table projetos add column horas_estimadas numeric(8,1) check (horas_estimadas is null or horas_estimadas >= 0);

update etapa_modelos m set horas_padrao = v.h
  from (values ('01',3),('02',0.5),('03',0.5),('04',0.3),('05',2),('06',4),('07',16),('08',0.3),('09',3),('10',0.5),('11',10),('12',0.3),('13',3),('14',0.5),
               ('15',60),('16',24),('17',30),('18',30),('19',20),('20',2),('21',0.3),('22',3),('23',2),('24',0.5),('H1',6),('H2',6),('H3',2)) as v(c, h)
 where m.codigo = v.c;

