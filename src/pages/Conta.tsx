import { Link } from 'react-router-dom';
import { FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';
import { usePerfil } from '../lib/perfil';
import { ESPECIALIDADE, PERFIL, SETOR } from '../lib/labels';

/** Minha conta: dados da pessoa e troca de senha. */
export default function Conta() {
  const eu = usePerfil();
  const [nova, setNova] = useState('');
  const [conf, setConf] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function trocar(e: FormEvent) {
    e.preventDefault(); setMsg(null);
    if (nova.length < 8) return setMsg({ ok: false, texto: 'Use pelo menos 8 caracteres.' });
    if (nova !== conf) return setMsg({ ok: false, texto: 'As duas senhas não são iguais.' });
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: nova });
    setBusy(false);
    if (error) return setMsg({ ok: false, texto: 'Não foi possível trocar a senha. Entre de novo e tente outra vez.' });
    setNova(''); setConf(''); setMsg({ ok: true, texto: 'Senha trocada. Use a nova senha no próximo acesso.' });
  }

  return (
    <>
      <div className="titulo"><h1>Minha conta</h1></div>
      <section className="card">
        <h2>{eu.nome}</h2>
        <p className="mudo" style={{ margin: 0 }}>
          {PERFIL[eu.perfil]}{eu.perfil !== 'cliente' ? ` · ${SETOR[eu.setor]}` : ''}
          {eu.especialidades.length > 0 && ` · ${eu.especialidades.map((x) => ESPECIALIDADE[x]).join(', ')}`}
        </p>
      </section>
      <form className="card form" onSubmit={trocar}>
        <h2>Trocar senha</h2>
        <label>Nova senha<input type="password" value={nova} onChange={(e) => setNova(e.target.value)} autoComplete="new-password" required minLength={8} /></label>
        <label>Repita a nova senha<input type="password" value={conf} onChange={(e) => setConf(e.target.value)} autoComplete="new-password" required minLength={8} /></label>
        {msg && <p className={msg.ok ? 'mudo' : 'erro'} role="status">{msg.ok ? '✓ ' : ''}{msg.texto}</p>}
        <button className="primario" disabled={busy}>{busy ? 'Salvando…' : 'Trocar senha'}</button>
      </form>
      <p className="pequeno mudo"><Link to="/privacidade">Privacidade e dados pessoais</Link></p>
    </>
  );
}
