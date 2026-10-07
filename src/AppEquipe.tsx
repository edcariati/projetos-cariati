import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { podeBancoHoras, usePerfil } from './lib/perfil';
import Icone from './ui/Icone';
import logo from './assets/logo-cariati.jpg';
import Paleta from './ui/Paleta';
import Migalhas from './ui/Migalhas';
import { Carregando } from './ui/Holo';
import { useTema } from './ui/tema';
import { type Favorito, gravarFavoritos, itensMenu, lerFavoritos } from './ui/menu';
import { PERFIL } from './lib/labels';
import Painel from './pages/Painel';
const Visao = lazy(() => import('./pages/Visao'));
import Projetos from './pages/Projetos';
import ProjetoDetalhe from './pages/ProjetoDetalhe';
import NovoProjeto from './pages/NovoProjeto';
import Protocolos from './pages/Protocolos';
const Fluxo = lazy(() => import('./pages/Fluxo'));
import Tempos from './pages/Tempos';
import Tarefas from './pages/Tarefas';
const Equipe = lazy(() => import('./pages/Equipe'));
import Conta from './pages/Conta';
import Clientes from './pages/Clientes';
import ClienteDetalhe from './pages/ClienteDetalhe';
const Servicos = lazy(() => import('./pages/Servicos'));
const Cadastros = lazy(() => import('./pages/Cadastros'));
const BancoHoras = lazy(() => import('./pages/BancoHoras'));
const GestaoHoras = lazy(() => import('./pages/GestaoHoras'));
import BarraCronometro from './components/BarraCronometro';

