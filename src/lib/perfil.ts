import { createContext, useContext } from 'react';
import type { Profile } from './types';

/** Perfil da pessoa logada (administrador, profissional ou cliente). */
export const PerfilCtx = createContext<Profile | null>(null);
export const usePerfil = () => useContext(PerfilCtx)!;
