-- Instalação completa do banco (0001 a 0019). Cole tudo no SQL Editor do Supabase e clique em Run.
-- Se o banco já foi instalado até a 0005, use supabase/atualizar_0006_a_0016.sql e depois supabase/atualizar_0017.sql. Se já foi até a 0014, use supabase/atualizar_0015_e_0016.sql e depois supabase/atualizar_0017.sql.

-- ===== 0001_schema.sql =====
-- Setor de Projetos · Cariati — esquema inicial
create extension if not exists "pgcrypto";

create type setor as enum ('comercial','administrativo','projetos','terceiros');
create type papel as enum ('admin','membro');
create type projeto_status as enum ('ativo','pausado','finalizado','rescindido');
create type etapa_status as enum ('pendente','em_andamento','concluida','nao_aplicavel');
create type protocolo_tipo as enum ('prefeitura','condominio','outro_orgao');
create type protocolo_status as enum ('a_protocolar','protocolado','em_analise','exigencia','aprovado','entregue_ao_cliente');

-- Perfis (um por usuário do Supabase Auth)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default '',
  setor setor not null default 'projetos',
  papel papel not null default 'membro',
  created_at timestamptz not null default now()
);

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and papel = 'admin')
$$;

-- Clientes
create table clientes (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,                       -- ex.: CA000123
  nome text not null,
  categoria text,                           -- A a E (D e E = "cliente + projetos")
  premium boolean not null default false,   -- premium recebe pendrive na entrega
  telefone text,
  email text,
  observacoes text,
  created_at timestamptz not null default now()
);

-- Modelos de etapa (o fluxo oficial; editável sem mexer no código)
create table etapa_modelos (
  codigo text primary key,                  -- '01'..'24', 'P1'..'P4'
  ordem int not null,
  fase int not null,                        -- 1..4, 5 = pausa e retomada
  titulo text not null,
  rotulo text not null,
  setores setor[] not null default '{}',
  cliente_participa boolean not null default false,
  entrada text,
  saida text,
  regra text,
  opcional boolean not null default false,
  aceite_formal boolean not null default false,
  escopo text                               -- legal | interiores | complementares (quando opcional)
);

-- Projetos
create table projetos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete restrict,
  nome text not null,
  codigo text,
  responsavel_id uuid references profiles(id),
  tem_legal boolean not null default false,
  tem_interiores boolean not null default false,
  tem_complementares boolean not null default false,
  tipo_aprovacao text,                      -- residencial|comercial|habite-se|unificacao|averbacao
  status projeto_status not null default 'ativo',
  pausado_em date,
  motivo_pausa text,
  observacoes text,
  created_at timestamptz not null default now()
);
create index on projetos(status);
create index on projetos(cliente_id);

-- Etapas de cada projeto (instanciadas a partir dos modelos)
create table projeto_etapas (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references projetos(id) on delete cascade,
  etapa_codigo text not null references etapa_modelos(codigo),
  status etapa_status not null default 'pendente',
  responsavel_id uuid references profiles(id),
  iniciada_em timestamptz,
  concluida_em timestamptz,
  rodadas_ajuste int not null default 0 check (rodadas_ajuste >= 0),
  observacao text,
  unique (projeto_id, etapa_codigo)
);
create index on projeto_etapas(projeto_id);