/** Área da equipe (administrador e profissionais): menu lateral, busca global e telas. */
export default function AppEquipe() {
  const { pathname } = useLocation();
  const eu = usePerfil();
  const admin = eu.perfil === 'admin';
  const banco = podeBancoHoras(eu);
  const itens = itensMenu(eu);
  const [tema, alternarTema] = useTema();
  const [recolhido, setRecolhido] = useState(() => { try { return localStorage.getItem('menu-recolhido') === '1'; } catch { return false; } });
  const [busca, setBusca] = useState(false);
  const [mais, setMais] = useState(false);
  const [rapido, setRapido] = useState(false);
  const [favs, setFavs] = useState<Favorito[]>(lerFavoritos);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => { try { localStorage.setItem('menu-recolhido', recolhido ? '1' : '0'); } catch { /* ignora */ } }, [recolhido]);
  useEffect(() => { setMais(false); setRapido(false); }, [pathname]);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setBusca((b) => !b); } };
    addEventListener('keydown', tecla);
    return () => removeEventListener('keydown', tecla);
  }, []);

  const favorita = favs.some((f) => f.to === pathname);
  function alternarFavorito() {
    const rotulo = document.querySelector('main h1')?.textContent?.trim() || itens.find((i) => i.to === pathname)?.rotulo || pathname;
    const novo = favorita ? favs.filter((f) => f.to !== pathname) : [...favs, { to: pathname, rotulo }].slice(-6);
    setFavs(novo); gravarFavoritos(novo);
  }
  const grupos = [...new Set(itens.map((i) => i.grupo))];
  const largo = pathname === '/fluxo' || pathname === '/servicos' || (admin && pathname === '/') || pathname === '/equipe' || pathname === '/banco-de-horas' || pathname === '/horas' || pathname === '/projetos' || pathname === '/tarefas' || pathname === '/clientes' || pathname.startsWith('/cadastros');
  const principais = [itens.find((i) => i.icone === 'painel') ?? itens[0], itens.find((i) => i.to === '/projetos')!, itens.find((i) => i.to === '/tarefas')!, itens.find((i) => i.to === '/clientes')!];
  const inicio = admin ? itens[0] : principais[0];

  return (
    <div className={`shell${recolhido ? ' rec' : ''}`} ref={raiz}>
      <header className="topo">
        <div className="marca">
          <img className="logo-img" src={logo} alt="Cariati Arquitetura e Gestão" width="150" height="97" />
          <button className="icone-btn recolher" onClick={() => setRecolhido((r) => !r)} aria-expanded={!recolhido} aria-label={recolhido ? 'Expandir menu' : 'Recolher menu'} title={recolhido ? 'Expandir menu' : 'Recolher menu'}><Icone n="recolher" tam={18} /></button>
        </div>
        <span className="marca-sub">Setor de Projetos</span>
        <div className="rapido">
          <button className="criar" onClick={() => setRapido((r) => !r)} aria-expanded={rapido} aria-haspopup="menu" title="Criar"><Icone n="mais" /><span className="rot">Criar novo</span></button>
          {rapido && (
            <div className="rapido-menu" role="menu">
              <Link role="menuitem" to="/projetos/novo">Novo projeto</Link>
              <Link role="menuitem" to="/clientes/novo">Novo cliente</Link>
              {admin && <Link role="menuitem" to="/cadastros/parceiros">Novo parceiro</Link>}
              {admin && <Link role="menuitem" to="/cadastros/usuarios">Novo acesso</Link>}
            </div>
          )}
        </div>
        <nav aria-label="Principal">
          {grupos.map((g) => (
            <div className="grupo" key={g}>
              <span className="grupo-t">{g}</span>
              {itens.filter((i) => i.grupo === g).map((i) => (
                <NavLink key={i.to + i.rotulo} to={i.to} end={i.end} title={i.rotulo}><Icone n={i.icone} /><span className="rot">{i.rotulo}</span></NavLink>
              ))}
            </div>
          ))}
          {favs.length > 0 && (
            <div className="grupo favs">
              <span className="grupo-t">Favoritos</span>
              {favs.map((f) => <NavLink key={f.to} to={f.to} end title={f.rotulo}><Icone n="estrela" /><span className="rot">{f.rotulo}</span></NavLink>)}
            </div>
          )}
        </nav>
        <div className="usuario">
          <NavLink className="quem" to="/conta" title={`${PERFIL[eu.perfil]} · minha conta`}><span className="avatar-eu" aria-hidden="true">{eu.nome.trim().charAt(0).toUpperCase()}</span><span className="rot">{eu.nome}</span></NavLink>
          <button className="link sair" onClick={() => supabase.auth.signOut()} title="Sair"><Icone n="sair" tam={18} /><span className="rot">Sair</span></button>
        </div>
      </header>

      <div className="conteudo">
        <div className="barra-topo">
          <button className="icone-btn menu-mobile" onClick={() => setMais(true)} aria-label="Abrir menu" aria-haspopup="dialog"><Icone n="pontos" /></button>
          <button className="busca-pilula" onClick={() => setBusca(true)} aria-label="Buscar (Ctrl K)">
            <Icone n="busca" /><span>Buscar projetos, clientes, telas e ações…</span><kbd>Ctrl K</kbd>
          </button>
          <div className="barra-acoes">
            <button className="icone-btn" onClick={alternarFavorito} aria-pressed={favorita} aria-label={favorita ? 'Remover dos favoritos' : 'Adicionar aos favoritos'} title={favorita ? 'Remover dos favoritos' : 'Fixar esta página nos favoritos'}><Icone n="estrela" className={favorita ? 'cheia' : ''} /></button>
            <button className="icone-btn" onClick={alternarTema} aria-label={tema === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'} title={tema === 'dark' ? 'Tema claro' : 'Tema escuro'}><Icone n={tema === 'dark' ? 'sol' : 'lua'} /></button>
          </div>
        </div>
        <div className="trilha-pagina"><Migalhas /></div>
        <BarraCronometro />
        <main className={largo ? 'largo' : ''}>
          <Suspense fallback={<Carregando tipo="cartoes" />}>
          <Routes>
            <Route path="/" element={admin ? <Visao /> : <Painel />} />
            {admin && <Route path="/painel" element={<Painel />} />}
            <Route path="/projetos" element={<Projetos />} />
            <Route path="/projetos/novo" element={<NovoProjeto />} />
            <Route path="/projetos/:id" element={<ProjetoDetalhe />} />
            <Route path="/clientes" element={<Clientes />} />
            <Route path="/clientes/:id" element={<ClienteDetalhe />} />
            <Route path="/tarefas" element={<Tarefas />} />
            <Route path="/conta" element={<Conta />} />
            <Route path="/protocolos" element={<Protocolos />} />
            <Route path="/tempos" element={<Tempos />} />
            <Route path="/fluxo" element={<Fluxo />} />
            <Route path="/servicos" element={<Servicos />} />
            {banco && <Route path="/horas" element={<GestaoHoras />} />}
            {banco && <Route path="/banco-de-horas" element={<BancoHoras />} />}
            {admin && <Route path="/equipe" element={<Equipe />} />}
            {admin && <Route path="/cadastros" element={<Navigate to="/cadastros/clientes" replace />} />}
            {admin && <Route path="/cadastros/clientes" element={<Cadastros aba="clientes" />} />}
            {admin && <Route path="/cadastros/parceiros" element={<Cadastros aba="parceiros" />} />}
            {admin && <Route path="/cadastros/servicos" element={<Cadastros aba="servicos" />} />}
            {admin && <Route path="/cadastros/usuarios" element={<Cadastros aba="usuarios" />} />}
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
          </Suspense>
        </main>
      </div>

      <nav className="nav-inf" aria-label="Atalhos">
        {[inicio, ...principais.slice(1)].map((i) => (
          <NavLink key={i.to + i.rotulo} to={i.to} end={i.end ?? i.to === '/'}><Icone n={i.icone} /><span>{i.rotulo === 'Minhas tarefas' ? 'Tarefas' : i.rotulo === 'Visão geral' ? 'Início' : i.rotulo}</span></NavLink>
        ))}
        <button className={mais ? 'on' : ''} onClick={() => setMais((m) => !m)} aria-expanded={mais} aria-haspopup="dialog"><Icone n="pontos" /><span>Mais</span></button>
      </nav>
      {mais && (
        <div className="folha-fundo" onMouseDown={(e) => e.target === e.currentTarget && setMais(false)}>
          <div className="folha" role="dialog" aria-modal="true" aria-label="Todas as páginas">
            <span className="folha-alca" aria-hidden="true" />
            <div className="folha-grade">
              {itens.map((i) => <NavLink key={i.to + i.rotulo} to={i.to} end={i.end}><Icone n={i.icone} /><span>{i.rotulo}</span></NavLink>)}
              <NavLink to="/conta"><Icone n="usuario" /><span>Minha conta</span></NavLink>
              <button onClick={() => { setMais(false); setBusca(true); }}><Icone n="busca" /><span>Buscar</span></button>
              <button onClick={() => supabase.auth.signOut()}><Icone n="sair" /><span>Sair</span></button>
            </div>
          </div>
        </div>
      )}
      <Paleta eu={eu} aberta={busca} aoFechar={() => setBusca(false)} />
    </div>
  );
}
