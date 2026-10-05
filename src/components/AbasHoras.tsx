import { NavLink } from 'react-router-dom';
import { podeBancoHoras, usePerfil } from '../lib/perfil';

/** Abas da área de horas: gestão (previsto × realizado), registros por etapa e banco de horas. */
export default function AbasHoras() {
  const eu = usePerfil();
  if (!podeBancoHoras(eu)) return null;
  return (
    <nav className="abas" aria-label="Horas">
      <NavLink to="/horas">Gestão de horas</NavLink>
      <NavLink to="/tempos">Registros por etapa</NavLink>
      <NavLink to="/banco-de-horas">Banco de horas</NavLink>
    </nav>
  );
}
