-- Mostra o que já está instalado no banco. Cole no SQL Editor, rode e me mande o resultado.
select
  (select count(*) from etapa_modelos)                                              as etapas_modelo,
  to_regclass('public.tempos') is not null                                          as tem_0006_tempos,
  exists (select 1 from information_schema.columns where table_name='profiles' and column_name='perfil') as tem_0007_acessos,
  to_regclass('public.banco_horas_ajustes') is not null                             as tem_0008_banco_horas,
  to_regclass('public.tarefa_modelos') is not null                                  as tem_0009_protocolos,
  (select count(*) from etapa_modelos where codigo in ('H1','H2','H3')) = 3         as tem_0010_habitese,
  exists (select 1 from information_schema.columns where table_name='projeto_tarefas' and column_name='responsavel_id') as tem_0011_provisionamento,
  case when to_regclass('public.tarefa_modelos') is null then false
       else (xpath('/row/c/text()', query_to_xml('select count(*) > 0 as c from tarefa_modelos where etapa_codigo = ''24''', false, true, '')))[1]::text::boolean end as tem_0012_finalizacao,
  exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='setor' and e.enumlabel='financeiro') as tem_0013_financeiro,
  exists (select 1 from information_schema.columns where table_name='projetos' and column_name='horas_estimadas') as tem_0014_horas_estimadas,
  (select count(*) from auth.users where email like '%@cariati.com.br')             as usuarios_cariati;
