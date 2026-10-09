import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface P { id: string; nome: string; clientes?: { nome: string } | null }
const DIA = 86_400_000;

/** Agenda das mensagens semanais aos clientes (checagem dos estudos): quem está há 7 dias ou mais sem atualização. */
export default function AtualizacaoSemanal() {
  const [projetos, setProjetos] = useState<P[]>([]);
  const [ultima, setUltima] = useState<Map<string, number>>(new Map());
  const [msg, setMsg] = useState('');
  const carregar = useCallback(async () => {
    const [p, h] = await Promise.all([
      supabase.from('projetos').select('id,nome,clientes(nome)').eq('status', 'ativo').order('nome'),
      supabase.from('historico').select('projeto_id,created_at').eq('tipo', 'atualizacao_cliente').order('created_at', { ascending: false }),
    ]);
    setProjetos((p.data as unknown as P[]) ?? []);
    const m = new Map<string, number>();
    for (const x of (h.data as { projeto_id: string; created_at: string }[]) ?? []) if (!m.has(x.projeto_id)) m.set(x.projeto_id, new Date(x.created_at).getTime());
    setUltima(m);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const linhas = projetos.map((p) => ({ p, dias: ultima.has(p.id) ? Math.floor((Date.now() - ultima.get(p.id)!) / DIA) : null }))
    .filter((x) => x.dias === null || x.dias >= 7).sort((a, b) => (b.dias ?? 999) - (a.dias ?? 999));
  async function enviada(p: P) {
    setMsg('');
    const { error } = await supabase.from('historico').insert({ projeto_id: p.id, tipo: 'atualizacao_cliente', texto: 'Mensagem semanal de atualização enviada ao cliente' });
    if (error) return setMsg(error.message);
    carregar();
  }
  if (linhas.length === 0) return null;
  return (
    <section className="card" aria-label="Atualização semanal aos clientes">
      <h2>Atualização semanal ao cliente <span className="badge">{linhas.length}</span></h2>
      <p className="mudo pequeno">A cada semana o cliente recebe uma mensagem dizendo em que pé está o projeto. Marque quando enviar; o aviso volta em 7 dias.</p>
      <ul className="lista">
        {linhas.slice(0, 15).map(({ p, dias }) => (
          <li key={p.id} className="linha-atualizacao">
            <Link to={`/projetos/${p.id}`}><b>{p.nome}</b><span className="mudo"> · {p.clientes?.nome}</span></Link>
            <span className={dias === null || dias >= 10 ? 'alerta pequeno' : 'mudo pequeno'}>{dias === null ? 'nunca enviada' : `há ${dias} dias`}</span>
            <button onClick={() => enviada(p)}>Mensagem enviada</button>
          </li>
        ))}
      </ul>
      {msg && <p className="erro pequeno">{msg}</p>}
    </section>
  );
}
