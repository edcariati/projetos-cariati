-- Setor Financeiro: acompanha todos os projetos (só leitura, a menos que seja responsável), sem acesso a tempos nem banco de horas.
alter type setor add value if not exists 'financeiro';

-- Comparação por texto: o valor novo do enum só pode ser usado depois que esta transação terminar
create or replace function pode_ver_projeto(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from projetos pr where pr.id = p and (
      is_admin()
      or (is_equipe() and (
            pr.responsavel_id = auth.uid()
            or exists (select 1 from projeto_equipe e where e.projeto_id = pr.id and e.usuario_id = auth.uid())
            or (select setor::text from profiles where id = auth.uid()) in ('administrativo','comercial','financeiro')))
      or pr.cliente_id = meu_cliente()
    )
  )
$$;
