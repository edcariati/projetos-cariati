import type { Projeto } from './types';

/** Texto “o que fazer nesta etapa”, mostrado dentro de cada etapa. Algumas mudam conforme o tipo do projeto. */
export function descricaoEtapa(codigo: string, p: Pick<Projeto, 'tipo_estudo' | 'tipo_projeto'>): string | null {
  const regulariza = p.tipo_projeto === 'regularizacao';
  const amplia = p.tipo_estudo === 'ampliacao' || p.tipo_projeto === 'ampliacao';
  switch (codigo) {
    case '01':
      return 'Levantamento de dados e contrato: coleta das informações pertinentes para a criação do contrato de prestação de serviço. Setor administrativo: o checklist reúne as informações que precisam ser coletadas para preencher o contrato; quando elas são preenchidas no sistema do administrativo, aparecem aqui. As etapas anteriores a virar projeto aparecem para o setor de projetos já concluídas.';
    case '02':
      return 'Criação da pasta do cliente no servidor e do grupo de WhatsApp, que será o canal oficial de comunicação pelo setor administrativo. Comercial: envia o dossiê com as informações do cliente ao profissional responsável. Administrativo: cria a pasta no servidor e envia as informações sobre o grupo, o projeto e o escritório. Projetos: envia a mensagem inicial do profissional responsável.' + (regulariza ? ' Em projetos de regularização não há briefing: depois da mensagem do profissional, agenda-se o levantamento do local alvo da regularização.' : '');
    case '03':
      return 'Envio do formulário de briefing no canal oficial, para o cliente preencher. Só depois do preenchimento é agendada a reunião de briefing: sem ele o agendamento não é permitido.' + (amplia ? ' Em ampliação, a aferição do local é agendada depois deste preenchimento.' : '');
    case '04':
      return 'Depois do preenchimento do briefing, entrar em contato com o cliente pelo canal oficial do projeto para agendar a reunião de briefing.';
    case '06':
      if (regulariza) return 'Aferição do local para regularização: ida do profissional responsável ao local da regularização. Fazer o registro fotográfico do local. Checklist: registro fotográfico; salvar fotos no servidor; vetorização do levantamento.';
      if (amplia) return 'Aferição do local de ampliação: ida do profissional responsável ao local para entender a área e o existente. Fazer o registro fotográfico e o levantamento do existente, para conferir o que já está construído e o que está averbado e ver se é preciso regularizar além de ampliar. Checklist: registro fotográfico; salvar fotos no servidor; vetorização do levantamento.';
      return 'Aferição do terreno: ida do profissional responsável ao terreno para entender a topografia e a localização. Fazer o registro fotográfico dos 4 cantos do terreno e um 360 na frente do lote. Checklist: registro fotográfico; salvar fotos no servidor.';
    default:
      return null;
  }
}
