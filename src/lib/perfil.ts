import { createContext, useContext } from 'react';
import type { Profile } from './types';

/** Perfil da pessoa logada (administrador, profissional ou cliente). */
export const PerfilCtx = createContext<Profile | null>(null);
export const usePerfil = () => useContext(PerfilCtx)!;

/** Banco de horas: administrador e quem é do setor Administrativo. */
export const podeBancoHoras = (p: Profile) =>
  p.perfil === 'admin' || (p.perfil === 'profissional' && p.setor === 'administrativo');

/** Quem edita o cadastro de clientes: administrador, Administrativo, Comercial e Financeiro. Os demais consultam. */
export const pessoaPodeEditarClientes = (p: Profile) =>
  p.perfil === 'admin' || (p.perfil === 'profissional' && ['administrativo', 'comercial', 'financeiro'].includes(p.setor));
