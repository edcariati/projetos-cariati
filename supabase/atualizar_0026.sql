-- Tira a Avaliação interna da etapa 19 (0026). Para o banco que já tem as migrations até a 0025. Rode uma única vez.

-- A "Avaliação interna" existe só nas etapas de projeto arquitetônico e de projeto legal: sai da etapa 19 (complementares).
delete from tarefa_modelos where etapa_codigo = '19' and titulo = 'Avaliação interna';
-- projetos já criados: remove a tarefa só onde ela ainda não foi marcada como feita
delete from projeto_tarefas t
 where t.etapa_codigo = '19' and t.titulo = 'Avaliação interna'
   and not exists (select 1 from projeto_tarefa_itens i where i.tarefa_id = t.id and i.feito);
