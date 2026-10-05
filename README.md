# Projetos Cariati

Aplicativo do Setor de Projetos: acompanha cada cliente pelo fluxo oficial (24 etapas + pausa/retomada)
e controla os protocolos (Prefeitura, condomínio e outros órgãos). Funciona no computador e no celular
(instalável na tela inicial) e guarda tudo no Supabase.

## Como colocar para rodar

1. Crie um projeto em <https://supabase.com>.
2. No **SQL Editor**, cole e execute `supabase/instalar_tudo.sql` (reúne os arquivos `0001` a `0013` de `supabase/migrations/`)
   (ou use `supabase db push` com a CLI).
3. Em **Authentication → Providers → Email**, desative "Allow new users to sign up" e crie os usuários da
   equipe em **Authentication → Users**. Para tornar alguém admin:
   `update profiles set perfil = 'admin' where id = (select id from auth.users where email = 'SEU-EMAIL');`
   (rode no SQL Editor do Supabase; é assim que nasce o primeiro administrador).
4. `cp .env.example .env` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (Settings → API).
5. `npm install && npm run dev`. Para publicar: `npm run build` (pasta `dist`, ex.: Vercel).

## Ver o app sem Supabase (modo demonstração)

`VITE_DEMO=1 npm run dev` abre o app com 5 projetos de exemplo (nada é salvo e nenhum banco é usado). Na barra superior dá para "ver como" administrador, profissional, administrativo ou cliente.

## O que já existe

- **Painel**: projetos por fase, protocolos com exigência ou prazo em até 3 dias, pausas perto dos 180 dias.
- **Projetos**: cadastro com escopo (legal, interiores, complementares). As etapas são criadas conforme o
  escopo; as não contratadas ficam ocultas.
- **Fluxo por etapa**: entra/sai/regra, concluir (avança para a próxima aplicável), reabrir, rodadas de ajuste
  (limite de 3, alerta de custo adicional), aceites formais, pausa, retomada e rescisão (180 dias).
- **Protocolos**: tipo (Prefeitura, condomínio, outro órgão ou entrega ao cliente), órgão, número, status, data, próximo prazo, cliente notificado e andamentos.
- **Documentos por etapa**: modelos exigidos em cada etapa, com código de arquivo padronizado (`CAXXXXXX` vira o código do cliente) e anexo no Supabase Storage (bucket privado `documentos`).
- **Cronômetro por etapa**: iniciar/parar na etapa em andamento (rodando no banco, com hora do servidor), faixa fixa com o tempo em curso, parada automática ao concluir a etapa ou pausar o projeto. A aba **Tempos** mostra média, mínimo e máximo por etapa; as views `tempo_etapa_projeto` e `tempo_medio_etapa` servem para análise externa.
- **Fluxo**: o fluxograma do setor (mapa, etapas, regras e índice de documentos) para consulta.
- **Acessos por perfil** (`0007_acessos.sql`), aplicados no próprio banco (RLS), não só na tela:
  - **Administrador**: vê e gerencia tudo, inclusive os tempos de todos e a tela **Equipe** (perfil, setor, especialidades, vínculo de cliente, ativar/desativar).
  - **Profissional**: vê os projetos em que é responsável ou está na equipe (por especialidade); quem é do setor Administrativo ou Comercial vê todos. Só age nas etapas do próprio setor, nos projetos em que é responsável ou como administrador. Vê só os próprios tempos.
  - **Cliente**: portal próprio com andamento das etapas, protocolos e entregas, documentos que o escritório liberar e um fluxo explicativo. Nunca vê histórico interno, tempos, regras internas nem documentos não liberados.
- **Banco de horas** (`0008_banco_horas.sql`), para o administrador e o setor Administrativo: horas trabalhadas (cronômetro) × horas previstas (carga semanal de cada pessoa ÷ 5 × dias úteis encerrados) + lançamentos manuais (hora extra, folga, feriado abonado) = saldo, por período, pessoa e projeto, com dia a dia e exportação em CSV. A carga semanal se define na tela Equipe. A view `banco_horas_dia` serve para análise externa.
- **Protocolo de tarefas por etapa** (`0009_protocolos_etapas.sql`, a partir dos modelos do Vobi): cada etapa traz suas tarefas e checklists (47 tarefas, 110 itens), marcáveis em cada projeto, com registro automático de quem marcou e quando. Concluir uma etapa com itens pendentes pede confirmação.
- **Acessos e senhas:** cada pessoa entra com e-mail e senha (Supabase Auth). A tela **Minha conta** (clique no nome, no topo) troca a senha. O setor **Financeiro** (`0013`) acompanha todos os projetos sem agir neles, sem acesso a tempos nem banco de horas.
- **Visão geral** (início do administrador): indicadores e gráficos de gestão com filtro de período (30 dias a 12 meses) e de responsável: carteira, entradas e saídas, horas × carga contratada, etapas atrasadas (frente ao prazo de referência: mediana da equipe ou padrão em `src/lib/kpis.ts`), horas por profissional e por etapa, intensidade de trabalho, tarefas concluídas, protocolos, pausas e uma leitura rápida em texto. Cada gráfico tem tabela alternativa. Não precisa de migration.
- **Complementares e Finalização** (`0012_complementares_finalizacao.sql`, protocolos 04 e 05): 11 tarefas na etapa 19 (IFC, pontos técnicos, compatibilização, entrega e impressão) e as tarefas de entrega e encerramento das etapas 21 a 24.
- **Habite-se** (`0010_habitese.sql`, protocolo 02): serviço opcional em paralelo ao fluxo (etapas H1 documentos, H2 entrada na Prefeitura, H3 entrega dos documentos aprovados), com 8 tarefas e checklists. Pode ser contratado na criação do projeto ou iniciado depois (reabre um projeto finalizado).
- **Provisionamento** (`0011_provisionamento.sql`): as tarefas dos protocolos são criadas e atribuídas automaticamente ao entrar na etapa: ao profissional da especialidade (equipe) ou ao responsável do projeto e, nas etapas de agendamento/Administrativo, à fila do setor (qualquer pessoa do setor pode assumir). A tela **Minhas tarefas** mostra o que está agora e o que vem a seguir; o administrador pode reatribuir manualmente.
  - **Tipo de estudo preliminar**: padrão, ampliação (a fachada vira estudo 3D) ou + projetos (fachada junto com a planta; etapas 11 a 14 não se aplicam). Cliente categoria C ou D sugere "+ projetos".
  - **Pausa e retomada**: ao pausar escolhe-se o motivo (a pedido do cliente ou falta de retorno, com 3 tentativas de contato); o checklist do protocolo abre sozinho, assim como o de retomada (termo conforme o tipo de pausa) e o de rescisão.
  - Os modelos ficam em `tarefa_modelos` e `tarefa_item_modelos`, editáveis pelo administrador.
- **Histórico** rastreável por projeto.

## Estrutura de dados (Supabase)

`profiles`, `clientes`, `etapa_modelos` (o fluxo, editável sem mexer no código), `projetos`, `projeto_etapas`,
`historico`, `protocolos`, `protocolo_andamentos`, `documento_modelos`, `projeto_documentos`, `tempos`, `projeto_equipe`, `banco_horas_ajustes`, `tarefa_modelos`, `tarefa_item_modelos`, `projeto_tarefas`, `projeto_tarefa_itens`. Todas com RLS: só usuários logados acessam; excluir é só
para admin. Novos módulos entram como novas migrations em `supabase/migrations/`.

## Próximos passos sugeridos

Notificações de prazo, permissões por setor e integração com o WhatsApp.
