import { Link, useLocation } from 'react-router-dom';
import { useIndice } from './indice';

const TOPO: Record<string, string> = {
  '': 'Início', painel: 'Painel', projetos: 'Projetos', clientes: 'Clientes', tarefas: 'Minhas tarefas', protocolos: 'Protocolos', horas: 'Horas', tempos: 'Tempos',
  'banco-de-horas': 'Banco de horas', fluxo: 'Fluxo', equipe: 'Equipe', cadastros: 'Cadastros', conta: 'Minha conta',
};
const SUB: Record<string, string> = { novo: 'Novo', clientes: 'Clientes', parceiros: 'Parceiros', usuarios: 'Quem usa o aplicativo' };

/** Trilha de navegação: Seção › Tela. Nos detalhes mostra o nome do projeto ou do cliente. */
export function trilha(pathname: string, nomeDe: (secao: string, id: string) => string | undefined): { to: string; rotulo: string }[] {
  const seg = pathname.split('/').filter(Boolean);
  const topo = seg[0] ?? '';
  const out = [{ to: topo ? `/${topo}` : '/', rotulo: TOPO[topo] ?? 'Início' }];
  if (seg[1]) {
    const rotulo = SUB[seg[1]] ?? nomeDe(topo, seg[1]) ?? 'Detalhe';
    out.push({ to: pathname, rotulo: topo === 'projetos' && seg[1] === 'novo' ? 'Novo projeto' : topo === 'clientes' && seg[1] === 'novo' ? 'Novo cliente' : rotulo });
  }
  return out;
}

export default function Migalhas() {
  const { pathname } = useLocation();
  const fundo = pathname.split('/').filter(Boolean).length >= 2;
  const indice = useIndice(fundo);
  const itens = trilha(pathname, (s, id) => (s === 'projetos' ? indice?.projetos.find((p) => p.id === id)?.nome : s === 'clientes' ? indice?.clientes.find((c) => c.id === id)?.nome : undefined));
  return (
    <nav className="migalhas" aria-label="Você está em">
      <ol>
        {itens.map((m, i) => (
          <li key={m.to + i}>{i < itens.length - 1 ? <Link to={m.to}>{m.rotulo}</Link> : <span aria-current="page">{m.rotulo}</span>}</li>
        ))}
      </ol>
    </nav>
  );
}
