import { FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';
import logo from '../assets/logo-cariati.jpg';

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErro('');
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) setErro('E-mail ou senha incorretos.');
    setBusy(false);
  }

  return (
    <div className="centro">
      <form className="card holo login" onSubmit={entrar}>
        <img className="logo-login" src={logo} alt="Cariati Arquitetura e Gestão" width="220" height="142" />
        <h1>Setor de Projetos</h1>
        <p className="mudo" style={{ margin: '-6px 0 0', textAlign: 'center' }}>Acesso restrito. Entre com seu e-mail e senha.</p>
        <label>E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></label>
        <label>Senha<input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required autoComplete="current-password" /></label>
        {erro && <p className="erro">{erro}</p>}
        <button className="primario" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  );
}
