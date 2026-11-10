-- Projeto de Pontos Técnicos no catálogo (0027). Para o banco que já tem as migrations até a 0026. Rode uma única vez.

-- Catálogo: Projeto de Pontos Técnicos (pontos elétricos e pontos hidráulicos), feito pelo escritório e entregue junto dos complementares (etapa 19).
do $$
begin
  if not exists (select 1 from servico_categorias where id = 'pontos') then
    update servico_categorias set ordem = ordem + 1 where ordem >= 7;   -- encaixa logo depois de Reuso de Água
    insert into servico_categorias (id, nome, etapas, ordem, execucao) values ('pontos', 'Projeto de Pontos Técnicos', array['19']::text[], 7, 'escritorio');
  end if;
end $$;
insert into servico_itens (id, categoria_id, nome, ordem) values
  ('pontos-01', 'pontos', 'Projeto de Pontos Elétricos', 1),
  ('pontos-02', 'pontos', 'Projeto de Pontos Hidráulicos', 2)
on conflict (id) do nothing;
