import { createContext, useContext } from 'react';
import type { Profile } from './types';

/** Perfil da pessoa logada (administrador, profissional ou cliente). */
export const PerfilCtx = createContext<Profile | null>(null);
export const usePerfil = () => useContext(PerfilCtx)!;

/** Banco de horas: administrador e quem é do setor Administrativo. */
/** Quem enxerga o escritório inteiro: administrador e gestor (o gestor só consulta, não altera). */
export const verTudo = (p: Profile) => p.perfil === 'admin' || p.perfil === 'gestor';
/** Arquiteto parceiro: trabalha nos próprios projetos e clientes, sem ver rendimento de horas nem prazos. */
export const ehParceiro = (p: Profile) => p.perfil === 'profissional' && p.setor === 'projetos';

export const podeBancoHoras = (p: Profile) =>
  p.perfil === 'admin' || p.perfil === 'gestor' || (p.perfil === 'profissional' && p.setor === 'administrativo');

/** Quem edita o cadastro de clientes: administrador, Administrativo, Comercial e Financeiro. Os demais consultam. */
export const pessoaPodeEditarClientes = (p: Profile) =>
  p.perfil === 'admin' || (p.perfil === 'profissional' && ['administrativo', 'comercial', 'financeiro'].includes(p.setor));
