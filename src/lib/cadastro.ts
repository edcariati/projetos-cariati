import type { Cliente } from './types';

/** Só dígitos. */
export const digitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

export function formatarCpf(s: string) { const d = digitos(s).slice(0, 11); return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'); }
export function formatarCnpj(s: string) { const d = digitos(s).slice(0, 14); return d.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2'); }
export const formatarDocumento = (s: string, tipo: 'fisica' | 'juridica') => (tipo === 'fisica' ? formatarCpf(s) : formatarCnpj(s));
/** Telefone sem o +55: só os dígitos de DDD e número. */
export function telefoneLocal(s: string | null | undefined): string {
  const bruto = (s ?? '').trim();
  let d = digitos(bruto);
  if (bruto.startsWith('+') && d.startsWith('55')) d = d.slice(2);
  else if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  return d.slice(0, 11);
}
/** Formato convencional: +55 (DD) 9XXXX-XXXX (fixo: +55 (DD) XXXX-XXXX). Ajusta enquanto se digita. */
export function formatarTelefone(s: string): string {
  const d = telefoneLocal(s);
  if (!d) return '';
  if (d.length <= 2) return `+55 (${d}`;
  const ddd = d.slice(0, 2), r = d.slice(2);
  if (r.length <= (r[0] === '9' ? 5 : 4)) return `+55 (${ddd}) ${r}`;
  if (d.length <= 10 && r[0] !== '9') return `+55 (${ddd}) ${r.slice(0, 4)}-${r.slice(4)}`;
  return `+55 (${ddd}) ${r.slice(0, 5)}-${r.slice(5)}`;
}
/** Mensagem de erro do telefone (vazio = ok ou não preenchido). */
export function erroTelefone(s: string | null | undefined): string {
  const d = telefoneLocal(s);
  if (!d) return '';
  if (d.length < 10) return `Faltam ${10 - d.length} número(s): informe o DDD e o telefone.`;
  if (d.length === 11 && d[2] !== '9') return 'Celular com 11 números começa com 9 depois do DDD.';
  if (d[0] === '0' || d[1] === '0') return 'O DDD não pode começar com 0.';
  return '';
}
/** Mensagem de erro do e-mail (vazio = ok ou não preenchido). */
export function erroEmail(s: string | null | undefined): string {
  const e = (s ?? '').trim();
  if (!e) return '';
  if (/\s/.test(e)) return 'O e-mail não pode ter espaços.';
  if (!e.includes('@')) return 'Falta o “@” no e-mail.';
  const [u, d, ...mais] = e.split('@');
  if (mais.length) return 'O e-mail tem mais de um “@”.';
  if (!u) return 'Falta o nome antes do “@”.';
  if (!d) return 'Falta o domínio depois do “@” (ex.: gmail.com).';
  if (!d.includes('.')) return 'Falta o final do domínio (ex.: .com ou .com.br).';
  if (/\.\.|^\.|\.$/.test(d)) return 'O domínio do e-mail está incompleto.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s.]{2,}$/.test(e)) return 'Confira o e-mail: parece haver um erro de digitação.';
  return '';
}
/** Próximo código de cliente: maior código no formato CA000000 mais um (ex.: último CA270101, próximo CA270102). */
export function proximoCodigo(codigos: (string | null | undefined)[]): { ultimo: string | null; proximo: string } {
  let maior = -1, ultimo: string | null = null, prefixo = 'CA', largura = 6;
  for (const c of codigos) {
    const m = /^([A-Z]{2})(\d{4,8})$/.exec((c ?? '').trim().toUpperCase());
    if (m && Number(m[2]) > maior) { maior = Number(m[2]); ultimo = m[0]; prefixo = m[1]; largura = m[2].length; }
  }
  if (maior < 0) { const a = String(new Date().getFullYear()).slice(2); return { ultimo: null, proximo: `CA${a}0101` }; }
  return { ultimo, proximo: prefixo + String(maior + 1).padStart(largura, '0') };
}
export const formatarCep = (s: string) => { const d = digitos(s).slice(0, 8); return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; };

export function cpfValido(s: string) {
  const d = digitos(s);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n: number) => { let soma = 0; for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i); const r = (soma * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}
export function cnpjValido(s: string) {
  const d = digitos(s);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n: number) => { const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const soma = pesos.reduce((s, p, i) => s + p * Number(d[i]), 0); const r = soma % 11; return r < 2 ? 0 : 11 - r; };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
export const ESTADOS_CIVIS = ['Solteiro(a)', 'Casado(a)', 'União estável', 'Divorciado(a)', 'Viúvo(a)', 'Separado(a)'];
export const INTENCOES = ['Residencial', 'Comercial', 'Institucional', 'Industrial', 'Misto', 'Reforma', 'Ampliação', 'Interiores', 'Outro'];
export const ORIGENS = ['Indicação de cliente', 'Indicação de profissional', 'Instagram', 'Google', 'Site', 'Parceiro', 'Já era cliente', 'Outro'];
export const CONTATOS = [['whatsapp', 'WhatsApp'], ['telefone', 'Ligação'], ['email', 'E-mail']] as const;

/** Campos que o levantamento de dados do protocolo pede, para mostrar quanto do cadastro já está completo. */
export function completude(c: Partial<Cliente>): { pct: number; faltando: string[] } {
  const checks: [string, unknown][] = [
    ['Nome', c.nome], ['CPF/CNPJ', c.documento], ['Telefone', c.telefone || c.whatsapp], ['E-mail', c.email],
    ['Endereço atual', c.end_logradouro && c.end_cidade], ['Endereço da obra', c.obra_logradouro && c.obra_cidade],
    ['Intenção da obra', c.obra_intencao], ['Metragem aproximada', c.obra_metragem],
    ['Lote e quadra', c.obra_lote && c.obra_quadra], ['Inscrição municipal (IPTU)', c.obra_inscricao_municipal],
    ['Matrícula', c.obra_matricula], ['Estado civil', c.tipo_pessoa === 'juridica' ? 'n/a' : c.estado_civil],
    ['Profissão', c.tipo_pessoa === 'juridica' ? 'n/a' : c.profissao], ['Obra financiada (sim ou não)', c.obra_financiada === null || c.obra_financiada === undefined ? '' : 'ok'],
    ...(c.tipo_pessoa === 'juridica' ? ([['Razão social', c.empresa_razao_social], ['Responsável que assina', c.empresa_responsavel]] as [string, unknown][]) : []),
  ];
  const feitos = checks.filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false).length;
  return { pct: Math.round((feitos / checks.length) * 100), faltando: checks.filter(([, v]) => v === undefined || v === null || v === '' || v === false).map(([k]) => k) };
}

export const enderecoLinha = (c: Partial<Cliente>, p: 'end' | 'obra') => {
  const g = (k: string) => (c as Record<string, unknown>)[`${p}_${k}`] as string | null | undefined;
  const rua = [g('logradouro'), g('numero')].filter(Boolean).join(', ');
  return [rua, g('complemento'), g('bairro'), [g('cidade'), g('uf')].filter(Boolean).join('/')].filter(Boolean).join(' · ');
};
