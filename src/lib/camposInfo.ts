import type { Cliente } from './types';

/**
 * Itens de checklist que pedem uma INFORMAÇÃO (e não um documento): em vez de só marcar, abrem um campo
 * que grava no cadastro do cliente, para os dados ficarem sempre atualizados. Documentos continuam como caixa de marcar.
 */
export interface CampoInfo { campo: keyof Cliente; rotulo: string; tipo: 'texto' | 'numero' | 'sim_nao' }
const REGRAS: [RegExp, CampoInfo][] = [
  [/^metragem/i, { campo: 'obra_metragem', rotulo: 'Metragem (m²)', tipo: 'numero' }],
  [/^endere[cç]o atual/i, { campo: 'end_logradouro', rotulo: 'Endereço atual', tipo: 'texto' }],
  [/^endere[cç]o da obra/i, { campo: 'obra_logradouro', rotulo: 'Endereço da obra', tipo: 'texto' }],
  [/^lote/i, { campo: 'obra_lote', rotulo: 'Lote', tipo: 'texto' }],
  [/^quadra/i, { campo: 'obra_quadra', rotulo: 'Quadra', tipo: 'texto' }],
  [/^nome completo/i, { campo: 'nome', rotulo: 'Nome completo', tipo: 'texto' }],
  [/^telefone/i, { campo: 'telefone', rotulo: 'Telefone', tipo: 'texto' }],
  [/^e-?mail/i, { campo: 'email', rotulo: 'E-mail', tipo: 'texto' }],
  [/^estado civil/i, { campo: 'estado_civil', rotulo: 'Estado civil', tipo: 'texto' }],
  [/^nacionalidade/i, { campo: 'nacionalidade', rotulo: 'Nacionalidade', tipo: 'texto' }],
  [/^profiss[aã]o/i, { campo: 'profissao', rotulo: 'Profissão', tipo: 'texto' }],
  [/inscri[cç][aã]o municipal/i, { campo: 'obra_inscricao_municipal', rotulo: 'Inscrição municipal', tipo: 'texto' }],
  [/^obra financiada/i, { campo: 'obra_financiada', rotulo: 'Obra financiada', tipo: 'sim_nao' }],
  [/^caso empresa: cnpj/i, { campo: 'empresa_cnpj', rotulo: 'CNPJ da empresa', tipo: 'texto' }],
  [/^caso empresa: raz[aã]o social/i, { campo: 'empresa_razao_social', rotulo: 'Razão social', tipo: 'texto' }],
];
export const campoDoItem = (texto: string | null | undefined): CampoInfo | null => (texto ? REGRAS.find(([re]) => re.test(texto.trim()))?.[1] ?? null : null);

/** Valor do campo já gravado no cadastro, em texto. */
export function valorCampo(c: Partial<Cliente> | null | undefined, k: CampoInfo): string {
  const v = c?.[k.campo];
  if (v === null || v === undefined) return '';
  if (k.tipo === 'sim_nao') return v === true ? 'sim' : v === false ? 'nao' : '';
  return String(v);
}
/** Converte o que foi digitado no valor que vai para o banco. */
export function valorParaBanco(k: CampoInfo, txt: string): string | number | boolean | null {
  const t = txt.trim();
  if (!t) return null;
  if (k.tipo === 'numero') { const n = Number(t.replace(',', '.')); return Number.isFinite(n) ? n : null; }
  if (k.tipo === 'sim_nao') return t === 'sim';
  return t;
}
