/** Protocolo de tarefas por etapa (gerado a partir dos modelos do Vobi). Mesma fonte da migration 0009. */
export interface TarefaModelo { etapa: string; variante: string; ordem: number; titulo: string; descricao: string | null; prioridade: 'Alta' | 'Média' | 'Baixa'; itens: string[] }
export const TAREFAS: TarefaModelo[] = [
 {
  "etapa": "01",
  "variante": "todas",
  "ordem": 1,
  "titulo": "Coleta de dados inicial",
  "descricao": null,
  "prioridade": "Média",
  "itens": [
   "Intenção de projeto (residencial, comercial, institucional etc.)",
   "Metragem aproximada",
   "Nome completo",
   "Telefone",
   "E-mail",
   "Endereço atual",
   "Endereço da obra",
   "Lote",
   "Quadra"
  ]
 },
 {
  "etapa": "01",
  "variante": "todas",
  "ordem": 2,
  "titulo": "Realizar cadastro do cliente no Vobi",
  "descricao": null,
  "prioridade": "Média",
  "itens": []
 },
 {
  "etapa": "01",
  "variante": "todas",
  "ordem": 3,
  "titulo": "Agendamento da reunião de apresentação do escritório",
  "descricao": null,
  "prioridade": "Média",
  "itens": [
   "Marcar reunião com cliente",
   "Inserir reunião no sistema e notificar responsável"
  ]
 },
 {
  "etapa": "01",
  "variante": "todas",
  "ordem": 4,
  "titulo": "Reunião de apresentação do escritório",
  "descricao": null,
  "prioridade": "Alta",
  "itens": [
   "Preenchimento de ata",
   "Anexar ata de reunião no Vobi"
  ]
 },
 {
  "etapa": "01",
  "variante": "todas",
  "ordem": 5,
  "titulo": "Agendamento da reunião de apresentação de proposta",
  "descricao": null,
  "prioridade": "Média",
  "itens": [
   "Marcar reunião com cliente",
   "Inserir reunião no sistema e notificar responsável"
  ]
 },
 {
  "etapa": "01",
  "variante": "todas",
  "ordem": 6,
  "titulo": "Reunião de apresentação de proposta",
  "descricao": null,
  "prioridade": "Alta",
  "itens": [
   "Elaboração da ata da reunião",
   "Enviar ata para o aceite do cliente",
   "Ata: dado aceite pelo cliente"
  ]
 },
 {
  "etapa": "01",
  "variante": "todas",
  "ordem": 7,
  "titulo": "Coleta de dados complementares",
  "descricao": null,
  "prioridade": "Média",
  "itens": [
   "IPTU",
   "Documento de identidade com foto, contendo CPF",
   "Estado civil",
   "Nacionalidade",
   "Profissão",
   "Matrícula/certidão (se disponível)",
   "Fotos do terreno",
   "Inscrição municipal/IPTU (se disponível)",
   "Obra financiada (sim ou não)",
   "Caso empresa: CNPJ",
   "Caso empresa: razão social",
   "Caso empresa: contrato social (constando o responsável que irá assinar)"
  ]
 },
 {
  "etapa": "01",
  "variante": "todas",
  "ordem": 8,
  "titulo": "Abastecimento de informações na database",
  "descricao": null,
  "prioridade": "Média",
  "itens": []
 },
 {
  "etapa": "01",
  "variante": "todas",
  "ordem": 9,
  "titulo": "Contrato de prestação de serviço",
  "descricao": null,
  "prioridade": "Alta",
  "itens": [
   "Preenchimento do contrato",
   "Envio do contrato",
   "Recebimento do contrato assinado"
  ]
 },
 {
  "etapa": "01",
  "variante": "todas",
  "ordem": 10,
  "titulo": "Promover oportunidade para projeto",
  "descricao": "Etiquetas: o número representa a ordem em que a informação aparece no projeto: 00 Premium, 0 Diretor, Adm/Finanças, Colaborador, 1 Tipo de projeto, 2 Complemento, 3 Tipo de maquete (se houver).",
  "prioridade": "Baixa",
  "itens": [
   "Concluir a oportunidade e aplicar os demais templates para projeto",
   "Verificar com o diretor qual o colaborador responsável pelo início do projeto",
   "Aplicar a etiqueta de equipe de acordo com os colaboradores responsáveis",
   "Aplicar as etiquetas ao projeto de acordo com os serviços do contrato"
  ]
 },
 {
  "etapa": "03",
  "variante": "todas",
  "ordem": 1,
  "titulo": "Avaliação interna",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": []
 },
 {
  "etapa": "03",
  "variante": "mais_projetos",
  "ordem": 2,
  "titulo": "Análise do dossiê do comercial",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": []
 },
 {
  "etapa": "03",
  "variante": "todas",
  "ordem": 3,
  "titulo": "Envio do briefing ao cliente",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": [
   "Envio ao cliente",
   "Preenchido pelo cliente"
  ]
 },
 {
  "etapa": "04",
  "variante": "todas",
  "ordem": 1,
  "titulo": "Agendar reunião de briefing",
  "descricao": "Agendar a reunião apenas após o recebimento do briefing pelo cliente.",
  "prioridade": "Baixa",
  "itens": [
   "Marcar reunião com cliente",
   "Inserir reunião no sistema e notificar responsável"
  ]
 },
 {
  "etapa": "05",
  "variante": "padrao",
  "ordem": 1,
  "titulo": "Reunião de briefing",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": [
   "Preenchimento de ata",
   "Anexar ata de reunião no Vobi",
   "Enviar ata de reunião ao cliente"
  ]
 },
 {
  "etapa": "05",
  "variante": "ampliacao",
  "ordem": 2,
  "titulo": "Reunião de briefing",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": [
   "Preenchimento de ata",
   "Enviar ata de reunião ao cliente",
   "Ata: dado aceite pelo cliente"
  ]
 },
 {
  "etapa": "05",
  "variante": "mais_projetos",
  "ordem": 3,
  "titulo": "Reunião de briefing",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": [
   "Preenchimento de ata",
   "Anexar ata de reunião no Vobi",
   "Enviar ata de reunião ao cliente"
  ]
 },
 {
  "etapa": "06",
  "variante": "padrao",
  "ordem": 1,
  "titulo": "Aferição no terreno",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": []
 },
 {
  "etapa": "06",
  "variante": "ampliacao",
  "ordem": 2,
  "titulo": "Aferição no espaço alvo da ampliação",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": [
   "Salvar imagens da aferição no servidor"
  ]
 },
 {
  "etapa": "06",
  "variante": "ampliacao",
  "ordem": 3,
  "titulo": "Passar aferição a limpo",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": []
 },
 {
  "etapa": "06",
  "variante": "mais_projetos",
  "ordem": 4,
  "titulo": "Solicitação de fotos do terreno",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": []
 },
 {
  "etapa": "07",
  "variante": "todas",
  "ordem": 1,
  "titulo": "Análise de zoneamento e das informações do comercial",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": []
 },
 {
  "etapa": "07",
  "variante": "padrao",
  "ordem": 2,
  "titulo": "Estudo layout",
  "descricao": "Informar a data que começou o estudo inicial e das revisões que foram solicitadas. Dar como finalizada essa etapa apenas quando houver o aceite do cliente.",
  "prioridade": "Baixa",
  "itens": [
   "Elaboração inicial (REVIN)",
   "Revisão 01",
   "Revisão 02"
  ]
 },
 {
  "etapa": "07",
  "variante": "ampliacao",
  "ordem": 3,
  "titulo": "Estudo layout",
  "descricao": "Informar a data que começou o estudo inicial e das revisões que foram solicitadas. Dar como finalizada essa etapa apenas quando houver o aceite do cliente.",
  "prioridade": "Baixa",
  "itens": [
   "Elaboração inicial (REVIN)",
   "Revisão 01",
   "Revisão 02"
  ]
 },
 {
  "etapa": "07",
  "variante": "mais_projetos",
  "ordem": 4,
  "titulo": "Estudo preliminar: formatar croqui e fazer fachadas",
  "descricao": "Informar a data que começou o estudo inicial e das revisões que foram solicitadas. Dar como finalizada essa etapa apenas quando houver o aceite do cliente.",
  "prioridade": "Baixa",
  "itens": [
   "Elaboração inicial (REVIN)",
   "Revisão 01",
   "Revisão 02"
  ]
 },
 {
  "etapa": "08",
  "variante": "padrao",
  "ordem": 1,
  "titulo": "Agendar reunião de apresentação de estudo inicial",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": [
   "Marcar reunião com cliente",
   "Inserir reunião no sistema e notificar responsável"
  ]
 },
 {
  "etapa": "08",
  "variante": "ampliacao",
  "ordem": 2,
  "titulo": "Agendar reunião inicial para apresentação do estudo inicial",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": [
   "Marcar reunião com cliente",
   "Inserir reunião no sistema e notificar responsável"
  ]
 },
 {
  "etapa": "08",
  "variante": "mais_projetos",
  "ordem": 3,
  "titulo": "Agendar reunião de apresentação de estudo preliminar",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": [
   "Marcar reunião com cliente",
   "Inserir reunião no sistema e notificar responsável"
  ]
 },
 {
  "etapa": "09",
  "variante": "padrao",
  "ordem": 1,
  "titulo": "Reunião de apresentação de estudo inicial",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": [
   "Preenchimento de ata",
   "Enviar ata de reunião ao cliente",
   "Enviar projeto para aceite",
   "Enviar ata para aceite",
   "Ata e projeto: dado aceite pelo cliente"
  ]
 },
 {
  "etapa": "09",
  "variante": "ampliacao",
  "ordem": 2,
  "titulo": "Reunião para apresentação do estudo inicial",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": [
   "Preenchimento de ata",
   "Enviar ata de reunião ao cliente",
   "Ata: dado aceite pelo cliente"
  ]
 },
 {
  "etapa": "09",
  "variante": "mais_projetos",
  "ordem": 3,
  "titulo": "Reunião de apresentação de estudo preliminar",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": [
   "Preenchimento de ata",
   "Enviar ata de reunião ao cliente",
   "Enviar projeto para aceite",
   "Enviar ata para aceite",
   "Ata e projeto: dado aceite pelo cliente"
  ]
 },
 {
  "etapa": "11",
  "variante": "padrao",
  "ordem": 1,
  "titulo": "Estudo fachada",
  "descricao": "Informar a data que começou o estudo inicial e das revisões que foram solicitadas. Dar como finalizada essa etapa apenas quando houver o aceite do cliente.",
  "prioridade": "Baixa",
  "itens": [
   "Elaboração inicial (REVIN)",
   "Revisão 01",
   "Revisão 02",
   "Aceite dado pelo cliente"
  ]
 },
 {
  "etapa": "11",
  "variante": "ampliacao",
  "ordem": 2,
  "titulo": "Estudo 3D",
  "descricao": "Informar a data que começou o estudo inicial e das revisões que foram solicitadas. Dar como finalizada essa etapa apenas quando houver o aceite do cliente.",
  "prioridade": "Baixa",
  "itens": [
   "Elaboração inicial (REVIN)",
   "Revisão 01",
   "Revisão 02",
   "Aceite dado pelo cliente"
  ]
 },
 {
  "etapa": "12",
  "variante": "padrao",
  "ordem": 1,
  "titulo": "Agendar reunião de apresentação",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": [
   "Marcar reunião com cliente"
  ]
 },
 {
  "etapa": "12",
  "variante": "ampliacao",
  "ordem": 2,
  "titulo": "Agendar reunião de apresentação do estudo 3D",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": []
 },
 {
  "etapa": "13",
  "variante": "padrao",
  "ordem": 1,
  "titulo": "Reunião de apresentação de estudo de fachada",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": [
   "Preenchimento de ata",
   "Enviar ata de reunião ao cliente",
   "Enviar projeto para aceite",
   "Ata e projeto: dado aceite pelo cliente"
  ]
 },
 {
  "etapa": "13",
  "variante": "ampliacao",
  "ordem": 2,
  "titulo": "Reunião de apresentação do estudo 3D",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": [
   "Preenchimento de ata",
   "Enviar ata de reunião ao cliente",
   "Enviar projeto para aceite",
   "Ata e projeto: dado aceite pelo cliente"
  ]
 },
 {
  "etapa": "P1",
  "variante": "todas",
  "ordem": 1,
  "titulo": "Solicitado pausa pelo cliente",
  "descricao": "Caso o cliente venha a solicitar a pausa do projeto, deverá ser enviado o TERMO DE SOLICITAÇÃO PAUSA DE PROJETO.",
  "prioridade": "Baixa",
  "itens": [
   "Cliente solicitou pausa do projeto",
   "Emissão do termo de pausa e envio para o cliente",
   "Termo assinado"
  ]
 },
 {
  "etapa": "P2",
  "variante": "todas",
  "ordem": 1,
  "titulo": "1ª tentativa de contato (semana 01)",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": []
 },
 {
  "etapa": "P2",
  "variante": "todas",
  "ordem": 2,
  "titulo": "2ª tentativa de contato (semana 02)",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": []
 },
 {
  "etapa": "P2",
  "variante": "todas",
  "ordem": 3,
  "titulo": "3ª tentativa de contato (semana 03)",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": []
 },
 {
  "etapa": "P2",
  "variante": "todas",
  "ordem": 4,
  "titulo": "Notificação por e-mail da pausa de projeto",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": []
 },
 {
  "etapa": "P2",
  "variante": "todas",
  "ordem": 5,
  "titulo": "Solicitado pausa pelo cliente",
  "descricao": "Caso o cliente retorne após as tentativas de contato solicitando a pausa do projeto, deverá ser enviado o TERMO DE SOLICITAÇÃO PAUSA DE PROJETO.",
  "prioridade": "Baixa",
  "itens": [
   "Cliente solicitou pausa do projeto",
   "Emissão do termo de pausa e envio para o cliente",
   "Termo assinado"
  ]
 },
 {
  "etapa": "P3",
  "variante": "apos_solicitacao",
  "ordem": 1,
  "titulo": "Retomada do projeto após pausa",
  "descricao": "Quando o cliente entrar em contato solicitando a retomada, deverá ser enviado o TERMO DE SOLICITAÇÃO DE RETOMADA DE PROJETO APÓS SOLICITAÇÃO DE PAUSA.",
  "prioridade": "Baixa",
  "itens": [
   "Emissão do termo e envio ao cliente",
   "Termo assinado pelo cliente"
  ]
 },
 {
  "etapa": "P3",
  "variante": "apos_ausencia",
  "ordem": 2,
  "titulo": "Retomada do projeto após pausa",
  "descricao": "Quando o cliente entrar em contato solicitando a retomada, deverá ser enviado o TERMO DE SOLICITAÇÃO DE RETOMADA DE PROJETO APÓS PAUSA POR AUSÊNCIA DE RETORNO.",
  "prioridade": "Baixa",
  "itens": [
   "Emissão do termo e envio ao cliente",
   "Termo assinado pelo cliente"
  ]
 },
 {
  "etapa": "P3",
  "variante": "todas",
  "ordem": 3,
  "titulo": "Aditivo de retomada",
  "descricao": "Do fluxo do setor: com a retomada, as informações do projeto são reanalisadas e replanejadas antes de seguir.",
  "prioridade": "Baixa",
  "itens": [
   "Conferir a etapa em que o projeto parou",
   "Emissão do aditivo e envio ao cliente",
   "Aditivo assinado pelo cliente"
  ]
 },
 {
  "etapa": "P4",
  "variante": "todas",
  "ordem": 1,
  "titulo": "Rescisão por ausência de retomada",
  "descricao": "Do fluxo do setor: passados 180 dias de pausa sem pedido de retomada.",
  "prioridade": "Baixa",
  "itens": [
   "Enviar o termo de rescisão no 181º dia"
  ]
 },
 {
  "etapa": "H1",
  "variante": "todas",
  "ordem": 1,
  "titulo": "Solicitação e emissão de documentos",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": [
   "Termo de Habite-se (análise simplificada)",
   "Declaração de veracidade",
   "Alvará de construção",
   "Ficha cadastral com histórico",
   "Certidão de registro de imóveis (matrícula) atualizada",
   "Procuração assinada pelo responsável e proprietário",
   "Documento de identidade do proprietário",
   "E-mail do proprietário",
   "Telefone do proprietário"
  ]
 },
 {
  "etapa": "H1",
  "variante": "todas",
  "ordem": 2,
  "titulo": "Notas fiscais e declarações",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": [
   "Notas fiscais de madeira ou estrutura metálica",
   "Declaração de origem florestal",
   "Notas fiscais de caçamba (CTRs)",
   "Declaração de CTR (quando houver a dispensa do uso de transporte e controle de resíduos ou não houver nota fiscal)"
  ]
 },
 {
  "etapa": "H1",
  "variante": "todas",
  "ordem": 3,
  "titulo": "PGRCC aprovado (quando necessário: acima de 300 m²)",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": []
 },
 {
  "etapa": "H1",
  "variante": "todas",
  "ordem": 4,
  "titulo": "AVCB (quando comercial enquadrado nesta exigência)",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": []
 },
 {
  "etapa": "H1",
  "variante": "todas",
  "ordem": 5,
  "titulo": "Relatório fotográfico",
  "descricao": "As fotos devem enquadrar da melhor forma possível a totalidade da construção, sempre valorizando o posicionamento para melhor visualizar os afastamentos entre a construção e a divisa do lote e a presença de elementos importantes, como, por exemplo, a calçada e os acessos na foto da fachada.",
  "prioridade": "Baixa",
  "itens": [
   "Foto da fachada (frente)",
   "Foto do recuo frontal",
   "Foto do recuo lateral esquerdo",
   "Foto do recuo lateral direito",
   "Foto do recuo posterior (fundos)",
   "Foto das áreas livres (poço de luz), quando houver"
  ]
 },
 {
  "etapa": "H2",
  "variante": "todas",
  "ordem": 1,
  "titulo": "Entrada do processo na Prefeitura",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": [
   "Selecionar a modalidade Habite-se no Aprova Digital e seguir os passos para a situação da solicitação (nova, 2ª via, retificação, planta vistada)",
   "Anexar os documentos adquiridos ou emitidos nas etapas anteriores em seus devidos campos",
   "Preencher os dados do proprietário com as informações coletadas",
   "Preencher o campo 9 (áreas licenciadas) com as metragens do terreno e das edificações, de acordo com o projeto e o alvará de construção",
   "Preencher o campo 11 (quadro de compartimentos) com as informações do projeto, do alvará de construção e/ou do termo de compromisso, separados por pavimento",
   "Encaminhar a taxa do Habite-se (guia eventual) para o financeiro",
   "Anexar o comprovante de pagamento da guia eventual no Aprova Digital",
   "Encaminhar a taxa de ISS para o financeiro",
   "Anexar o comprovante de pagamento do ISS no Aprova Digital",
   "Processo deferido"
  ]
 },
 {
  "etapa": "H3",
  "variante": "todas",
  "ordem": 1,
  "titulo": "Agendar reunião de entrega dos documentos aprovados",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": [
   "Marcar reunião com cliente"
  ]
 },
 {
  "etapa": "H3",
  "variante": "todas",
  "ordem": 2,
  "titulo": "Reunião de entrega dos documentos aprovados",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": [
   "Imprimir documentos aprovados",
   "Imprimir documentos emitidos pela Prefeitura",
   "Emitir e imprimir termo de retirada",
   "Explicar e entregar todos os documentos ao cliente"
  ]
 },
 {
  "etapa": "19",
  "variante": "todas",
  "ordem": 1,
  "titulo": "Avaliação interna",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": []
 },
 {
  "etapa": "19",
  "variante": "todas",
  "ordem": 2,
  "titulo": "Gerar IFC do projeto",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": [
   "Gerar IFC do projeto",
   "Solicitar ao Administrativo o envio do IFC ao profissional de complementares"
  ]
 },
 {
  "etapa": "19",
  "variante": "todas",
  "ordem": 3,
  "titulo": "Agendar reunião de pontos técnicos com o cliente",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": [
   "Marcar reunião com cliente"
  ]
 },
 {
  "etapa": "19",
  "variante": "todas",
  "ordem": 4,
  "titulo": "Reunião de pontos técnicos",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": [
   "Preenchimento de ata",
   "Enviar ata de reunião ao cliente",
   "Ata dado aceite pelo cliente"
  ]
 },
 {
  "etapa": "19",
  "variante": "todas",
  "ordem": 5,
  "titulo": "Projeto de pontos técnicos",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": [
   "Projeto dos pontos elétricos",
   "Projeto dos pontos hidrossanitários",
   "Projeto dos pontos de iluminação",
   "Enviar projeto para o profissional responsável pela elaboração dos complementares"
  ]
 },
 {
  "etapa": "19",
  "variante": "todas",
  "ordem": 6,
  "titulo": "Fazer compatibilização dos complementares recebidos",
  "descricao": "Deverá ser feita a análise dos documentos que os profissionais responsáveis pelos complementares enviar. Deverá ser uma análise minuciosa e atenta.",
  "prioridade": "Baixa",
  "itens": [
   "Importar no arquivo do projeto 3D o IFC recebido",
   "Caso necessário, criar arquivo com os comentários da compatibilização no PowerPoint",
   "Compatibilização efetuada"
  ]
 },
 {
  "etapa": "19",
  "variante": "todas",
  "ordem": 7,
  "titulo": "Fazer cálculo de movimentação de terra (quando houver obra)",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": []
 },
 {
  "etapa": "19",
  "variante": "todas",
  "ordem": 8,
  "titulo": "Entrega final dos complementares",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": [
   "Elétrica finalizada",
   "Hidrossanitário finalizada",
   "Estrutural finalizada"
  ]
 },
 {
  "etapa": "19",
  "variante": "todas",
  "ordem": 9,
  "titulo": "Imprimir projetos complementares",
  "descricao": "Imprimir os complementares elaborados.",
  "prioridade": "Baixa",
  "itens": [
   "Marcenaria",
   "Marmoraria",
   "Paginação",
   "Forro de gesso",
   "Luminotécnico",
   "Revestimentos",
   "Lista de móveis soltos",
   "Espelhos",
   "Esquadrias"
  ]
 },
 {
  "etapa": "19",
  "variante": "todas",
  "ordem": 10,
  "titulo": "Agendar reunião para entrega dos projetos complementares",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": [
   "Marcar reunião com cliente",
   "Inserir reunião no sistema e notificar responsável"
  ]
 },
 {
  "etapa": "19",
  "variante": "todas",
  "ordem": 11,
  "titulo": "Reunião para entrega dos projetos complementares finalizados",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": [
   "Imprimir projetos finalizados",
   "Imprimir termo de retirada"
  ]
 },
 {
  "etapa": "21",
  "variante": "todas",
  "ordem": 1,
  "titulo": "Agendar reunião de entrega de projetos",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": [
   "Marcar reunião com cliente",
   "Inserir reunião no sistema e notificar responsável"
  ]
 },
 {
  "etapa": "22",
  "variante": "todas",
  "ordem": 1,
  "titulo": "Compilado dos documentos",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": [
   "Imprimir documentos para entrega",
   "Preparar e-mail/pendrive para entrega digital",
   "Emitir 2 vias do termo de retirada devidamente preenchido"
  ]
 },
 {
  "etapa": "23",
  "variante": "todas",
  "ordem": 1,
  "titulo": "Reunião de entrega de projetos",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": [
   "Reunião realizada",
   "Retirar foto com o cliente"
  ]
 },
 {
  "etapa": "24",
  "variante": "todas",
  "ordem": 1,
  "titulo": "Fazer arquivamento",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": [
   "Analisar documentos da pasta do cliente e arquivar os documentos pertinentes"
  ]
 },
 {
  "etapa": "24",
  "variante": "todas",
  "ordem": 2,
  "titulo": "Atualizar no sistema",
  "descricao": null,
  "prioridade": "Baixa",
  "itens": [
   "Dar como finalizado no Vobi",
   "Remover projeto do quadro físico"
  ]
 }
];
export const VAR_ROTULO: Record<string, string> = {"padrao": "Padrão", "ampliacao": "Ampliação", "mais_projetos": "+ Projetos", "apos_solicitacao": "Após pausa a pedido", "apos_ausencia": "Após falta de retorno"};
