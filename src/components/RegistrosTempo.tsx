import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Tempo } from '../lib/types';
import { fmtDur } from '../lib/labels';
import { LIMITE_ESQUECIDO_SEG, ajustarTempo, aoMudar, excluirTempo, lancarTempo, pararEmHorario, segundosEntre } from '../lib/tempo';

const paraCampo = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const deCampo = (v: string) => new Date(v);
const fmtDH = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Registros de tempo de uma etapa: lista de sessões, lançamento manual e correção de horários
 * (cronômetro esquecido ligado, aba fechada, queda de rede). O relógio fica só na linha da etapa e na faixa do topo.
 */
export default function RegistrosTempo({ projetoId, etapaCodigo, meuId, admin, nomes }: {
  projetoId: string; etapaCodigo: string; meuId: string; admin: boolean; nomes: Map<string, string>;
}) {
  const [lista, setLista] = useState<Tempo[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [ini, setIni] = useState(''); const [fim, setFim] = useState('');
  const [novo, setNovo] = useState(false);
  const [nota, setNota] = useState('');
  const [erro, setErro] = useState('');

  const carregar = useCallback(() => {
    supabase.from('tempos').select('*').eq('projeto_id', projetoId).eq('etapa_codigo', etapaCodigo).order('iniciado_em', { ascending: false })
      .then(({ data }) => setLista((data as Tempo[]) ?? []));
  }, [projetoId, etapaCodigo]);
  useEffect(() => { carregar(); return aoMudar(() => carregar()); }, [carregar]);

  const total = lista.filter((t) => t.finalizado_em).reduce((s, t) => s + segundosEntre(t.iniciado_em, t.finalizado_em), 0);
  const agir = async (fn: () => Promise<void>) => { setErro(''); try { await fn(); setEditando(null); setNovo(false); setNota(''); } catch (e) { setErro((e as Error).message); } };
  const podeMexer = (t: Tempo) => admin || t.usuario_id === meuId;

  function abrirNovo() { const f = new Date(); const i = new Date(f.getTime() - 3600_000); setIni(paraCampo(i.toISOString())); setFim(paraCampo(f.toISOString())); setNovo(true); setEditando(null); }

  return (
    <details className="registros-tempo">
      <summary><b>Registros de tempo</b> <span className="mudo pequeno">{lista.length} registro(s) · {fmtDur(total)} fechados</span></summary>
      {lista.length === 0 && <p className="mudo pequeno">Nenhum tempo registrado ainda. Use ▶ na linha da etapa ou lance o tempo à mão.</p>}
      <ul className="pilha">
        {lista.map((t) => {
          const rodando = !t.finalizado_em;
          const longo = rodando && segundosEntre(t.iniciado_em, null) > LIMITE_ESQUECIDO_SEG;
          return (
            <li key={t.id} className="reg-tempo">
              {editando === t.id ? (
                <div className="linha-form">
                  <label>Início<input type="datetime-local" value={ini} onChange={(e) => setIni(e.target.value)} /></label>
                  <label>{rodando ? 'Parou às' : 'Fim'}<input type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} /></label>
                  <button className="primario" onClick={() => agir(() => (rodando ? pararEmHorario(t.id, deCampo(fim)) : ajustarTempo(t.id, deCampo(ini), deCampo(fim))))}>Salvar</button>
                  <button onClick={() => setEditando(null)}>Cancelar</button>
                </div>
              ) : (
                <>
                  <span>{nomes.get(t.usuario_id) ?? '—'} · {fmtDH(t.iniciado_em)} → {rodando ? <b>rodando</b> : fmtDH(t.finalizado_em!)}</span>
                  <b>{rodando ? fmtDur(segundosEntre(t.iniciado_em, null)) : fmtDur(segundosEntre(t.iniciado_em, t.finalizado_em))}</b>
                  {t.manual && <span className="tag">lançado à mão</span>}
                  {t.nota && <span className="mudo pequeno"> — {t.nota}</span>}
                  {longo && <span className="erro pequeno">Rodando há muito tempo: confira e ajuste o horário em que parou.</span>}
                  {podeMexer(t) && (
                    <span className="reg-acoes">
                      <button className="link" onClick={() => { setEditando(t.id); setNovo(false); setIni(paraCampo(t.iniciado_em)); setFim(paraCampo(t.finalizado_em ?? new Date().toISOString())); }}>{rodando ? 'Parar em outro horário' : 'Ajustar'}</button>
                      {!rodando && <button className="link perigo" onClick={() => { if (confirm('Excluir este registro de tempo?')) agir(() => excluirTempo(t.id)); }}>Excluir</button>}
                    </span>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
      {novo ? (
        <div className="linha-form">
          <label>Início<input type="datetime-local" value={ini} onChange={(e) => setIni(e.target.value)} /></label>
          <label>Fim<input type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} /></label>
          <label>Motivo (opcional)<input value={nota} placeholder="ex.: esqueci de ligar" onChange={(e) => setNota(e.target.value)} /></label>
          <button className="primario" onClick={() => agir(() => lancarTempo(projetoId, etapaCodigo, deCampo(ini), deCampo(fim), nota))}>Lançar tempo</button>
          <button onClick={() => setNovo(false)}>Cancelar</button>
        </div>
      ) : <button onClick={abrirNovo}>+ Lançar tempo à mão</button>}
      {erro && <p className="erro pequeno">{erro}</p>}
    </details>
  );
}
