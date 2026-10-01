import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { podeBancoHoras, usePerfil } from './lib/perfil';
import { PERFIL } from './lib/labels';
import Painel from './pages/Painel';
import Projetos from './pages/Projetos';
import ProjetoDetalhe from './pages/ProjetoDetalhe';
import NovoProjeto from './pages/NovoProjeto';
import Protocolos from './pages/Protocolos';
import Fluxo from './pages/Fluxo';
import Tempos from './pages/Tempos';
import Equipe from './pages/Equipe';
import BancoHoras from './pages/BancoHoras';
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
          <NavLink to="/" end>Painel</NavLink>
          <NavLink to="/projetos">Projetos</NavLink>
          <NavLink to="/protocolos">Protocolos</NavLink>
          <NavLink to="/tempos">Tempos</NavLink>
          <NavLink to="/fluxo">Fluxo</NavLink>
          {banco && <NavLink to="/banco-de-horas">Banco de horas</NavLink>}
          {admin && <NavLink to="/equipe">Equipe</NavLink>}
        </nav>
        <span className="quem" title={PERFIL[eu.perfil]}>{eu.nome}</span>
        <button className="link" onClick={() => supabase.auth.signOut()}>Sair</button>
      </header>
      <BarraCronometro />
      <main className={pathname === '/fluxo' || pathname === '/equipe' || pathname === '/banco-de-horas' ? 'largo' : ''}>
        <Routes>
          <Route path="/" element={<Painel />} />
          <Route path="/projetos" element={<Projetos />} />
          <Route path="/projetos/novo" element={<NovoProjeto />} />
          <Route path="/projetos/:id" element={<ProjetoDetalhe />} />
          <Route path="/protocolos" element={<Protocolos />} />
          <Route path="/tempos" element={<Tempos />} />
          <Route path="/fluxo" element={<Fluxo />} />
          {banco && <Route path="/banco-de-horas" element={<BancoHoras />} />}
          {admin && <Route path="/equipe" element={<Equipe />} />}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </>
  );
}
