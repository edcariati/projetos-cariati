-- Ajustes da planta baixa (0023). Para o banco que já tem as migrations até a 0022. Rode uma única vez.

-- Ajustes da análise até o estudo de planta baixa: escopo do projeto, agenda de reuniões e etapas por tipo de projeto.

alter table projetos
  add column if not exists complementares_tipos text[],            -- hidráulico, elétrico, estrutural, outros
  add column if not exists tem_condominio boolean not null default false,
  add column if not exists tem_evf boolean not null default false,
  add column if not exists tem_caixa boolean not null default false;

-- data e horário de uma reunião marcada num item de agendamento
alter table projeto_tarefa_itens add column if not exists agenda_em timestamptz;

-- variante de tarefas para projetos de regularização
alter table tarefa_modelos drop constraint if exists tarefa_modelos_variante_check;
alter table tarefa_modelos add constraint tarefa_modelos_variante_check
  check (variante in ('todas','padrao','ampliacao','mais_projetos','apos_solicitacao','apos_ausencia','regularizacao'));

-- Etapas por tipo de projeto: ampliação não tem o agendamento da reunião de briefing (04); regularização não tem briefing (03, 04 e 05)
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
      when new.tipo_projeto = 'regularizacao' and m.codigo in ('03','04','05') then 'nao_aplicavel'
      when (new.tipo_estudo = 'ampliacao' or new.tipo_projeto = 'ampliacao') and m.codigo = '04' then 'nao_aplicavel'
      else 'pendente'
    end
  from etapa_modelos m;

  update projeto_etapas set status = 'em_andamento', iniciada_em = now()
   where projeto_id = new.id and etapa_codigo = '01';
  insert into historico (projeto_id, etapa_codigo, tipo, texto)
  values (new.id, '01', 'etapa_iniciada', 'Projeto criado');

  perform inserir_tarefas(new.id, e.etapa_codigo,
    case when new.tipo_projeto = 'regularizacao' then array['todas','regularizacao'] else array['todas', new.tipo_estudo] end)
  from projeto_etapas e join etapa_modelos m on m.codigo = e.etapa_codigo
  where e.projeto_id = new.id and e.status <> 'nao_aplicavel' and (m.fase <= 4 or m.fase = 6);
  return new;
end $$;

-- Protocolos revistos na análise da planta baixa (etapas 01, 02, 03 e 06). Projetos já criados mantêm as tarefas que têm.
do $$ declare nt uuid; begin
  delete from tarefa_modelos where etapa_codigo = '03' and variante = 'todas' and titulo = 'Apresentação do profissional no canal oficial do projeto';
  delete from tarefa_modelos where etapa_codigo = '06' and variante = 'ampliacao' and titulo = 'Passar aferição a limpo';
  delete from tarefa_modelos where etapa_codigo = '01' and variante = 'todas' and ordem = 1;
  insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('01', 'todas', 1, 'Coleta de dados inicial', null, 'Média') returning id into nt;
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 1, 'Metragem aproximada');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 2, 'Nome completo');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 3, 'Telefone');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 4, 'E-mail');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 5, 'Endereço atual');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 6, 'Endereço da obra');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 7, 'Lote');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 8, 'Quadra');
  delete from tarefa_modelos where etapa_codigo = '03' and variante = 'todas' and ordem = 3;
  insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('03', 'todas', 3, 'Envio do briefing ao cliente', null, 'Baixa') returning id into nt;
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 1, 'Envio ao cliente');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 2, 'Preenchido pelo cliente');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 3, 'Mensagem de agradecimento pelo preenchimento do briefing');
  delete from tarefa_modelos where etapa_codigo = '06' and variante = 'padrao' and ordem = 1;
  insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('06', 'padrao', 1, 'Aferição no terreno', null, 'Alta') returning id into nt;
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 1, 'Registro fotográfico dos 4 cantos do terreno e um 360 na frente do lote');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 2, 'Salvar fotos no servidor');
  delete from tarefa_modelos where etapa_codigo = '06' and variante = 'ampliacao' and ordem = 2;
  insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('06', 'ampliacao', 2, 'Aferição do local de ampliação', null, 'Alta') returning id into nt;
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 1, 'Registro fotográfico do local');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 2, 'Levantamento do existente e do averbado');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 3, 'Salvar fotos no servidor');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 4, 'Vetorização do levantamento');
  delete from tarefa_modelos where etapa_codigo = '02' and variante = 'todas' and titulo = 'Comercial: envio do dossiê ao profissional responsável';
  insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('02', 'todas', 1, 'Comercial: envio do dossiê ao profissional responsável', null, 'Alta') returning id into nt;
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 1, 'Dossiê com as informações do cliente enviado ao profissional responsável pelo projeto');
  delete from tarefa_modelos where etapa_codigo = '02' and variante = 'todas' and titulo = 'Administrativo: pasta no servidor e informações do grupo';
  insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('02', 'todas', 2, 'Administrativo: pasta no servidor e informações do grupo', null, 'Alta') returning id into nt;
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 1, 'Criação da pasta do cliente no servidor');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 2, 'Envio das informações sobre o grupo, o projeto e o escritório');
  delete from tarefa_modelos where etapa_codigo = '02' and variante = 'todas' and titulo = 'Projetos: mensagem inicial do profissional responsável';
  insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('02', 'todas', 3, 'Projetos: mensagem inicial do profissional responsável', null, 'Alta') returning id into nt;
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 1, 'Profissional responsável se apresentou ao cliente no canal oficial (grupo de WhatsApp)');
  delete from tarefa_modelos where etapa_codigo = '02' and variante = 'regularizacao' and titulo = 'Agendar o levantamento do local da regularização';
  insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('02', 'regularizacao', 4, 'Agendar o levantamento do local da regularização', 'Em regularização não há briefing: depois da mensagem do profissional, agenda-se o levantamento do local.', 'Alta') returning id into nt;
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 1, 'Agendar o levantamento do local alvo da regularização');
  delete from tarefa_modelos where etapa_codigo = '03' and variante = 'ampliacao' and titulo = 'Agendar a aferição do local da ampliação';
  insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('03', 'ampliacao', 4, 'Agendar a aferição do local da ampliação', 'Em ampliação não há a etapa de agendamento da reunião de briefing: depois do briefing preenchido, agenda-se a aferição do local.', 'Alta') returning id into nt;
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 1, 'Agendar a aferição do local da ampliação');
  delete from tarefa_modelos where etapa_codigo = '06' and variante = 'regularizacao' and titulo = 'Aferição do local para regularização';
  insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('06', 'regularizacao', 5, 'Aferição do local para regularização', null, 'Alta') returning id into nt;
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 1, 'Registro fotográfico do local');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 2, 'Salvar fotos no servidor');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 3, 'Vetorização do levantamento');
end $$;
