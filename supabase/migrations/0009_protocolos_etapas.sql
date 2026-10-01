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
