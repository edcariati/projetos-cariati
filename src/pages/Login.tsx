import { FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';
import Icone from '../ui/Icone';
import { Anel } from '../ui/Holo';

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
      <form className="card login" onSubmit={entrar}>
        <div className="marca-login"><span className="logo" aria-hidden="true"><Icone n="raio" tam={18} /></span><span className="mudo pequeno">Cariati Arquitetura e Gestão</span></div>
        <div className="login-anel"><Anel valor={72} rotulo="Setor de Projetos" tam={150} formato="24 etapas" /></div>
        <h1>Projetos Cariati</h1>
        <p className="mudo" style={{ margin: '-6px 0 0' }}>Entre para acompanhar projetos, prazos e horas.</p>
        <label>E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></label>
        <label>Senha<input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required autoComplete="current-password" /></label>
        {erro && <p className="erro">{erro}</p>}
        <button className="primario" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  );
}
