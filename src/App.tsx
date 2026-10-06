import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configurado, demo, supabase } from './lib/supabase';
import { aoMudarPersona } from './lib/demo';
import { PerfilCtx } from './lib/perfil';
import type { Profile } from './lib/types';
import Login from './pages/Login';
import AppEquipe from './AppEquipe';
import AppCliente from './AppCliente';
import DemoBarra from './components/DemoBarra';
import { DialogHost } from './components/Dialogo';
import Atmosfera from './ui/Atmosfera';
import { AvisosHost } from './ui/avisos';
import { Carregando } from './ui/Holo';

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [perfil, setPerfil] = useState<Profile | null | undefined>(undefined);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  // Na demonstração, trocar de perfil reinicia a área exibida
  useEffect(() => {
    if (!demo) return;
    return aoMudarPersona(() => {
      supabase.auth.getSession().then(({ data }) => { setSession(data.session); setVersao((v) => v + 1); });
    });
  }, []);

  const uid = session?.user.id;
  useEffect(() => {
    if (!uid) return;
    setPerfil(undefined);
    supabase.from('profiles').select('*').eq('id', uid).single()
      .then(({ data }) => setPerfil((data as Profile) ?? null));
  }, [uid, versao]);

  if (!configurado) {
    return (
      <div className="centro"><div className="card">
        <h2>Configure o Supabase</h2>
        <p>Crie o arquivo <code>.env</code> a partir de <code>.env.example</code> com a URL e a chave anon do projeto.</p>
      </div></div>
    );
  }
  const fundo = <><Atmosfera /><AvisosHost /></>;
  if (session === undefined) return <>{fundo}<div className="centro"><Carregando tipo="cartoes" n={1} /></div></>;
  if (!session) return <>{fundo}<Login /></>;
  if (perfil === undefined) return <>{fundo}<div className="centro"><Carregando tipo="cartoes" n={1} /></div></>;
  if (!perfil || !perfil.ativo) {
    return (
      <><Atmosfera /><div className="centro"><div className="card">
        <h2>Acesso ainda não liberado</h2>
        <p>Seu login existe, mas o escritório ainda não definiu o que você pode ver. Fale com o administrador.</p>
        <button onClick={() => supabase.auth.signOut()}>Sair</button>
      </div></div></>
    );
  }

  return (
    <PerfilCtx.Provider value={perfil}>
      <div className="app" key={versao}>
        {fundo}
        <DialogHost />
        {demo && <DemoBarra />}
        {perfil.perfil === 'cliente' ? <AppCliente /> : <AppEquipe />}
      </div>
    </PerfilCtx.Provider>
  );
}
