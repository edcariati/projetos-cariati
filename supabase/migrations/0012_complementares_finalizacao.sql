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
