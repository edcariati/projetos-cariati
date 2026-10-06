import type { Profile } from '../lib/types';
import { podeBancoHoras } from '../lib/perfil';

export interface ItemMenu { to: string; rotulo: string; icone: string; grupo: string; end?: boolean }

/** Páginas do menu, conforme o perfil de quem entrou. */
export function itensMenu(eu: Profile): ItemMenu[] {
  const admin = eu.perfil === 'admin';
  const l: ItemMenu[] = [];
  if (admin) l.push({ to: '/', rotulo: 'Visão geral', icone: 'visao', grupo: 'Principal', end: true });
  l.push({ to: admin ? '/painel' : '/', rotulo: 'Painel', icone: 'painel', grupo: 'Principal', end: true });
  l.push({ to: '/projetos', rotulo: 'Projetos', icone: 'projetos', grupo: 'Principal' });
  l.push({ to: '/tarefas', rotulo: 'Minhas tarefas', icone: 'tarefas', grupo: 'Principal' });
  l.push({ to: '/clientes', rotulo: 'Clientes', icone: 'clientes', grupo: 'Relacionamento' });
  l.push({ to: '/protocolos', rotulo: 'Protocolos', icone: 'protocolos', grupo: 'Relacionamento' });
  l.push(podeBancoHoras(eu) ? { to: '/horas', rotulo: 'Horas', icone: 'horas', grupo: 'Gestão' } : { to: '/tempos', rotulo: 'Tempos', icone: 'horas', grupo: 'Gestão' });
  l.push({ to: '/fluxo', rotulo: 'Fluxo', icone: 'fluxo', grupo: 'Gestão' });
  if (admin) {
    l.push({ to: '/equipe', rotulo: 'Equipe', icone: 'equipe', grupo: 'Administração' });
    l.push({ to: '/cadastros', rotulo: 'Cadastros', icone: 'cadastros', grupo: 'Administração' });
  }
  return l;
}

export interface Favorito { to: string; rotulo: string }
const CHAVE = 'favoritos-cariati';
export function lerFavoritos(): Favorito[] {
  try { const v = JSON.parse(localStorage.getItem(CHAVE) ?? '[]'); return Array.isArray(v) ? v.slice(0, 6) : []; } catch { return []; }
}
export function gravarFavoritos(f: Favorito[]) { try { localStorage.setItem(CHAVE, JSON.stringify(f.slice(0, 6))); } catch { /* sem armazenamento */ } }
