-- Ajustes pedidos pelos arquitetos: tipo de projeto, cronômetro por tarefa e lançamento manual de tempo,
-- checklist editável (incluir/excluir itens), protocolos externos × internos, LGPD e protocolos das etapas revistos.

-- ---------- Projeto e cliente ----------
alter table projetos
  add column if not exists tipo_projeto text,                       -- unifamiliar | multifamiliar | comercial | reforma | interiores | ampliacao | regularizacao | outros:ROTULO
  add column if not exists entregas text[],                         -- entregas do perfil marcadas no contrato (nulo = todas as do perfil)
  add column if not exists parceiros_complementares text;           -- quem elabora os complementares (etapa 19)
alter table clientes
  add column if not exists entregas text[],
  add column if not exists lgpd_consentimento_em timestamptz;       -- data em que o cliente foi informado sobre o uso dos dados

-- ---------- Tempos: lançamento manual, tarefa (atividade) e correção de horários ----------
alter table tempos
  add column if not exists tarefa_id uuid references projeto_tarefas(id) on delete set null,
  add column if not exists manual boolean not null default false,
  add column if not exists nota text;
create index if not exists tempos_tarefa on tempos(tarefa_id) where tarefa_id is not null;

drop policy if exists tempos_excluir on tempos;
create policy tempos_excluir on tempos for delete to authenticated using (usuario_id = auth.uid() or is_admin());

drop function if exists iniciar_cronometro(uuid, text);
create or replace function iniciar_cronometro(p_projeto uuid, p_etapa text, p_tarefa uuid default null) returns tempos
language plpgsql as $$
declare r tempos;
begin
  update tempos set finalizado_em = now() where usuario_id = auth.uid() and finalizado_em is null;
  insert into tempos (projeto_id, etapa_codigo, tarefa_id) values (p_projeto, p_etapa, p_tarefa) returning * into r;
  return r;
end $$;
grant execute on function iniciar_cronometro(uuid, text, uuid) to authenticated;

-- ---------- Checklist editável por projeto + nota (data/versão do aceite) ----------
alter table projeto_tarefa_itens add column if not exists nota text;
drop policy if exists pitens_incluir on projeto_tarefa_itens;
create policy pitens_incluir on projeto_tarefa_itens for insert to authenticated
  with check (is_equipe() and pode_ver_projeto(projeto_id));
drop policy if exists pitens_excluir on projeto_tarefa_itens;
create policy pitens_excluir on projeto_tarefa_itens for delete to authenticated
  using (is_equipe() and pode_ver_projeto(projeto_id));
-- a revisão de estudo (“enviar para análise do cliente”) cria uma tarefa na fila do setor
drop policy if exists ptarefas_incluir on projeto_tarefas;
create policy ptarefas_incluir on projeto_tarefas for insert to authenticated
  with check (is_equipe() and pode_ver_projeto(projeto_id));

-- ---------- Protocolos: órgãos variados e processos internos ----------
alter type protocolo_tipo add value if not exists 'receita_federal';
alter type protocolo_tipo add value if not exists 'cartorio';
alter type protocolo_tipo add value if not exists 'concessionaria';
alter type protocolo_tipo add value if not exists 'pausa_cliente';

-- ---------- Documentos por etapa ----------
delete from documento_modelos where etapa_codigo = '06';                               -- a etapa 06 não pede documentos: fotos e arquivos vão para o servidor (item do checklist)
update documento_modelos set nome = 'Atualização semanal ao cliente (mensagem sobre os estudos)'
  where etapa_codigo in ('10', '14') and nome = 'Mensagem sobre os estudos';
insert into documento_modelos (etapa_codigo, nome, padrao_arquivo, ordem)
  select 'P1', 'Termo de pausa assinado pelo cliente', 'TPA_CAXXXXXX', 1
  where exists (select 1 from etapa_modelos where codigo = 'P1')
    and not exists (select 1 from documento_modelos where etapa_codigo = 'P1' and nome = 'Termo de pausa assinado pelo cliente');
insert into documento_modelos (etapa_codigo, nome, padrao_arquivo, ordem)
  select 'P2', 'Termo de pausa assinado pelo cliente', 'TPA_CAXXXXXX', 1
  where exists (select 1 from etapa_modelos where codigo = 'P2')
    and not exists (select 1 from documento_modelos where etapa_codigo = 'P2' and nome = 'Termo de pausa assinado pelo cliente');