-- Histórico (registro rastreável de tudo que acontece)
create table historico (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references projetos(id) on delete cascade,
  etapa_codigo text references etapa_modelos(codigo),
  tipo text not null,                       -- etapa_iniciada | etapa_concluida | ajuste | pausa | retomada | nota | protocolo
  texto text,
  autor_id uuid references profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index on historico(projeto_id, created_at desc);

-- Protocolos (prefeitura, condomínio e outros órgãos)
create table protocolos (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references projetos(id) on delete cascade,
  tipo protocolo_tipo not null default 'prefeitura',
  orgao text,
  numero text,
  status protocolo_status not null default 'a_protocolar',
  data_protocolo date,
  prazo date,                               -- próximo prazo a acompanhar (retorno, exigência…)
  cliente_notificado boolean not null default false,
  observacao text,
  responsavel_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on protocolos(status);
create index on protocolos(prazo);

create table protocolo_andamentos (
  id uuid primary key default gen_random_uuid(),
  protocolo_id uuid not null references protocolos(id) on delete cascade,
  status protocolo_status,
  texto text,
  autor_id uuid references profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger protocolos_touch before update on protocolos
  for each row execute function touch_updated_at();

-- Ao criar um projeto, cria suas etapas conforme o escopo contratado
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
      else 'pendente'
    end
  from etapa_modelos m;

  update projeto_etapas set status = 'em_andamento', iniciada_em = now()
   where projeto_id = new.id and etapa_codigo = '01';
  insert into historico (projeto_id, etapa_codigo, tipo, texto)
  values (new.id, '01', 'etapa_iniciada', 'Projeto criado');
  return new;
end $$;
create trigger projetos_instanciar after insert on projetos
  for each row execute function instanciar_etapas();

-- Segurança: só usuários logados; exclusão apenas por admin
alter table profiles enable row level security;
alter table clientes enable row level security;
alter table etapa_modelos enable row level security;
alter table projetos enable row level security;
alter table projeto_etapas enable row level security;
alter table historico enable row level security;
alter table protocolos enable row level security;
alter table protocolo_andamentos enable row level security;

create policy profiles_ler on profiles for select to authenticated using (true);
create policy profiles_editar_proprio on profiles for update to authenticated
  using (id = auth.uid() or is_admin()) with check (is_admin() or (id = auth.uid() and papel = 'membro'));
create policy modelos_ler on etapa_modelos for select to authenticated using (true);
create policy modelos_admin on etapa_modelos for all to authenticated using (is_admin()) with check (is_admin());

do $$
declare t text;
begin
  foreach t in array array['clientes','projetos','projeto_etapas','historico','protocolos','protocolo_andamentos'] loop
    execute format('create policy %I_ler on %I for select to authenticated using (true)', t, t);
    execute format('create policy %I_criar on %I for insert to authenticated with check (true)', t, t);
    execute format('create policy %I_editar on %I for update to authenticated using (true) with check (true)', t, t);
    execute format('create policy %I_excluir on %I for delete to authenticated using (is_admin())', t, t);
  end loop;
end $$;

-- ===== 0002_seed_etapas.sql =====
-- Fluxo oficial do Setor de Projetos (revisão 22/09/2026)
insert into etapa_modelos (codigo, ordem, fase, titulo, rotulo, setores, cliente_participa, entrada, saida, regra, opcional, aceite_formal, escopo) values
('01',1,1,'Fechamento do contrato','Contrato','{comercial}',false,'Negociação concluída','Dossiê do cliente','Dossiê incompleto volta ao Comercial; o fluxo não segue até a regularização',false,false,null),
('02',2,1,'Pasta e grupo do cliente','Pasta e grupo','{administrativo}',false,'Contrato fechado','Grupo oficial no WhatsApp','Acontece em paralelo ao envio do dossiê',false,false,null),
('03',3,1,'Apresentação e envio do briefing','Briefing','{projetos}',true,'Grupo de WhatsApp criado','Briefing preenchido','O fluxo pausa até o cliente preencher o briefing',false,false,null),
('04',4,1,'Agendamento da reunião de briefing','Agendamento','{administrativo}',true,'Briefing preenchido','Reunião de briefing marcada','Modalidade (presencial ou online) combinada no agendamento',false,false,null),
('05',5,1,'Reunião de briefing','Reunião','{projetos}',true,'Briefing e dossiê do Comercial','Ata da reunião assinada','Com informação suficiente, o projeto entra em desenvolvimento',false,false,null),
('06',6,2,'Levantamento e documentos','Levantamento','{projetos}',true,'Ata e briefing','Fotos e documentação','O estudo só começa com levantamento e documentos em mãos',false,false,null),
('07',7,2,'Estudo de planta baixa','Planta baixa','{projetos}',false,'Briefing, ata, fotos e documentos','Estudo preliminar em PDF','Ao finalizar, avisa no canal oficial para o Administrativo agendar',false,false,null),
('08',8,2,'Agendamento da apresentação da planta baixa','Agendamento','{administrativo}',true,'Aviso de finalização do Setor de Projetos','Reunião de apresentação marcada','Modalidade combinada no agendamento',false,false,null),
('09',9,2,'Apresentação da planta baixa','Apresentação','{projetos}',true,'Estudo preliminar em PDF','Aprovação do cliente','Até 3 rodadas de ajuste. Prazo mínimo: 7 dias (simples) e 15 (significativas)',false,false,null),
('10',10,2,'Aceite formal da planta baixa','Aceite','{projetos,administrativo}',true,'Cliente de acordo, sem novas alterações','Aceite assinado','Sem assinatura, nada avança',false,true,null),
('11',11,2,'Estudo de fachada','Fachada','{projetos}',false,'Aceite da planta baixa','Estudo de fachada em imagem','Ao finalizar, avisa no canal oficial para o Administrativo agendar',false,false,null),
('12',12,2,'Agendamento da apresentação da fachada','Agendamento','{administrativo}',true,'Aviso de finalização do Setor de Projetos','Reunião de apresentação marcada','Modalidade combinada no agendamento',false,false,null),
('13',13,2,'Apresentação da fachada','Apresentação','{projetos}',true,'Estudo de fachada em imagem','Aprovação do cliente','Até 3 rodadas de ajuste. Prazo mínimo: 7 dias (simples) e 15 (significativas)',false,false,null),
('14',14,2,'Aceite formal da fachada','Aceite','{projetos,administrativo}',true,'Cliente de acordo, sem novas alterações','Aceite assinado','Sem assinatura, nada avança',false,true,null),
('15',15,3,'Projeto arquitetônico','Arquitetônico','{projetos}',false,'Estudos aprovados','Projeto conferido','Outro profissional confere com o checklist antes de seguir',false,false,null),
('16',16,3,'Projeto legal','Legal','{projetos,terceiros}',false,'Projeto arquitetônico conferido','Projeto aprovado','Entregar ao cliente assim que a aprovação sair',true,false,'legal'),
('17',17,3,'Estudo de interiores','Estudo de interiores','{projetos,administrativo}',true,'Aceites do estudo preliminar','Aceite assinado','Mesmo ciclo de ajustes da planta baixa',true,true,'interiores'),
('18',18,3,'Detalhamento de interiores','Detalhamento','{projetos}',false,'Estudo de interiores aprovado','Detalhamento conferido','Análise interna antes da entrega',true,false,'interiores'),
('19',19,3,'Projetos complementares','Complementares','{projetos,terceiros}',false,'Arquitetônico ou estudo de interiores consolidado','Projetos complementares contratados','Antes, reunião de pontos técnicos com o cliente',true,false,'complementares'),
('20',20,4,'Conferência final','Conferência','{projetos}',false,'Etapas independentes concluídas','Pedido de agendamento','Cada etapa independente é entregue assim que concluída',false,false,null),
('21',21,4,'Agendamento da entrega','Agendamento','{administrativo}',true,'Solicitação do Setor de Projetos','Reunião de entrega marcada','Contato pelo canal oficial no WhatsApp',false,false,null),
('22',22,4,'Preparação da entrega','Preparação','{projetos}',false,'Reunião de entrega marcada','Materiais conferidos e separados','Pendrive apenas em projetos premium',false,false,null),
('23',23,4,'Reunião de entrega','Entrega','{projetos}',true,'Materiais conferidos e separados','Termo assinado e foto com o cliente','Documentação da Prefeitura só depois da aprovação',false,false,null),
('24',24,4,'Encerramento','Encerramento','{projetos}',false,'Entrega realizada','Projeto fora do Quadro de Projetos','Arquivar documentos e marcar como finalizado no Vobi',false,false,null),
('P1',25,5,'Pausa a pedido do cliente','A pedido','{projetos}',true,'Pedido do cliente','Termo assinado','O projeto fica parado até a retomada formal',false,false,null),
('P2',26,5,'Pausa por falta de retorno','Sem retorno','{administrativo}',false,'3 semanas sem resposta','Projeto pausado','Notificação por e-mail e aviso no WhatsApp',false,false,null),
('P3',27,5,'Retomada do projeto','Retomada','{projetos}',true,'Pedido de retorno','Aditivo assinado','Possível em até 180 dias de pausa',false,false,null),
('P4',28,5,'Prazo de pausa esgotado','Rescisão','{administrativo}',false,'181º dia de pausa','Contrato encerrado','Enviar o termo de rescisão por ausência de retomada',false,false,null)
on conflict (codigo) do nothing;

-- ===== 0003_documentos.sql =====
-- Documentos por etapa: modelos (do fluxo) e arquivos anexados a cada projeto
create table documento_modelos (
  id uuid primary key default gen_random_uuid(),
  etapa_codigo text not null references etapa_modelos(codigo) on delete cascade,
  nome text not null,
  padrao_arquivo text,          -- ex.: ATA_CAXXXXXX_BRF_DATA ; null = não precisa salvar
  ordem int not null default 0
);
create index on documento_modelos(etapa_codigo);

create table projeto_documentos (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references projetos(id) on delete cascade,
  etapa_codigo text not null references etapa_modelos(codigo),
  modelo_id uuid references documento_modelos(id) on delete set null,
  nome text not null,
  codigo_arquivo text,
  arquivo_path text not null,   -- caminho no bucket "documentos"
  arquivo_nome text not null,
  enviado_por uuid references profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index on projeto_documentos(projeto_id);

alter table documento_modelos enable row level security;
alter table projeto_documentos enable row level security;
create policy docmod_ler on documento_modelos for select to authenticated using (true);
create policy docmod_admin on documento_modelos for all to authenticated using (is_admin()) with check (is_admin());
create policy projdoc_ler on projeto_documentos for select to authenticated using (true);
create policy projdoc_criar on projeto_documentos for insert to authenticated with check (true);
create policy projdoc_editar on projeto_documentos for update to authenticated using (true) with check (true);
create policy projdoc_excluir on projeto_documentos for delete to authenticated using (is_admin());

-- Bucket privado (arquivos acessados por link assinado)
insert into storage.buckets (id, name, public) values ('documentos','documentos',false)
on conflict (id) do nothing;
create policy documentos_ler on storage.objects for select to authenticated using (bucket_id = 'documentos');
create policy documentos_enviar on storage.objects for insert to authenticated with check (bucket_id = 'documentos');
create policy documentos_excluir on storage.objects for delete to authenticated using (bucket_id = 'documentos' and is_admin());

-- ===== 0004_seed_documentos.sql =====
-- Documentos exigidos em cada etapa (fluxo revisão 22/09/2026)
insert into documento_modelos (etapa_codigo, nome, padrao_arquivo, ordem) values
('01','Dossiê com as informações do cliente (app do Comercial)','DOS_CAXXXXXX_REVXX',1),
('02','Texto padrão para grupo de WhatsApp (cliente A para cima)',null,1),
('02','Texto padrão para grupo de WhatsApp (cliente B para baixo)',null,2),
('02','Texto padrão para grupo de WhatsApp (cliente + projetos)',null,3),
('03','Envio do briefing de projeto',null,1),
('03','Imagem briefing',null,2),
('03','Briefing respondido pelo cliente (Forms)','BRF_CAXXXXXX_REVXX',3),
('05','Ata de reunião de briefing','ATA_CAXXXXXX_BRF_DATA',1),
('06','Documentação do terreno ou imóvel',null,1),
('09','Ata de reunião da planta baixa','ATA_CAXXXXXX_ESTD_DATA',1),
('09','Projeto preliminar — planta baixa',null,2),
('10','Mensagem sobre os estudos',null,1),
('10','Aceite da planta baixa','ESTD_CAXXXXXX_REVIN',2),
('13','Ata de reunião da fachada','ATA_CAXXXXXX_FACH_DATA',1),
('13','Projeto preliminar — fachada',null,2),
('14','Mensagem sobre os estudos',null,1),
('14','Termo de aceite do estudo de fachada','ACT_CAXXXXXX_FACH_REVXX',2),
('15','Registro de conclusão de etapa para análise interna','RDCE_CAXXXXXX_ARQ_REVXX',1),
('15','Checklist do projeto arquitetônico','CHCK_CAXXXXXX_ARQ_REVXX',2),
('16','Registro de conclusão de etapa para análise interna','RDCE_CAXXXXXX_CON_REVXX',1),
('16','Checklist do projeto legal','CHCK_CAXXXXXX_CON_REVXX',2),
('16','Procuração (pessoa física ou jurídica)','PRC_CAXXXXXX_REVXX',3),
('16','Memorial descritivo','MMD_CAXXXXXX_REVXX',4),
('16','Termo de compromisso','TDC_CAXXXXXX_REVXX',5),
('16','Termo de veracidade (unifamiliar ou multifamiliar)','TDV_CAXXXXXX_REVXX',6),
('16','Protocolo de acompanhamento','PDAC_CAXXXXXX',7),
('16','RRT de projeto e/ou gestão',null,8),
('17','Briefing de interiores',null,1),
('17','Ata de reunião de interiores','ATA_CAXXXXXX_INTR_DATA',2),
('17','Mensagem sobre os estudos',null,3),
('17','Termo de aceite do estudo de projeto de interiores','ACT_CAXXXXXX_INTR_REVXX',4),
('19','Ata de reunião de pontos técnicos','ATA_CAXXXXXX_PTEC_DATA',1),
('19','Checklist dos complementares','CHCK_CAXXXXXX_COM_REVXX',2),
('22','Termo de retirada de documento','TDRD_CAXXXXXX_REVXX',1),
('22','Corpo do e-mail de entrega por e-mail',null,2),
('22','Diretrizes para retirada de documentos',null,3),
('23','Termo de retirada de documento assinado','TDRD_CAXXXXXX_REVXX',1),
('P1','Termo de solicitação de pausa de projeto','TDSP_CAXXXXXX_REVXX',1),
('P2','Notificação de pausa de projeto','NDPP_CAXXXXXX_REVXX',1),
('P3','Termo de retomada de projeto','TDRP_CAXXXXXX_REVXX',1),
('P3','Aditivo de retomada de projeto','ADRP_CAXXXXXX_REVXX',2),
('P4','Rescisão de contrato por ausência de retorno',null,1);

-- ===== 0005_protocolo_entrega.sql =====
-- Protocolos de entrega ao cliente (além de Prefeitura, condomínio e outros órgãos)
alter type protocolo_tipo add value if not exists 'entrega_cliente';

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

-- ===== 0015_desempenho.sql =====
-- Desempenho: o app ficava lento ao salvar e ao abrir telas com muitos dados.
-- 1) índices nas colunas mais filtradas · 2) regras de acesso (RLS) que resolvem "quais projetos eu vejo" uma vez por consulta,
--    em vez de uma vez por linha · 3) criação das tarefas de um projeto em lote, em vez de linha a linha.

create index if not exists tempos_usuario_data on tempos (usuario_id, iniciado_em);
create index if not exists tempos_projeto on tempos (projeto_id);
create index if not exists tempos_iniciado on tempos (iniciado_em);
create index if not exists itens_feito_em on projeto_tarefa_itens (feito_em) where feito_em is not null;
create index if not exists projetos_responsavel on projetos (responsavel_id);
create index if not exists protocolos_projeto on protocolos (projeto_id);
create index if not exists documentos_projeto on projeto_documentos (projeto_id);

-- Conjunto de projetos que a pessoa logada enxerga (mesma regra de pode_ver_projeto, calculada uma vez)
create or replace function projetos_visiveis() returns setof uuid
language sql stable security definer set search_path = public as $$
  select pr.id from projetos pr
   where is_admin() or pr.cliente_id = meu_cliente()
      or (is_equipe() and (
            pr.responsavel_id = auth.uid()
            or pr.id in (select e.projeto_id from projeto_equipe e where e.usuario_id = auth.uid())
            or (select setor::text from profiles where id = auth.uid()) in ('administrativo','comercial','financeiro')))
$$;

-- Regras de acesso reescritas com (select ...) para o banco avaliar uma única vez
drop policy projetos_ler on projetos;
create policy projetos_ler on projetos for select to authenticated using (
  (select is_admin()) or responsavel_id = (select auth.uid()) or cliente_id = (select meu_cliente()) or id in (select projetos_visiveis()));
drop policy projetos_editar on projetos;
create policy projetos_editar on projetos for update to authenticated
  using ((select is_equipe()) and id in (select projetos_visiveis())) with check ((select is_equipe()));

drop policy etapas_ler on projeto_etapas;
create policy etapas_ler on projeto_etapas for select to authenticated using (projeto_id in (select projetos_visiveis()));
drop policy etapas_editar on projeto_etapas;
create policy etapas_editar on projeto_etapas for update to authenticated
  using ((select is_equipe()) and projeto_id in (select projetos_visiveis())) with check ((select is_equipe()));

drop policy historico_ler on historico;
create policy historico_ler on historico for select to authenticated using ((select is_equipe()) and projeto_id in (select projetos_visiveis()));
drop policy historico_criar on historico;
create policy historico_criar on historico for insert to authenticated with check ((select is_equipe()) and projeto_id in (select projetos_visiveis()));

drop policy protocolos_ler on protocolos;
create policy protocolos_ler on protocolos for select to authenticated using (projeto_id in (select projetos_visiveis()));
drop policy protocolos_criar on protocolos;
create policy protocolos_criar on protocolos for insert to authenticated with check ((select is_equipe()) and projeto_id in (select projetos_visiveis()));
drop policy protocolos_editar on protocolos;
create policy protocolos_editar on protocolos for update to authenticated
  using ((select is_equipe()) and projeto_id in (select projetos_visiveis())) with check ((select is_equipe()));

drop policy andamentos_ler on protocolo_andamentos;
create policy andamentos_ler on protocolo_andamentos for select to authenticated using (
  (select is_equipe()) and exists (select 1 from protocolos p where p.id = protocolo_id and p.projeto_id in (select projetos_visiveis())));
drop policy andamentos_criar on protocolo_andamentos;
create policy andamentos_criar on protocolo_andamentos for insert to authenticated with check (
  (select is_equipe()) and exists (select 1 from protocolos p where p.id = protocolo_id and p.projeto_id in (select projetos_visiveis())));

drop policy projdoc_ler on projeto_documentos;
create policy projdoc_ler on projeto_documentos for select to authenticated using (
  projeto_id in (select projetos_visiveis()) and ((select is_equipe()) or ((select is_cliente()) and visivel_cliente)));
drop policy projdoc_criar on projeto_documentos;
create policy projdoc_criar on projeto_documentos for insert to authenticated with check ((select is_equipe()) and projeto_id in (select projetos_visiveis()));
drop policy projdoc_editar on projeto_documentos;
create policy projdoc_editar on projeto_documentos for update to authenticated
  using ((select is_equipe()) and projeto_id in (select projetos_visiveis())) with check ((select is_equipe()));

drop policy equipe_ler on projeto_equipe;
create policy equipe_ler on projeto_equipe for select to authenticated using ((select is_equipe()) and projeto_id in (select projetos_visiveis()));

drop policy ptarefas_ler on projeto_tarefas;
create policy ptarefas_ler on projeto_tarefas for select to authenticated using ((select is_equipe()) and projeto_id in (select projetos_visiveis()));
drop policy ptarefas_editar on projeto_tarefas;
create policy ptarefas_editar on projeto_tarefas for update to authenticated
  using ((select is_equipe()) and projeto_id in (select projetos_visiveis())) with check ((select is_equipe()) and projeto_id in (select projetos_visiveis()));

drop policy pitens_ler on projeto_tarefa_itens;
create policy pitens_ler on projeto_tarefa_itens for select to authenticated using ((select is_equipe()) and projeto_id in (select projetos_visiveis()));
drop policy pitens_editar on projeto_tarefa_itens;
create policy pitens_editar on projeto_tarefa_itens for update to authenticated
  using ((select is_equipe()) and projeto_id in (select projetos_visiveis())) with check ((select is_equipe()) and projeto_id in (select projetos_visiveis()));

drop policy tempos_ler on tempos;
create policy tempos_ler on tempos for select to authenticated using ((select pode_ver_banco_horas()) or usuario_id = (select auth.uid()));
drop policy ajustes_ler on banco_horas_ajustes;
create policy ajustes_ler on banco_horas_ajustes for select to authenticated using ((select pode_ver_banco_horas()) or usuario_id = (select auth.uid()));

drop policy clientes_ler on clientes;
create policy clientes_ler on clientes for select to authenticated using ((select is_equipe()) or id = (select meu_cliente()));

-- Cópia das tarefas de uma etapa para o projeto, em lote (antes: uma consulta por tarefa e por item)
create or replace function inserir_tarefas(p_projeto uuid, p_etapa text, p_variantes text[]) returns int
language plpgsql security definer set search_path = public as $$
declare resp uuid; fila setor; n int;
begin
  if exists (select 1 from projeto_tarefas where projeto_id = p_projeto and etapa_codigo = p_etapa) then return 0; end if;
  resp := responsavel_etapa(p_projeto, p_etapa);
  fila := fila_etapa(p_etapa);
  with novas as (
    insert into projeto_tarefas (projeto_id, etapa_codigo, modelo_id, ordem, titulo, descricao, prioridade, responsavel_id, setor_fila)
    select p_projeto, p_etapa, t.id, t.ordem, t.titulo, t.descricao, t.prioridade, resp, fila
      from tarefa_modelos t where t.etapa_codigo = p_etapa and t.variante = any (p_variantes)
    returning id, modelo_id)
  insert into projeto_tarefa_itens (tarefa_id, projeto_id, ordem, texto)
  select n.id, p_projeto, coalesce(i.ordem, 1), i.texto
    from novas n left join tarefa_item_modelos i on i.tarefa_id = n.modelo_id;
  select count(*) into n from projeto_tarefas where projeto_id = p_projeto and etapa_codigo = p_etapa;
  return n;
end $$;

-- Reatribuição: o responsável de cada etapa é calculado uma vez, não uma vez por tarefa
create or replace function atribuir_tarefas(p_projeto uuid) returns void
language sql security definer set search_path = public as $$
  with r as (
    select e.etapa_codigo, responsavel_etapa(p_projeto, e.etapa_codigo) as resp
      from (select distinct etapa_codigo from projeto_tarefas where projeto_id = p_projeto) e)
  update projeto_tarefas t set responsavel_id = r.resp
    from r
   where t.projeto_id = p_projeto and t.etapa_codigo = r.etapa_codigo and not t.atribuicao_manual
     and not exists (select 1 from projeto_tarefa_itens i where i.tarefa_id = t.id and i.feito)
$$;
revoke execute on function atribuir_tarefas(uuid) from public, anon, authenticated;
revoke execute on function projetos_visiveis() from public, anon;
grant execute on function projetos_visiveis() to authenticated;

analyze;

-- ===== 0016_cadastro_clientes.sql =====
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

-- ===== 0017_cadastros.sql =====
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

-- ===== 0018_servicos_cliente.sql =====
-- Serviços contratados no cadastro do cliente (aparecem na confirmação do cadastro e pré-preenchem o novo projeto).
alter table clientes
  add column if not exists servicos text[] not null default '{}',          -- ids do catálogo (src/lib/servicos.ts): arquitetonico, legal, interiores, complementares, habitese…
  add column if not exists servico_estudo text,                             -- padrao | ampliacao | mais_projetos
  add column if not exists servico_aprovacao text,                          -- tipo de aprovação do projeto legal
  add column if not exists servicos_observacao text;

-- ===== 0019_catalogo_servicos.sql =====
-- Catálogo de serviços e perfis de cliente editáveis pelo administrador (Cadastros → Serviços e perfis).
-- Os ids dos serviços (ex.: estrutural-04) ficam gravados nos clientes: por isso um serviço em uso só é desativado, nunca apagado.

create table if not exists servico_categorias (
  id text primary key,
  nome text not null,
  etapas text[] not null default '{}',          -- etapas do fluxo acrescentadas quando algum serviço da categoria é contratado
  ordem int not null default 0,
  ativo boolean not null default true
);
create table if not exists servico_itens (
  id text primary key,                          -- <categoria>-<número>, estável
  categoria_id text not null references servico_categorias(id) on delete cascade,
  nome text not null,
  ordem int not null default 0,
  ativo boolean not null default true
);
create index if not exists servico_itens_cat on servico_itens (categoria_id, ordem);
create table if not exists perfis_cliente (
  id text primary key,                          -- A1, A2, B, C, D…
  nome text not null,
  faixa text not null default '',               -- texto exibido, ex.: 150 a 250 m²
  estudo text not null default 'padrao' check (estudo in ('padrao','ampliacao','mais_projetos')),
  entregas text[] not null default '{}',        -- checklist padrão da proposta
  area_min numeric(8,1), area_max numeric(8,1), -- usados para sugerir o perfil pela metragem
  sugerir boolean not null default true,
  ordem int not null default 0,
  ativo boolean not null default true
);

alter table servico_categorias enable row level security;
alter table servico_itens enable row level security;
alter table perfis_cliente enable row level security;
create policy servcat_ler on servico_categorias for select to authenticated using ((select is_equipe()));
create policy servcat_escrever on servico_categorias for all to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy servit_ler on servico_itens for select to authenticated using ((select is_equipe()));
create policy servit_escrever on servico_itens for all to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy perfcli_ler on perfis_cliente for select to authenticated using ((select is_equipe()));
create policy perfcli_escrever on perfis_cliente for all to authenticated using ((select is_admin())) with check ((select is_admin()));
grant select, insert, update, delete on servico_categorias, servico_itens, perfis_cliente to authenticated;

insert into servico_categorias (id, nome, etapas, ordem) values
  ('arq', 'Projeto Arquitetônico', array[]::text[], 1),
  ('caixa', 'Documentação Caixa', array[]::text[], 2),
  ('estrutural', 'Projeto Estrutural', array['19']::text[], 3),
  ('hidro', 'Projeto Hidrossanitário', array['19']::text[], 4),
  ('eletrico', 'Projeto Elétrico', array['19']::text[], 5),
  ('reuso', 'Reuso de Água + Cisterna', array['19']::text[], 6),
  ('evf', 'EVF — Estudo de Viabilidade Financeira', array[]::text[], 7),
  ('interiores', 'Decoração de Interiores', array['17', '18']::text[], 8),
  ('prefeitura', 'Serviços de Prefeitura', array['16']::text[], 9)
on conflict (id) do nothing;

insert into servico_itens (id, categoria_id, nome, ordem) values
  ('arq-01', 'arq', 'Consultoria Arquitetônica', 1),
  ('arq-02', 'arq', 'Briefing', 2),
  ('arq-03', 'arq', 'Programa de Necessidades', 3),
  ('arq-04', 'arq', 'Levantamento Fotográfico', 4),
  ('arq-05', 'arq', 'Levantamento da Área de Reforma', 5),
  ('arq-06', 'arq', 'Levantamento para Regularização de Imóvel', 6),
  ('arq-07', 'arq', 'Estudo de Layout', 7),
  ('arq-08', 'arq', 'Projeto Arquitetônico', 8),
  ('arq-09', 'arq', 'Projeto Prefeitura', 9),
  ('arq-10', 'arq', 'Documentação Prefeitura', 10),
  ('arq-11', 'arq', 'Projeto 3D', 11),
  ('arq-12', 'arq', 'Estudo de Fachada', 12),
  ('arq-13', 'arq', 'Documentação Técnica (Aprova Fácil)', 13),
  ('arq-14', 'arq', 'Projeto Condomínio', 14),
  ('arq-15', 'arq', 'Projetos de Reformas', 15),
  ('caixa-01', 'caixa', 'Consultoria Documentação Caixa', 1),
  ('caixa-02', 'caixa', 'PCI — Projeto Complementar de Instalações (inclui CNO)', 2),
  ('caixa-03', 'caixa', 'PLS — Cronograma Físico-Financeiro (mensal por duração da obra)', 3),
  ('caixa-04', 'caixa', 'Montagem da Planilha CAIXA', 4),
  ('caixa-05', 'caixa', 'Documentação CAIXA (Financiamento)', 5),
  ('estrutural-01', 'estrutural', 'Consultoria Estrutural', 1),
  ('estrutural-02', 'estrutural', 'Estudo de Viabilidade Estrutural', 2),
  ('estrutural-03', 'estrutural', 'Projeto Estrutural Preliminar', 3),
  ('estrutural-04', 'estrutural', 'Projeto Estrutural Executivo', 4),
  ('estrutural-05', 'estrutural', 'Projeto de Fundações', 5),
  ('estrutural-06', 'estrutural', 'Projeto de Contenção / Escavação', 6),
  ('estrutural-07', 'estrutural', 'Cálculo Estrutural (Memorial de Cálculo)', 7),
  ('estrutural-08', 'estrutural', 'Projeto de Reforço Estrutural', 8),
  ('estrutural-09', 'estrutural', 'Laudo de Avaliação Estrutural', 9),
  ('estrutural-10', 'estrutural', 'Projeto de Reforma / Retrofit Estrutural', 10),
  ('estrutural-11', 'estrutural', 'Compatibilização Arquitetura/Hidro/Elétrica', 11),
  ('hidro-01', 'hidro', 'Consultoria Hidrossanitária', 1),
  ('hidro-02', 'hidro', 'Projeto de Água Fria', 2),
  ('hidro-03', 'hidro', 'Projeto de Água Quente', 3),
  ('hidro-04', 'hidro', 'Projeto de Esgoto Sanitário', 4),
  ('hidro-05', 'hidro', 'Projeto de Drenagem Pluvial', 5),
  ('hidro-06', 'hidro', 'Projeto de Gás (GLP/GN)', 6),
  ('hidro-07', 'hidro', 'Projeto de Reuso de Água', 7),
  ('hidro-08', 'hidro', 'Dimensionamento de Reservatórios', 8),
  ('hidro-09', 'hidro', 'Compatibilização Hidrossanitária com Arquitetura/Estrutura', 9),
  ('eletrico-01', 'eletrico', 'Consultoria Elétrica', 1),
  ('eletrico-02', 'eletrico', 'Projeto de Distribuição (Quadros, Circuitos, Iluminação e Tomadas)', 2),
  ('eletrico-03', 'eletrico', 'Projeto de Força (Motores, Máquinas, Cargas Especiais)', 3),
  ('eletrico-04', 'eletrico', 'Projeto de Iluminação (Natural + Artificial)', 4),
  ('eletrico-05', 'eletrico', 'Projeto de Telefonia e Dados (Cabeamento Estruturado)', 5),
  ('eletrico-06', 'eletrico', 'Projeto de Aterramento e SPDA', 6),
  ('eletrico-07', 'eletrico', 'Projeto de Energia Solar', 7),
  ('eletrico-08', 'eletrico', 'Compatibilização Elétrica com Arquitetura/Estrutura/Hidrossanitário', 8),
  ('reuso-01', 'reuso', 'Consultoria no Reuso', 1),
  ('reuso-02', 'reuso', 'Projeto de Cisterna (Captação de Água Pluvial)', 2),
  ('reuso-03', 'reuso', 'Projeto de Tratamento e Filtragem de Água Reutilizável', 3),
  ('reuso-04', 'reuso', 'Projeto de Distribuição de Água Reutilizada', 4),
  ('reuso-05', 'reuso', 'Projeto de Bombeamento e Pressurização', 5),
  ('reuso-06', 'reuso', 'Projeto de Monitoramento e Controle de Qualidade', 6),
  ('reuso-07', 'reuso', 'Projeto de Integração com Sistemas Hidrossanitários', 7),
  ('reuso-08', 'reuso', 'Projeto de Sustentabilidade e Economia de Água', 8),
  ('reuso-09', 'reuso', 'Tratamento e Filtragem', 9),
  ('reuso-10', 'reuso', 'Compatibilização de Reuso com Arquitetura/Estrutura/Hidrossanitário', 10),
  ('evf-01', 'evf', 'Consultoria EVF', 1),
  ('evf-02', 'evf', 'Prévia da Planilha de Produtos e Serviços', 2),
  ('evf-03', 'evf', 'Levantamento dos Orçamentos – Materiais', 3),
  ('evf-04', 'evf', 'Levantamento dos Orçamentos – Mão de Obra Especializada', 4),
  ('evf-05', 'evf', 'Organização dos Itens Propostos junto ao Projeto', 5),
  ('evf-06', 'evf', 'Reunião de Apresentação do EVF', 6),
  ('interiores-01', 'interiores', 'Consultoria Interiores', 1),
  ('interiores-02', 'interiores', 'Pisos e Revestimentos', 2),
  ('interiores-03', 'interiores', 'Marmoraria', 3),
  ('interiores-04', 'interiores', 'Louças e Metais', 4),
  ('interiores-05', 'interiores', 'Pinturas e Texturas', 5),
  ('interiores-06', 'interiores', 'Esquadrias e Aberturas', 6),
  ('interiores-07', 'interiores', 'Marcenarias', 7),
  ('interiores-08', 'interiores', 'Mobiliários Soltos', 8),
  ('interiores-09', 'interiores', 'Luminotécnico', 9),
  ('interiores-10', 'interiores', 'Forros e Gessos', 10),
  ('interiores-11', 'interiores', 'Eletros', 11),
  ('interiores-12', 'interiores', 'Pontos Técnicos dos Eletros', 12),
  ('prefeitura-01', 'prefeitura', 'Unificação / Desmembramento', 1),
  ('prefeitura-02', 'prefeitura', 'Averbação de Construção', 2),
  ('prefeitura-03', 'prefeitura', 'Desdobro de Lote', 3),
  ('prefeitura-04', 'prefeitura', 'Regularização de Obras', 4),
  ('prefeitura-05', 'prefeitura', 'Regularização na Receita Federal (CNO)', 5),
  ('prefeitura-06', 'prefeitura', 'Habite-se', 6)
on conflict (id) do nothing;

insert into perfis_cliente (id, nome, faixa, estudo, entregas, area_min, area_max, sugerir, ordem) values
  ('A4', 'Perfil A4', '1500 m² ou mais', 'padrao', array['Briefing detalhado e programa de necessidades', 'Levantamento fotográfico da área', 'Criação Personalizada e exclusiva', 'Estudo de Layout e fluxos', 'Estudo de Volumetrias', 'Estudo de Ventilação e iluminação natural analítica', 'Projeto Arquitetônico completo', 'Projeto para Aprovação na Prefeitura + Documentação', 'Projeto 3D – Fachada', 'Projeto 3D – Parte interna referência visual', 'Projeto em fotorrealismo Parte interna e externa', 'Tour 360 do Projetos', 'Vídeo do projeto em 3D realista', 'Documentação Técnica Aprova Digital', 'Projeto para Aprovação em Condomínio (se necessário)', 'Reunião de apresentação e ajustes', 'Compatibilização com os projetos complementares']::text[], 1500, null, true, 1),
  ('A3', 'Perfil A3', '800 a 1500 m²', 'padrao', array['Briefing detalhado e programa de necessidades', 'Levantamento fotográfico da área', 'Criação Personalizada e exclusiva', 'Estudo de Layout e fluxos', 'Estudo de Volumetrias', 'Estudo de Ventilação e iluminação natural analítica', 'Projeto Arquitetônico completo', 'Projeto para Aprovação na Prefeitura + Documentação', 'Projeto 3D – Fachada', 'Projeto 3D – Parte interna referência visual', 'Projeto em fotorrealismo Parte interna e externa', 'Documentação Técnica Aprova Digital', 'Projeto para Aprovação em Condomínio (se necessário)', 'Reunião de apresentação e ajustes', 'Compatibilização com os projetos complementares']::text[], 800, 1500, true, 2),
  ('A2', 'Perfil A2', '500 a 800 m²', 'padrao', array['Briefing detalhado e programa de necessidades', 'Levantamento fotográfico da área', 'Criação Personalizada e exclusiva', 'Estudo de Layout e fluxos', 'Estudo de Volumetrias', 'Estudo de Ventilação e iluminação natural analítica', 'Projeto Arquitetônico completo', 'Projeto para Aprovação na Prefeitura + Documentação', 'Projeto 3D – Fachada', 'Projeto 3D – Parte interna referência visual', 'Projeto em fotorrealismo Parte interna e externa', 'Documentação Técnica Aprova Digital', 'Projeto para Aprovação em Condomínio (se necessário)', 'Reunião de apresentação e ajustes', 'Compatibilização com os projetos complementares']::text[], 500, 800, true, 3),
  ('A1', 'Perfil A1', '250 a 500 m²', 'padrao', array['Briefing detalhado e programa de necessidades', 'Levantamento fotográfico da área', 'Estudo de Layout e fluxos', 'Projeto Arquitetônico completo', 'Projeto para Aprovação na Prefeitura + Documentação', 'Projeto 3D – Fachada', 'Projeto 3D – Parte interna referência visual', 'Projeto em fotorrealismo Parte interna e externa', 'Documentação Técnica Aprova Digital', 'Projeto para Aprovação em Condomínio (se necessário)', 'Reunião de apresentação e ajustes']::text[], 250, 500, true, 4),
  ('B', 'Perfil B', '150 a 250 m²', 'padrao', array['Briefing detalhado e programa de necessidades', 'Levantamento fotográfico da área', 'Estudo de Layout e fluxos', 'Projeto Arquitetônico completo', 'Projeto para Aprovação na Prefeitura + Documentação', 'Projeto 3D – Fachada (Referência Visual realista)', 'Projeto 3D – Parte interna (Referência Visual realista)', 'Documentação Técnica Aprova Digital', 'Projeto para Aprovação em Condomínio (se necessário)', 'Reunião de apresentação e ajustes']::text[], 150, 250, true, 5),
  ('C', 'Perfil C', '30 a 150 m²', 'padrao', array['Briefing detalhado e programa de necessidades', 'Levantamento fotográfico da área', 'Estudo de Layout e fluxos', 'Projeto Arquitetônico completo', 'Projeto para Aprovação na Prefeitura + Documentação', 'Projeto 3D – Fachada (Referência Visual realista)', 'Documentação Técnica AprovaDigital', 'Projeto para Aprovação em Condomínio (se necessário)', 'Reunião de apresentação e ajustes']::text[], 30, 150, true, 6),
  ('D', 'Perfil D (+ Projetos)', '100 a 150 m²', 'mais_projetos', array['Ideia do cliente (Alinhamento da ideia do Croqui)', 'Formatação do projeto (Apresentação com base no croqui)', 'Apresentação da planta do croqui apresentado (com escolha do tipo de telhado padrão)', 'Documento da prefeitura', 'Aprovação prefeitura', 'Não há alterações no projeto apresentado']::text[], 100, 150, false, 7),
  ('E', 'Perfil E (+ Projetos)', '30 a 100 m²', 'mais_projetos', array['Ideia do cliente (Alinhamento da ideia do Croqui)', 'Formatação do projeto (Apresentação com base no croqui)', 'Apresentação da planta do croqui apresentado (com escolha do tipo de telhado padrão)', 'Documento da prefeitura', 'Aprovação prefeitura', 'Não há alterações no projeto apresentado']::text[], 30, 100, false, 8)
on conflict (id) do nothing;

