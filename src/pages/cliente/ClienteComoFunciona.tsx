import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { EtapaCliente } from '../../lib/types';
import { FASES } from '../../lib/labels';

const FASE_TEXTO: Record<number, string> = {
  1: 'Formalizamos o contrato, criamos o grupo oficial de comunicação e entendemos o que você precisa, por meio de um briefing e de uma reunião.',
  2: 'Desenvolvemos o estudo da planta baixa e depois o da fachada. Cada estudo é apresentado em reunião, pode receber ajustes e só avança com o seu aceite formal assinado.',
  3: 'Com os estudos aprovados, desenvolvemos o projeto arquitetônico e, se estiverem no seu contrato, o projeto legal, o estudo e o detalhamento de interiores e os projetos complementares.',
  4: 'Conferimos todo o material, agendamos a reunião de entrega, entregamos os arquivos físicos e digitais e você assina o termo de retirada. Depois disso, o projeto é encerrado.',
};

/** Fluxo explicativo, em linguagem de cliente (sem regras internas do escritório). */
export default function ClienteComoFunciona() {
  const [etapas, setEtapas] = useState<EtapaCliente[]>([]);
  useEffect(() => { supabase.from('etapas_cliente').select('*').order('ordem').then(({ data }) => setEtapas((data as EtapaCliente[]) ?? [])); }, []);

  return (
    <>
      <div className="titulo"><h1>Como funciona o seu projeto</h1></div>
      <p className="mudo">Um projeto com o escritório passa por quatro fases. Em cada uma, mostramos o que acontece e quando precisamos de você.</p>
      {[1, 2, 3, 4].map((f) => (
        <section className="card" key={f}>
          <h2>{f}. {FASES[f]}</h2>
          <p>{FASE_TEXTO[f]}</p>
          <ul className="etapas">
            {etapas.filter((m) => m.fase === f).map((m) => (
              <li key={m.codigo} className="et"><div className="linha sem-clique">
                <span className="et-num">{m.codigo}</span>
                <div className="grow"><b>{m.titulo}</b>
                  <div className="pequeno mudo">
                    {m.cliente_participa ? 'Com a sua participação' : 'Trabalho do escritório'}
                    {m.aceite_formal ? ' · você assina o aceite' : ''}{m.opcional ? ' · se estiver no seu contrato' : ''}
                  </div>
                </div>
              </div></li>
            ))}
          </ul>
        </section>
      ))}
      <section className="card">
        <h2>Combinados importantes</h2>
        <ul className="lista">
          <li><div className="lista-item"><div><b>Um único canal.</b><div className="mudo">As conversas e decisões do projeto acontecem no grupo oficial de WhatsApp, para tudo ficar registrado.</div></div></div></li>
          <li><div className="lista-item"><div><b>Ajustes.</b><div className="mudo">Cada estudo tem até 3 rodadas de ajuste, previstas em contrato. Ajustes além disso podem ter custo adicional.</div></div></div></li>
          <li><div className="lista-item"><div><b>Aceite formal.</b><div className="mudo">Cada estudo aprovado é formalizado com a sua assinatura. Etapas aprovadas continuam valendo, e mudanças posteriores podem exigir reabrir a etapa.</div></div></div></li>
          <li><div className="lista-item"><div><b>Responsabilidade compartilhada.</b><div className="mudo">O projeto avança com as informações, os documentos e as aprovações de todos. Quando algo depender de você, avisamos aqui e no grupo.</div></div></div></li>
          <li><div className="lista-item"><div><b>Pausas.</b><div className="mudo">Se precisar pausar, formalizamos com um termo. A retomada é possível em até 180 dias, com reanálise do projeto antes de continuar.</div></div></div></li>
        </ul>
      </section>
    </>
  );
}
