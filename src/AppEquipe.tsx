import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { podeBancoHoras, usePerfil } from './lib/perfil';
import { PERFIL } from './lib/labels';
import Painel from './pages/Painel';
import Visao from './pages/Visao';
import Projetos from './pages/Projetos';
import ProjetoDetalhe from './pages/ProjetoDetalhe';
import NovoProjeto from './pages/NovoProjeto';
import Protocolos from './pages/Protocolos';
import Fluxo from './pages/Fluxo';
import Tempos from './pages/Tempos';
import Tarefas from './pages/Tarefas';
import Equipe from './pages/Equipe';
import Conta from './pages/Conta';
import BancoHoras from './pages/BancoHoras';
import GestaoHoras from './pages/GestaoHoras';
import BarraCronometro from './components/BarraCronometro';

/** Área da equipe (administrador e profissionais). */
export default function AppEquipe() {
  const { pathname } = useLocation();
  const eu = usePerfil();
  const admin = eu.perfil === 'admin';
  const banco = podeBancoHoras(eu);
  return (
    <>
      <header className="topo">
        <strong>Projetos Cariati</strong>
        <nav>
          {admin && <NavLink to="/" end>Visão geral</NavLink>}
          <NavLink to={admin ? '/painel' : '/'} end>Painel</NavLink>
          <NavLink to="/projetos">Projetos</NavLink>
          <NavLink to="/tarefas">Minhas tarefas</NavLink>
          <NavLink to="/protocolos">Protocolos</NavLink>
          {banco ? <NavLink to="/horas">Horas</NavLink> : <NavLink to="/tempos">Tempos</NavLink>}
          <NavLink to="/fluxo">Fluxo</NavLink>
          {admin && <NavLink to="/equipe">Equipe</NavLink>}
        </nav>
        <NavLink className="quem" to="/conta" title={`${PERFIL[eu.perfil]} · minha conta`}>{eu.nome}</NavLink>
        <button className="link" onClick={() => supabase.auth.signOut()}>Sair</button>
      </header>
      <BarraCronometro />
      <main className={pathname === '/fluxo' || (admin && pathname === '/') || pathname === '/equipe' || pathname === '/banco-de-horas' || pathname === '/horas' || pathname === '/projetos' || pathname === '/tarefas' ? 'largo' : ''}>
        <Routes>
          <Route path="/" element={admin ? <Visao /> : <Painel />} />
          {admin && <Route path="/painel" element={<Painel />} />}
          <Route path="/projetos" element={<Projetos />} />
          <Route path="/projetos/novo" element={<NovoProjeto />} />
          <Route path="/projetos/:id" element={<ProjetoDetalhe />} />
          <Route path="/tarefas" element={<Tarefas />} />
          <Route path="/conta" element={<Conta />} />
          <Route path="/protocolos" element={<Protocolos />} />
          <Route path="/tempos" element={<Tempos />} />
          <Route path="/fluxo" element={<Fluxo />} />
          {banco && <Route path="/horas" element={<GestaoHoras />} />}
          {banco && <Route path="/banco-de-horas" element={<BancoHoras />} />}
          {admin && <Route path="/equipe" element={<Equipe />} />}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </>
  );
}
