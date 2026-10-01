-- Instalação completa do banco (0001 a 0005). Cole tudo no SQL Editor do Supabase e clique em Run.

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
