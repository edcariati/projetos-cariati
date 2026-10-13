import { supabase } from './supabase';
import { nomeServico, perfilPorId } from './servicos';

export interface Entregavel {
  id: string; projeto_id: string; texto: string; origem: 'perfil' | 'servico' | 'avulso'; servico_id: string | null;
  etapa_codigo: string | null; ordem: number; feito: boolean; feito_por: string | null; feito_em: string | null; nota: string | null;
}

interface Contrato { perfil?: string | null; entregas?: string[] | null; servicos?: string[] | null }

/** O que o contrato promete: as entregas do perfil (já ajustadas no cadastro) e os serviços marcados no catálogo. */
export function listaDoContrato(c: Contrato): { texto: string; origem: 'perfil' | 'servico'; servico_id: string | null }[] {
  const vistos = new Set<string>();
  const out: { texto: string; origem: 'perfil' | 'servico'; servico_id: string | null }[] = [];
  const add = (texto: string, origem: 'perfil' | 'servico', servico_id: string | null) => {
    const k = texto.trim().toLowerCase();
    if (!k || vistos.has(k)) return;
    vistos.add(k); out.push({ texto: texto.trim(), origem, servico_id });
  };
  for (const e of c.entregas ?? perfilPorId(c.perfil)?.entregas ?? []) add(e, 'perfil', null);
  for (const id of c.servicos ?? []) add(nomeServico(id).nome, 'servico', id);
  return out;
}

/** Acrescenta ao projeto o que o contrato tem e a lista ainda não: nunca remove nem desmarca nada. Devolve quantos itens entraram. */
export async function sincronizarEntregaveis(projetoId: string, c: Contrato): Promise<number> {
  const { data, error } = await supabase.from('projeto_entregaveis').select('texto,ordem').eq('projeto_id', projetoId);
  if (error) throw error;
  const atuais = (data as { texto: string; ordem: number }[]) ?? [];
  const tem = new Set(atuais.map((x) => x.texto.trim().toLowerCase()));
  let ordem = atuais.reduce((m, x) => Math.max(m, x.ordem), 0);
  const novos = listaDoContrato(c).filter((x) => !tem.has(x.texto.toLowerCase()))
    .map((x) => ({ projeto_id: projetoId, texto: x.texto, origem: x.origem, servico_id: x.servico_id, ordem: ++ordem }));
  if (!novos.length) return 0;
  const r = await supabase.from('projeto_entregaveis').insert(novos);
  if (r.error) throw r.error;
  return novos.length;
}
