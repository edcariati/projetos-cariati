-- Horas estimadas: base para comparar previsto × realizado por projeto, etapa e pessoa (Gestão de horas).
-- Cada etapa tem uma estimativa padrão (editável); cada projeto pode ter a própria estimativa. Sem a do projeto, vale a soma das etapas que se aplicam a ele.
alter table etapa_modelos add column horas_padrao numeric(6,1) not null default 0 check (horas_padrao >= 0);
alter table projetos add column horas_estimadas numeric(8,1) check (horas_estimadas is null or horas_estimadas >= 0);

update etapa_modelos m set horas_padrao = v.h
  from (values ('01',3),('02',0.5),('03',0.5),('04',0.3),('05',2),('06',4),('07',16),('08',0.3),('09',3),('10',0.5),('11',10),('12',0.3),('13',3),('14',0.5),
               ('15',60),('16',24),('17',30),('18',30),('19',20),('20',2),('21',0.3),('22',3),('23',2),('24',0.5),('H1',6),('H2',6),('H3',2)) as v(c, h)
 where m.codigo = v.c;
