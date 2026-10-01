import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { personaAtual, personas, trocarPersona } from '../lib/demo';

/** Só na demonstração: permite entrar como cada tipo de usuário para testar o que cada um vê. */
export default function DemoBarra() {
  const nav = useNavigate();
  const [id, setId] = useState(personaAtual());
  return (
    <div className="demo">
      <span>Demonstração com dados de exemplo. Ver como:</span>
      <select id="demo-persona" value={id} onChange={(e) => { setId(e.target.value); trocarPersona(e.target.value); nav('/'); }}>
        {personas.map((p) => <option key={p.id} value={p.id}>{p.nome} — {p.rotulo}</option>)}
      </select>
    </div>
  );
}