-- Protocolos revistos pelos arquitetos (etapas 03, 05, 06, 07, 09, 11, 13, 15, 18, 19). Projetos já criados mantêm as tarefas que têm.
do $$ declare nt uuid; begin
  delete from tarefa_modelos where etapa_codigo = '03' and variante = 'todas' and ordem = 1;
  insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('03', 'todas', 1, 'Apresentação do profissional no canal oficial do projeto', 'Substitui a avaliação interna: o profissional se apresenta ao cliente e confere o envio do briefing.', 'Média') returning id into nt;
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 1, 'Profissional se apresentou ao cliente no canal oficial do projeto');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 2, 'Conferido o envio do briefing ao cliente');
  delete from tarefa_modelos where etapa_codigo = '05' and variante = 'padrao' and ordem = 1;
  insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('05', 'padrao', 1, 'Reunião de briefing', null, 'Média') returning id into nt;
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 1, 'Análise do briefing preenchido pelo cliente');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 2, 'Gerar a ata para a reunião');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 3, 'Redigir a ata');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 4, 'Enviar a ata para assinatura do cliente');
  delete from tarefa_modelos where etapa_codigo = '05' and variante = 'ampliacao' and ordem = 2;
  insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('05', 'ampliacao', 2, 'Reunião de briefing', null, 'Média') returning id into nt;
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 1, 'Análise do briefing preenchido pelo cliente');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 2, 'Gerar a ata para a reunião');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 3, 'Redigir a ata');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 4, 'Enviar a ata para assinatura do cliente');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 5, 'Ata: dado aceite pelo cliente (registrar data e versão)');
  delete from tarefa_modelos where etapa_codigo = '05' and variante = 'mais_projetos' and ordem = 3;
  insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('05', 'mais_projetos', 3, 'Reunião de briefing', null, 'Média') returning id into nt;
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 1, 'Análise do briefing preenchido pelo cliente');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 2, 'Gerar a ata para a reunião');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 3, 'Redigir a ata');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 4, 'Enviar a ata para assinatura do cliente');
  delete from tarefa_modelos where etapa_codigo = '06' and variante = 'padrao' and ordem = 1;
  insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('06', 'padrao', 1, 'Aferição no terreno', null, 'Média') returning id into nt;
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 1, 'Salvar fotos e demais documentos no servidor');
  delete from tarefa_modelos where etapa_codigo = '06' and variante = 'mais_projetos' and ordem = 4;
  insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('06', 'mais_projetos', 4, 'Solicitação de fotos do terreno', null, 'Média') returning id into nt;
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 1, 'Salvar fotos e demais documentos no servidor');
  delete from tarefa_modelos where etapa_codigo = '07' and variante = 'padrao' and ordem = 2;
  insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('07', 'padrao', 2, 'Estudo layout', null, 'Média') returning id into nt;
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 1, 'Elaboração inicial (REVIN)');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 2, 'Revisão 01');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 3, 'Revisão 02');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 4, 'Aceite do cliente (registrar data e versão)');
  delete from tarefa_modelos where etapa_codigo = '07' and variante = 'ampliacao' and ordem = 3;
  insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('07', 'ampliacao', 3, 'Estudo layout', null, 'Média') returning id into nt;
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 1, 'Elaboração inicial (REVIN)');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 2, 'Revisão 01');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 3, 'Revisão 02');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 4, 'Aceite do cliente (registrar data e versão)');
  delete from tarefa_modelos where etapa_codigo = '07' and variante = 'mais_projetos' and ordem = 4;
  insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('07', 'mais_projetos', 4, 'Estudo preliminar: formatar croqui e fazer fachadas', null, 'Média') returning id into nt;
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 1, 'Elaboração inicial (REVIN)');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 2, 'Revisão 01');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 3, 'Revisão 02');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 4, 'Aceite do cliente (registrar data e versão)');
  delete from tarefa_modelos where etapa_codigo = '09' and variante = 'padrao' and ordem = 1;
  insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('09', 'padrao', 1, 'Reunião de apresentação de estudo inicial', null, 'Média') returning id into nt;
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 1, 'Impressão do PDF do estudo');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 2, 'Redigir a ata da reunião');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 3, 'Enviar a ata para assinatura');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 4, 'Enviar o estudo para aceite');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 5, 'Aceite dado pelo cliente (registrar data e versão)');
  delete from tarefa_modelos where etapa_codigo = '09' and variante = 'ampliacao' and ordem = 2;
  insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('09', 'ampliacao', 2, 'Reunião para apresentação do estudo inicial', null, 'Média') returning id into nt;
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 1, 'Impressão do PDF do estudo');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 2, 'Redigir a ata da reunião');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 3, 'Enviar a ata para assinatura');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 4, 'Enviar o estudo para aceite');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 5, 'Aceite dado pelo cliente (registrar data e versão)');
  delete from tarefa_modelos where etapa_codigo = '09' and variante = 'mais_projetos' and ordem = 3;
  insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('09', 'mais_projetos', 3, 'Reunião de apresentação de estudo preliminar', null, 'Média') returning id into nt;
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 1, 'Impressão do PDF do estudo');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 2, 'Redigir a ata da reunião');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 3, 'Enviar a ata para assinatura');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 4, 'Enviar o estudo para aceite');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 5, 'Aceite dado pelo cliente (registrar data e versão)');
  delete from tarefa_modelos where etapa_codigo = '11' and variante = 'padrao' and ordem = 1;
  insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('11', 'padrao', 1, 'Estudo fachada', null, 'Média') returning id into nt;
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 1, 'Elaboração inicial (REVIN)');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 2, 'Revisão 01');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 3, 'Revisão 02');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 4, 'Aceite do cliente (registrar data e versão)');
  delete from tarefa_modelos where etapa_codigo = '11' and variante = 'ampliacao' and ordem = 2;
  insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('11', 'ampliacao', 2, 'Estudo 3D', null, 'Média') returning id into nt;
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 1, 'Elaboração inicial (REVIN)');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 2, 'Revisão 01');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 3, 'Revisão 02');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 4, 'Aceite do cliente (registrar data e versão)');
  delete from tarefa_modelos where etapa_codigo = '13' and variante = 'padrao' and ordem = 1;
  insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('13', 'padrao', 1, 'Reunião de apresentação de estudo de fachada', null, 'Média') returning id into nt;
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 1, 'Preparação da sala de reunião');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 2, 'Redigir a ata da reunião');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 3, 'Enviar a ata para assinatura');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 4, 'Enviar o estudo para aceite');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 5, 'Aceite dado pelo cliente (registrar data e versão)');
  delete from tarefa_modelos where etapa_codigo = '13' and variante = 'ampliacao' and ordem = 2;
  insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('13', 'ampliacao', 2, 'Reunião de apresentação do estudo 3D', null, 'Média') returning id into nt;
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 1, 'Preparação da sala de reunião');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 2, 'Redigir a ata da reunião');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 3, 'Enviar a ata para assinatura');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 4, 'Enviar o estudo para aceite');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 5, 'Aceite dado pelo cliente (registrar data e versão)');
  delete from tarefa_modelos where etapa_codigo = '15' and variante = 'todas' and titulo = 'Coleta de dados complementares e procuração';
  insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('15', 'todas', 1, 'Coleta de dados complementares e procuração', 'Depois dos estudos aceitos: reúna os dados e a procuração antes de iniciar o projeto arquitetônico e o legal.', 'Alta') returning id into nt;
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 1, 'Documento de identidade com foto e CPF do cliente');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 2, 'Contrato de compra do lote');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 3, 'Capa do IPTU (se houver)');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 4, 'Comprovante de endereço');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 5, 'Matrícula do terreno (se houver)');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 6, 'Procuração assinada pelo cliente');
  delete from tarefa_modelos where etapa_codigo = '18' and variante = 'todas' and titulo = 'Detalhamentos de interiores';
  insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('18', 'todas', 1, 'Detalhamentos de interiores', 'Lista de detalhamentos possíveis; registre as horas em cada item.', 'Média') returning id into nt;
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 1, 'Detalhamento de marcenaria');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 2, 'Detalhamento de marmoraria');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 3, 'Paginação de pisos e revestimentos');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 4, 'Forro de gesso e iluminação');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 5, 'Detalhamento de esquadrias');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 6, 'Detalhamento de espelhos');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 7, 'Lista de móveis soltos');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 8, 'Detalhamento de cortinas e persianas');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 9, 'Detalhamento de bancadas e cubas');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 10, 'Detalhamento de mobiliário especial');
  delete from tarefa_modelos where etapa_codigo = '19' and variante = 'todas' and titulo = 'Definir quem elabora os projetos complementares';
  insert into tarefa_modelos (etapa_codigo, variante, ordem, titulo, descricao, prioridade) values ('19', 'todas', 0, 'Definir quem elabora os projetos complementares', null, 'Alta') returning id into nt;
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 1, 'Escolher o parceiro de cada complementar (elétrico, hidrossanitário, estrutural…)');
  insert into tarefa_item_modelos (tarefa_id, ordem, texto) values (nt, 2, 'Registrar o parceiro e as horas de compatibilização');
end $$;
