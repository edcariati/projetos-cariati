import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { usePerfil } from './lib/perfil';
import ClienteInicio from './pages/cliente/ClienteInicio';
import ClienteProjeto from './pages/cliente/ClienteProjeto';
import ClienteComoFunciona from './pages/cliente/ClienteComoFunciona';
import Conta from './pages/Conta';
import Icone from './ui/Icone';
import logo from './assets/logo-cariati.jpg';
import { useTema } from './ui/tema';

/** Área do cliente: acompanha o próprio projeto, sem nada interno do escritório. */
export default function AppCliente() {
  const eu = usePerfil();
  const [tema, alternarTema] = useTema();
  return (
    <div className="shell cliente">
      <header className="topo">
        <div className="marca"><img className="logo-img" src={logo} alt="Cariati Arquitetura e Gestão" width="150" height="97" /></div>
        <nav aria-label="Principal">
          <NavLink to="/" end><Icone n="projetos" /><span className="rot">Meu projeto</span></NavLink>
          <NavLink to="/como-funciona"><Icone n="ajuda" /><span className="rot">Como funciona</span></NavLink>
        </nav>
        <div className="usuario">
          <button className="icone-btn" onClick={alternarTema} aria-label={tema === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}><Icone n={tema === 'dark' ? 'sol' : 'lua'} /></button>
          <NavLink className="quem" to="/conta" title="Minha conta"><span className="avatar-eu" aria-hidden="true">{eu.nome.trim().charAt(0).toUpperCase()}</span><span className="rot">{eu.nome}</span></NavLink>
          <button className="link sair" onClick={() => supabase.auth.signOut()}><Icone n="sair" tam={18} /><span className="rot">Sair</span></button>
        </div>
      </header>
      <div className="conteudo">
        <main>
          <Routes>
            <Route path="/" element={<ClienteInicio />} />
            <Route path="/projeto/:id" element={<ClienteProjeto />} />
            <Route path="/como-funciona" element={<ClienteComoFunciona />} />
            <Route path="/conta" element={<Conta />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
      <nav className="nav-inf" aria-label="Atalhos">
        <NavLink to="/" end><Icone n="projetos" /><span>Meu projeto</span></NavLink>
        <NavLink to="/como-funciona"><Icone n="ajuda" /><span>Como funciona</span></NavLink>
        <NavLink to="/conta"><Icone n="usuario" /><span>Minha conta</span></NavLink>
      </nav>
    </div>
  );
}
