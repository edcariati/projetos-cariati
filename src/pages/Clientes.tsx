import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Cliente } from '../lib/types';
import { baixarCsv } from '../lib/banco';
import { completude, digitos, formatarDocumento, formatarTelefone } from '../lib/cadastro';
import { pessoaPodeEditarClientes } from '../lib/perfil';
import { usePerfil } from '../lib/perfil';
import { Medidor } from '../components/graficos';

interface Resumo { cliente_id: string; status: string }

/** Cadastro de clientes: busca, filtros e acesso ao cadastro completo de cada um. */
export default function Clientes() {
  const eu = usePerfil();
  const [lista, setLista] = useState<Cliente[] | null>(null);
  const [projetos, setProjetos] = useState<Resumo[]>([]);
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('');
  const [tipo, setTipo] = useState('');
  const [incompleto, setIncompleto] = useState(false);

  useEffect(() => {
    supabase.from('clientes').select('*').order('nome').then(({ data }) => setLista((data as Cliente[]) ?? []));
    supabase.from('projetos').select('cliente_id,status').then(({ data }) => setProjetos((data as Resumo[]) ?? []));
  }, []);

  const qtd = useMemo(() => {
    const m = new Map<string, { ativos: number; total: number }>();
    for (const p of projetos) { const x = m.get(p.cliente_id) ?? { ativos: 0, total: 0 }; x.total++; if (p.status === 'ativo' || p.status === 'pausado') x.ativos++; m.set(p.cliente_id, x); }
    return m;
  }, [projetos]);

  const q = busca.trim().toLowerCase(), qd = digitos(busca);
  const filtrada = (lista ?? []).filter((c) => {
    const texto = [c.nome, c.codigo, c.email, c.end_cidade, c.obra_cidade, c.empresa_razao_social].join(' ').toLowerCase();
    const achou = !q || texto.includes(q) || (qd.length >= 3 && [c.documento, c.telefone, c.whatsapp, c.telefone2].some((v) => digitos(v).includes(qd)));
    return achou && (!categoria || c.categoria === categoria) && (!tipo || c.tipo_pessoa === tipo) && (!incompleto || completude(c).pct < 100);
  });
  const mediaCompleta = lista && lista.length ? Math.round(lista.reduce((s, c) => s + completude(c).pct, 0) / lista.length) : 0;

  const exportar = () => baixarCsv('clientes.csv', [
    ['Código', 'Nome', 'Tipo', 'CPF/CNPJ', 'Telefone', 'WhatsApp', 'E-mail', 'Cidade', 'UF', 'Perfil', 'Premium', 'Projetos', 'Cadastro completo'],
    ...filtrada.map((c) => [c.codigo ?? '', c.nome, c.tipo_pessoa === 'juridica' ? 'Jurídica' : 'Física', formatarDocumento(c.documento ?? '', c.tipo_pessoa), c.telefone ?? '', c.whatsapp ?? '', c.email ?? '', c.end_cidade ?? '', c.end_uf ?? '', c.categoria ?? '', c.premium ? 'sim' : 'não', qtd.get(c.id)?.total ?? 0, `${completude(c).pct}%`]),
  ]);

  return (
    <>
      <div className="titulo">
        <h1>Clientes</h1>
        <div className="acoes">
          <button onClick={exportar} disabled={!filtrada.length}>Exportar CSV</button>
          {pessoaPodeEditarClientes(eu) && <Link className="primario btn" to="/clientes/novo">+ Novo cliente</Link>}
        </div>
      </div>
      <p className="mudo">Cadastro completo de cada cliente: dados pessoais ou da empresa, contato, endereço, dados da obra e projetos. {lista ? `${lista.length} cliente${lista.length === 1 ? '' : 's'}, cadastro ${mediaCompleta}% completo em média.` : ''}</p>

      <div className="filtros">
        <input id="busca-cliente" placeholder="Buscar por nome, CPF/CNPJ, telefone, e-mail, cidade ou código…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      <div className="filtros filtros-linha">
        <select id="filtro-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Perfil">
          <option value="">Todos os perfis</option>{['A', 'B', 'C', 'D', 'E'].map((c) => <option key={c} value={c}>Perfil {c}{c === 'D' || c === 'E' ? ' (+ Projetos)' : ''}</option>)}
        </select>
        <select id="filtro-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo de pessoa">
          <option value="">Pessoa física e jurídica</option><option value="fisica">Pessoa física</option><option value="juridica">Pessoa jurídica</option>
        </select>
        <label className="check"><input type="checkbox" checked={incompleto} onChange={(e) => setIncompleto(e.target.checked)} />Só cadastros incompletos</label>
      </div>

      {lista === null ? <p className="mudo">Carregando clientes…</p> : (
        <div className="viz-tab card">
          <table className="tab-projetos tab-clientes">
            <thead><tr><th>Cliente</th><th>Contato</th><th>Cidade</th><th>Projetos</th><th>Cadastro</th></tr></thead>
            <tbody>
              {filtrada.map((c) => { const comp = completude(c); const n = qtd.get(c.id); return (
                <tr key={c.id}>
                  <td><Link to={`/clientes/${c.id}`}><b>{c.nome}</b></Link>
                    <div className="mudo pequeno">{c.codigo ?? 'sem código'} · {c.tipo_pessoa === 'juridica' ? 'Pessoa jurídica' : 'Pessoa física'}{c.categoria ? ` · perfil ${c.categoria}` : ''}{c.premium ? ' · premium' : ''}</div></td>
                  <td>{c.whatsapp || c.telefone ? formatarTelefone(c.whatsapp || c.telefone || '') : <span className="mudo">—</span>}<div className="mudo pequeno">{c.email}</div></td>
                  <td>{c.end_cidade ? `${c.end_cidade}${c.end_uf ? '/' + c.end_uf : ''}` : <span className="mudo">—</span>}</td>
                  <td>{n ? `${n.ativos} em andamento · ${n.total} no total` : <span className="mudo">nenhum</span>}</td>
                  <td><span className="viz-pct" title={comp.faltando.length ? `Falta: ${comp.faltando.join(', ')}` : 'Cadastro completo'}><Medidor valor={comp.pct} max={100} aviso={2} perigo={2} rotulo="Cadastro completo" /><em>{comp.pct}%</em></span></td>
                </tr>
              ); })}
            </tbody>
          </table>
          {filtrada.length === 0 && <p className="mudo">Nenhum cliente encontrado.</p>}
        </div>
      )}
    </>
  );
}
