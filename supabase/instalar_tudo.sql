-- Instalação completa do banco (0001 a 0008). Cole tudo no SQL Editor do Supabase e clique em Run.
-- Se o banco já foi instalado até a 0005, rode, na ordem, apenas 0006, 0007 e 0008 de supabase/migrations/.

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
  categoria text,                           -- A, B, C, D (C e D = "cliente + projetos")
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
