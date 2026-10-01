import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Cliente, Especialidade, Profile, Setor } from '../lib/types';
import { ESPECIALIDADE, PERFIL, SETOR } from '../lib/labels';
import { usePerfil } from '../lib/perfil';

/** Equipe e acessos: só o administrador. Aqui se define o que cada login enxerga. */
export default function Equipe() {
  const eu = usePerfil();
  const [pessoas, setPessoas] = useState<Profile[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    const [p, c] = await Promise.all([
      supabase.from('profiles').select('*').order('nome'),
      supabase.from('clientes').select('*').order('nome'),
    ]);
    setPessoas((p.data as Profile[]) ?? []); setClientes((c.data as Cliente[]) ?? []);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function salvar(id: string, campos: Partial<Profile>) {
    setErro('');
    const { error } = await supabase.from('profiles').update(campos).eq('id', id);
    if (error) setErro(error.message);
    await carregar();
  }
  const alternarEsp = (p: Profile, e: Especialidade) =>
    salvar(p.id, { especialidades: p.especialidades.includes(e) ? p.especialidades.filter((x) => x !== e) : [...p.especialidades, e] });

  return (
    <>
      <div className="titulo"><h1>Equipe e acessos</h1></div>
      <section className="aviso">
        <b>Como criar um novo acesso:</b> no Supabase, vá em <i>Authentication → Users → Add user</i>, informe e-mail e senha e marque
        “Auto Confirm User”. A pessoa aparece aqui na hora, sem acesso a nada até você definir o perfil.
        Para um cliente, escolha o perfil <i>Cliente</i> e vincule ao cadastro dele.
      </section>
      {erro && <p className="erro">{erro}</p>}
      <div className="pilha">
        {pessoas.map((p) => {
          const sou = p.id === eu.id;
          return (
            <div className={`card pessoa ${p.ativo ? '' : 'inativa'}`} key={p.id}>
              <div className="duas">
                <label>Nome<input id={`nome-${p.id}`} defaultValue={p.nome} onBlur={(e) => e.target.value.trim() && e.target.value !== p.nome && salvar(p.id, { nome: e.target.value.trim() })} /></label>
                <label>Perfil
                  <select id={`perfil-${p.id}`} value={p.perfil} disabled={sou} onChange={(e) => salvar(p.id, { perfil: e.target.value as Profile['perfil'] })}>
                    {Object.entries(PERFIL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
              </div>
              {p.perfil !== 'cliente' ? (
                <>
                  <div className="duas">
                  <label>Carga horária semanal (h)
                    <input id={`carga-${p.id}`} type="number" min={0} max={80} step={0.5} defaultValue={p.carga_semanal_horas}
                      onBlur={(e) => { const v = Number(e.target.value); if (v >= 0 && v <= 80 && v !== p.carga_semanal_horas) salvar(p.id, { carga_semanal_horas: v }); }} />
                  </label>
                  <label>Setor
                    <select id={`setor-${p.id}`} value={p.setor} onChange={(e) => salvar(p.id, { setor: e.target.value as Setor })}>
                      {Object.entries(SETOR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </label>
                  </div>
                  <fieldset>
                    <legend>Especialidades</legend>
                    <div className="etiquetas">
                      {(Object.keys(ESPECIALIDADE) as Especialidade[]).map((e) => (
                        <label className="check" key={e}><input type="checkbox" checked={p.especialidades.includes(e)} onChange={() => alternarEsp(p, e)} />{ESPECIALIDADE[e]}</label>
                      ))}
                    </div>
                  </fieldset>
                </>
              ) : (
                <label>Cliente vinculado
                  <select id={`cliente-${p.id}`} value={p.cliente_id ?? ''} onChange={(e) => salvar(p.id, { cliente_id: e.target.value || null })}>
                    <option value="">— escolha o cadastro do cliente —</option>
                    {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.codigo ? ` (${c.codigo})` : ''}</option>)}
                  </select>
                </label>
              )}
              <label className="check"><input type="checkbox" checked={p.ativo} disabled={sou} onChange={(e) => salvar(p.id, { ativo: e.target.checked })} />Acesso ativo{sou ? ' (você)' : ''}</label>
            </div>
          );
        })}
      </div>
      <p className="mudo pequeno">
        Profissional vê os projetos em que é o responsável ou está na equipe; quem é do setor Administrativo ou Comercial vê todos os projetos.
        O cliente vê somente o próprio projeto. Os tempos de todos só o administrador vê.
      </p>
    </>
  );
}
