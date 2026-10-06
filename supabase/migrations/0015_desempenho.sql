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
