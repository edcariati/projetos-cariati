/** Privacidade e dados pessoais (LGPD): o que o sistema faz hoje e o que falta para o jurídico revisar. */
export default function Privacidade() {
  return (
    <>
      <div className="titulo"><h1>Privacidade e dados</h1></div>
      <section className="card">
        <h2>Como cuidamos dos dados dos clientes</h2>
        <ul className="lista-simples">
          <li><b>Finalidade:</b> os dados (documento, contato, endereço, obra) são usados só para elaborar, aprovar e entregar o projeto contratado e para o contato sobre ele.</li>
          <li><b>Acesso por perfil:</b> o cliente vê somente o próprio projeto; cada profissional vê o que o seu perfil e o seu setor permitem. Cadastros e acessos são do administrador.</li>
          <li><b>Armazenamento:</b> banco com regras de acesso por linha, arquivos em área privada e senhas guardadas só como resumo criptográfico (nunca em texto).</li>
          <li><b>Sessão:</b> o sistema encerra o acesso depois de 30 minutos sem uso.</li>
          <li><b>Exportação:</b> a lista de clientes em planilha só é liberada ao administrador e ao Administrativo, com o CPF/CNPJ parcialmente oculto.</li>
          <li><b>Aviso ao cliente:</b> no cadastro fica registrada a data em que o cliente foi informado sobre o uso dos dados.</li>
          <li><b>Direitos do titular:</b> a pedido do cliente, os dados são corrigidos, entregues ou apagados (exceto o que a lei manda guardar).</li>
        </ul>
      </section>
      <section className="card">
        <h2>Para a revisão do jurídico antes do uso real</h2>
        <p className="mudo">Os arquitetos recomendaram que o advogado revise o sistema antes de usar com dados reais. Pontos sugeridos:</p>
        <ul className="lista-simples">
          <li>Texto do aviso de privacidade e da base legal (execução de contrato) dados ao cliente no contrato.</li>
          <li>Prazo de guarda dos documentos e do projeto depois do encerramento e rotina de descarte.</li>
          <li>Compartilhamento com parceiros (projetistas, engenheiros, despachantes) e cláusula de confidencialidade deles.</li>
          <li>Dados de terceiros enviados pelo cliente (RG, CPF, matrícula, IPTU) e da obra financiada.</li>
          <li>Procedimento para incidente de segurança e contato do encarregado (DPO).</li>
          <li>Termo de pausa e demais documentos assinados: quem pode ver e por quanto tempo.</li>
        </ul>
        <p className="pequeno mudo">Esta página descreve o que o sistema faz; não substitui parecer jurídico.</p>
      </section>
    </>
  );
}
