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
