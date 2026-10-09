import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Projeto } from '../lib/types';
import { NOTA_PARCEIRO, useCatalogo } from '../lib/servicos';

/** Etapa 19: quem elabora os complementares (parceiro) e o aviso de que a Cariati acompanha e confere a compatibilização. */
export default function ComplementaresParceiros({ projeto, onChange }: { projeto: Projeto; onChange: () => void }) {
  const catalogo = useCatalogo();
  const [quem, setQuem] = useState(projeto.parceiros_complementares ?? '');
  const [nomes, setNomes] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  useEffect(() => { supabase.from('parceiros').select('nome').eq('ativo', true).order('nome').then(({ data }) => setNomes(((data as { nome: string }[]) ?? []).map((x) => x.nome))); }, []);
  const ids = projeto.servicos ?? [];
  const contratados = catalogo.categorias.filter((c) => c.execucao === 'parceiro' && ids.some((i) => i.startsWith(c.id + '-')));

  async function salvar() {
    setMsg('');
    const r = await supabase.from('projetos').update({ parceiros_complementares: quem.trim() || null }).eq('id', projeto.id);
    if (r.error) {   // banco sem a migração 0020: guarda no histórico do projeto
      await supabase.from('historico').insert({ projeto_id: projeto.id, tipo: 'nota', etapa_codigo: '19', texto: `Complementares elaborados por: ${quem.trim() || '—'}` });
    }
    setMsg('Salvo.'); onChange();
  }
  return (
    <div className="complementares-parceiros">
      <h4>Quem elabora os complementares</h4>
      {contratados.length > 0 && <p className="pequeno mudo">Contratados: {contratados.map((c) => c.nome).join(', ')}. {NOTA_PARCEIRO}</p>}
      <div className="nota">
        <input list="lista-parceiros" aria-label="Parceiro responsável pelos complementares" placeholder="Parceiro(s) responsável(is) — ex.: Eng. Marcos (elétrico), Hidro Projetos" value={quem} onChange={(e) => setQuem(e.target.value)} />
        <datalist id="lista-parceiros">{nomes.map((n) => <option key={n} value={n} />)}</datalist>
        <button onClick={salvar}>Salvar</button>
      </div>
      <p className="pequeno mudo">As horas da compatibilização são lançadas no cronômetro desta etapa (▶ na linha da etapa) ou em “Registros de tempo”.{msg && <b> {msg}</b>}</p>
    </div>
  );
}
