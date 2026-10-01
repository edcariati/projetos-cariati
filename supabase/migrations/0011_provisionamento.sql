-- Provisionamento: ao abrir o projeto, as tarefas de cada protocolo já nascem atribuídas a quem faz.
-- Regra: etapa do Setor de Projetos -> profissional da especialidade na equipe (arquitetônico, legal, interiores,
-- complementares) ou, na falta dele, o responsável pelo projeto. Etapa do Administrativo/Comercial -> fila do setor.

alter table projeto_tarefas
  add column responsavel_id uuid references profiles(id) on delete set null,
  add column setor_fila setor,
  add column atribuicao_manual boolean not null default false;
create index on projeto_tarefas(responsavel_id);
create index on projeto_tarefas(setor_fila) where responsavel_id is null;

-- setor que cuida da etapa (primeiro setor da lista, sem contar terceiros)
create or replace function fila_etapa(p_etapa text) returns setor language sql stable as $$
  select u.s from etapa_modelos m, unnest(m.setores) with ordinality as u(s, n)
  where m.codigo = p_etapa and u.s <> 'terceiros' order by u.n limit 1
$$;

-- profissional que faz a tarefa (nulo = fila do setor)
create or replace function responsavel_etapa(p_projeto uuid, p_etapa text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare esp text; r uuid;
begin
  if fila_etapa(p_etapa) is distinct from 'projetos' then return null; end if;
  esp := case when p_etapa = '15' then 'arquitetonico'
              when p_etapa in ('16','H1','H2','H3') then 'legal'
              when p_etapa in ('17','18') then 'interiores'
              when p_etapa = '19' then 'complementares' end;
  if esp is not null then
    select usuario_id into r from projeto_equipe where projeto_id = p_projeto and especialidade = esp order by id limit 1;
    if r is not null then return r; end if;
  end if;
  select responsavel_id into r from projetos where id = p_projeto;
  return r;
end $$;

-- cópia das tarefas para o projeto, já com a atribuição
create or replace function inserir_tarefas(p_projeto uuid, p_etapa text, p_variantes text[]) returns int
language plpgsql security definer set search_path = public as $$
declare t record; nt uuid; n int := 0;
begin
  if exists (select 1 from projeto_tarefas where projeto_id = p_projeto and etapa_codigo = p_etapa) then return 0; end if;
  for t in select * from tarefa_modelos where etapa_codigo = p_etapa and variante = any (p_variantes) order by ordem loop
    insert into projeto_tarefas (projeto_id, etapa_codigo, modelo_id, ordem, titulo, descricao, prioridade, responsavel_id, setor_fila)
    values (p_projeto, p_etapa, t.id, t.ordem, t.titulo, t.descricao, t.prioridade,
            responsavel_etapa(p_projeto, p_etapa), fila_etapa(p_etapa)) returning id into nt;
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

-- reatribui quando muda o responsável ou a equipe (tarefas já iniciadas ou atribuídas à mão não mudam)
create or replace function atribuir_tarefas(p_projeto uuid) returns void
language sql security definer set search_path = public as $$
  update projeto_tarefas t set responsavel_id = responsavel_etapa(t.projeto_id, t.etapa_codigo)
   where t.projeto_id = p_projeto and not t.atribuicao_manual
     and not exists (select 1 from projeto_tarefa_itens i where i.tarefa_id = t.id and i.feito)
$$;
revoke execute on function atribuir_tarefas(uuid) from public, anon, authenticated;
revoke execute on function responsavel_etapa(uuid, text) from public, anon, authenticated;

create or replace function reatribuir_por_projeto() returns trigger language plpgsql security definer set search_path = public as $$
begin perform atribuir_tarefas(new.id); return new; end $$;
create trigger projetos_reatribuir after update of responsavel_id on projetos
  for each row when (old.responsavel_id is distinct from new.responsavel_id) execute function reatribuir_por_projeto();

create or replace function reatribuir_por_equipe() returns trigger language plpgsql security definer set search_path = public as $$
begin perform atribuir_tarefas(coalesce(new.projeto_id, old.projeto_id)); return coalesce(new, old); end $$;
create trigger equipe_reatribuir after insert or update or delete on projeto_equipe
  for each row execute function reatribuir_por_equipe();

-- a equipe pode reatribuir uma tarefa ("assumir", "passar para"); o resto da tarefa fica protegido
create policy ptarefas_editar on projeto_tarefas for update to authenticated
  using (is_equipe() and pode_ver_projeto(projeto_id)) with check (is_equipe() and pode_ver_projeto(projeto_id));
create or replace function proteger_tarefa() returns trigger language plpgsql as $$
begin
  new.projeto_id := old.projeto_id; new.etapa_codigo := old.etapa_codigo; new.modelo_id := old.modelo_id;
  new.ordem := old.ordem; new.titulo := old.titulo; new.descricao := old.descricao;
  new.prioridade := old.prioridade; new.setor_fila := old.setor_fila;
  return new;
end $$;
create trigger tarefas_proteger before update on projeto_tarefas for each row execute function proteger_tarefa();

-- projetos que já existiam: atribui as tarefas
update projeto_tarefas t set responsavel_id = responsavel_etapa(t.projeto_id, t.etapa_codigo), setor_fila = fila_etapa(t.etapa_codigo);
