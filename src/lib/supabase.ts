import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { demoClient } from './demo';

export const demo = Boolean(import.meta.env.VITE_DEMO);

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configurado = demo || Boolean(url && key);
export const supabase: SupabaseClient = demo ? (demoClient as SupabaseClient) : createClient(url ?? 'http://localhost', key ?? 'sem-chave');
