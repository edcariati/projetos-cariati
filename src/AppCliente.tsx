import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { usePerfil } from './lib/perfil';
import ClienteInicio from './pages/cliente/ClienteInicio';
import ClienteProjeto from './pages/cliente/ClienteProjeto';
import ClienteComoFunciona from './pages/cliente/ClienteComoFunciona';
import Conta from './pages/Conta';

/** Área do cliente: acompanha o próprio projeto, sem nada interno do escritório. */
export default function AppCliente() {
  const eu = usePerfil();
  return (
    <>
      <header className="topo">
        <strong>Projetos Cariati</strong>
        <nav>
          <NavLink to="/" end>Meu projeto</NavLink>
          <NavLink to="/como-funciona">Como funciona</NavLink>
        </nav>
        <NavLink className="quem" to="/conta" title="Minha conta">{eu.nome}</NavLink>
        <button className="link" onClick={() => supabase.auth.signOut()}>Sair</button>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<ClienteInicio />} />
          <Route path="/projeto/:id" element={<ClienteProjeto />} />
          <Route path="/como-funciona" element={<ClienteComoFunciona />} />
          <Route path="/conta" element={<Conta />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </>
  );
}
