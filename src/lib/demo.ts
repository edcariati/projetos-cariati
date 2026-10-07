/* Modo demonstração (VITE_DEMO=1): banco em memória com dados de exemplo.
   Imita só o que o app usa do supabase-js. Nada é salvo e nada sai do navegador. */
import { PADRAO } from './catalogoPadrao';
import { REF_PADRAO } from './kpis';
import sqlEtapas from '../../supabase/migrations/0002_seed_etapas.sql?raw';
import sqlDocs from '../../supabase/migrations/0004_seed_documentos.sql?raw';
import sqlHoras from '../../supabase/migrations/0014_horas_estimadas.sql?raw';
import { TAREFAS } from './protocolos';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

function parseTuples(sql: string): any[][] {
  let body = sql.slice(sql.toLowerCase().indexOf('values') + 6);
  const fim = body.toLowerCase().indexOf('on conflict');
  if (fim > -1) body = body.slice(0, fim);
  const rows: any[][] = [];
  let i = 0;
  while (i < body.length) {
    if (body[i] !== '(') { i++; continue; }
    i++;
    const campos: string[] = [];
    let atual = '', aspas = false;
    for (; i < body.length; i++) {
      const c = body[i];
      if (aspas) {
        if (c === "'" && body[i + 1] === "'") { atual += "''"; i++; }
        else { if (c === "'") aspas = false; atual += c; }
      } else if (c === "'") { aspas = true; atual += c; }
      else if (c === ',') { campos.push(atual.trim()); atual = ''; }
      else if (c === ')') { campos.push(atual.trim()); i++; break; }
      else atual += c;
    }
    rows.push(campos.map((f) => {
      if (f.startsWith("'")) {
        const s = f.slice(1, -1).replace(/''/g, "'");
        return s.startsWith('{') && s.endsWith('}') ? (s.length > 2 ? s.slice(1, -1).split(',') : []) : s;
      }
      if (f === 'null') return null;
      if (f === 'true') return true;
      if (f === 'false') return false;
      return Number(f);
    }));
  }
  return rows;
}

const uid = () => globalThis.crypto?.randomUUID?.() ?? 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
const dia = (d: number) => new Date(Date.now() + d * 86_400_000);
const iso = (d: number) => dia(d).toISOString();
const data = (d: number) => dia(d).toISOString().slice(0, 10);

/* ---------- quem está "logado" na demonstração ---------- */
export const personas = [
  { id: 'demo', email: 'cariati@cariati.com.br', nome: 'Edson Cariati', rotulo: 'Administrador (vê tudo)' },
  { id: 'marina', email: 'marina@cariati.com.br', nome: 'Marina Souza', rotulo: 'Arquiteta (Residência Silva, Casa de Praia, Apto. Lima)' },
  { id: 'rafael', email: 'rafael@cariati.com.br', nome: 'Rafael Lima', rotulo: 'Arq. de interiores (Loja Centro, Sobrado Costa)' },
  { id: 'julia', email: 'julia@cariati.com.br', nome: 'Júlia Prado', rotulo: 'Administrativo (agendamentos, vê todos os projetos)' },
  { id: 'cliente', email: 'ana.oliveira@email.com', nome: 'Ana Oliveira', rotulo: 'Cliente (Casa de Praia Oliveira)' },
];
let eu = 'demo';
export const personaAtual = () => eu;
export const trocarPersona = (id: string) => { eu = id; window.dispatchEvent(new Event('persona-mudou')); };
export const aoMudarPersona = (fn: () => void) => { window.addEventListener('persona-mudou', fn); return () => window.removeEventListener('persona-mudou', fn); };

const db: Record<string, Row[]> = {
  profiles: [
    { id: 'demo', email: 'cariati@cariati.com.br', nome: 'Edson Cariati', setor: 'projetos', perfil: 'admin', especialidades: ['arquitetonico', 'legal'], cliente_id: null, ativo: true, carga_semanal_horas: 10 },
    { id: 'marina', email: 'marina@cariati.com.br', nome: 'Marina Souza', setor: 'projetos', perfil: 'profissional', especialidades: ['arquitetonico', 'legal'], cliente_id: null, ativo: true, carga_semanal_horas: 40 },
    { id: 'rafael', email: 'rafael@cariati.com.br', nome: 'Rafael Lima', setor: 'projetos', perfil: 'profissional', especialidades: ['interiores', 'complementares'], cliente_id: null, ativo: true, carga_semanal_horas: 40 },
    { id: 'julia', email: 'julia@cariati.com.br', nome: 'Júlia Prado', setor: 'administrativo', perfil: 'profissional', especialidades: [], cliente_id: null, ativo: true, carga_semanal_horas: 40 },
    { id: 'cliente', email: 'ana.oliveira@email.com', nome: 'Ana Oliveira', setor: 'projetos', perfil: 'cliente', especialidades: [], cliente_id: null, ativo: true, carga_semanal_horas: 0 },
  ],
  servico_categorias: [], servico_itens: [], perfis_cliente: [], parceiros: [], clientes: [], etapa_modelos: [], projetos: [], projeto_etapas: [], historico: [], projeto_equipe: [],
  protocolos: [], protocolo_andamentos: [], documento_modelos: [], projeto_documentos: [], tempos: [], banco_horas_ajustes: [], projeto_tarefas: [], projeto_tarefa_itens: [],
};

const COLS_ETAPA = ['codigo', 'ordem', 'fase', 'titulo', 'rotulo', 'setores', 'cliente_participa', 'entrada', 'saida', 'regra', 'opcional', 'aceite_formal', 'escopo'];
db.etapa_modelos = parseTuples(sqlEtapas).map((t) => Object.fromEntries(COLS_ETAPA.map((c, k) => [c, t[k]])));
// ajustes feitos pela migration 0009 sobre os modelos de etapa
Object.assign(db.etapa_modelos.find((m) => m.codigo === '01')!, { titulo: 'Levantamento de dados e contrato', entrada: 'Primeiro contato do cliente', saida: 'Contrato assinado e oportunidade promovida a projeto' });
db.etapa_modelos.push(
  { codigo: 'H1', ordem: 31, fase: 6, titulo: 'Habite-se: documentos', rotulo: 'Documentos', setores: ['projetos', 'terceiros'], cliente_participa: true, entrada: 'Obra pronta ou regularização concluída', saida: 'Documentos e relatório fotográfico prontos', regra: 'Solicitado após a etapa de regularização ou depois que a obra ficar pronta', opcional: true, aceite_formal: false, escopo: 'habitese' },
  { codigo: 'H2', ordem: 32, fase: 6, titulo: 'Habite-se: entrada na Prefeitura', rotulo: 'Prefeitura', setores: ['projetos', 'administrativo', 'terceiros'], cliente_participa: false, entrada: 'Documentos prontos', saida: 'Processo deferido', regra: 'Taxas do Habite-se e do ISS seguem para o financeiro; os comprovantes são anexados no Aprova Digital', opcional: true, aceite_formal: false, escopo: 'habitese' },
  { codigo: 'H3', ordem: 33, fase: 6, titulo: 'Habite-se: entrega dos documentos aprovados', rotulo: 'Entrega', setores: ['projetos', 'administrativo'], cliente_participa: true, entrada: 'Processo deferido', saida: 'Documentos entregues com termo de retirada', regra: 'Imprimir os documentos aprovados e os emitidos pela Prefeitura e emitir o termo de retirada', opcional: true, aceite_formal: false, escopo: 'habitese' },
);
// horas padrão por etapa: mesma tabela da migration 0014
const HORAS = new Map([...sqlHoras.matchAll(/\('([A-Z0-9]+)',([\d.]+)\)/g)].map((m) => [m[1], Number(m[2])]));
db.etapa_modelos.forEach((m) => { m.horas_padrao = HORAS.get(m.codigo) ?? 0; });
db.documento_modelos = parseTuples(sqlDocs).map((t) => ({ id: uid(), etapa_codigo: t[0], nome: t[1], padrao_arquivo: t[2], ordem: t[3] }));
([['H1', 'Termo de Habite-se', 'TDH_CAXXXXXX_REVXX'], ['H1', 'Declaração de veracidade', 'TDV_CAXXXXXX_REVXX'], ['H1', 'Procuração (pessoa física ou jurídica)', 'PRC_CAXXXXXX_REVXX'],
  ['H1', 'Declaração de CTRS', 'CTR_CAXXXXXX_REVXX'], ['H1', 'Isenção da CTRS', 'ICTR_CAXXXXXX_REVXX'], ['H1', 'Relatório fotográfico', null], ['H3', 'Termo de retirada de documento', 'TDRD_CAXXXXXX_REVXX']] as [string, string, string | null][])
  .forEach(([e, n, c], k) => db.documento_modelos.push({ id: uid(), etapa_codigo: e, nome: n, padrao_arquivo: c, ordem: k + 1 }));

/* ---------- regras de acesso (espelham o RLS do banco) ---------- */
const perfilEu = () => db.profiles.find((p) => p.id === eu)!;
const podeBanco = () => { const p = perfilEu(); return p.perfil === 'admin' || (p.perfil === 'profissional' && p.setor === 'administrativo'); };
function verProjeto(pid: string) {
  const pr = db.projetos.find((x) => x.id === pid); const p = perfilEu();
  if (!pr) return false;
  if (p.perfil === 'admin') return true;
  if (p.perfil === 'cliente') return pr.cliente_id === p.cliente_id;
  return pr.responsavel_id === eu || db.projeto_equipe.some((e) => e.projeto_id === pid && e.usuario_id === eu)
    || ['administrativo', 'comercial', 'financeiro'].includes(p.setor);
}
function ver(t: string, r: Row): boolean {
  const p = perfilEu(); const cli = p.perfil === 'cliente';
  switch (t) {
    case 'projetos': return verProjeto(r.id);
    case 'clientes': return cli ? r.id === p.cliente_id : true;
    case 'projeto_etapas': case 'protocolos': return verProjeto(r.projeto_id);
    case 'projeto_equipe': case 'historico': return !cli && verProjeto(r.projeto_id);
    case 'protocolo_andamentos': return !cli;
    case 'projeto_documentos': return verProjeto(r.projeto_id) && (!cli || r.visivel_cliente);
    case 'tempos': return podeBanco() || r.usuario_id === eu;
    case 'banco_horas_ajustes': return podeBanco() || r.usuario_id === eu;
    case 'projeto_tarefas': case 'projeto_tarefa_itens': return !cli && verProjeto(r.projeto_id);
    case 'etapa_modelos': case 'documento_modelos': case 'parceiros': case 'servico_categorias': case 'servico_itens': case 'perfis_cliente': return !cli;
    case 'profiles': return !cli || r.id === eu || db.projetos.some((pr) => pr.responsavel_id === r.id && pr.cliente_id === p.cliente_id);
    default: return true;
  }
}

const REL: Record<string, Record<string, { t: string; fk: string; many: boolean }>> = {
  projetos: {
    clientes: { t: 'clientes', fk: 'cliente_id', many: false }, projeto_etapas: { t: 'projeto_etapas', fk: 'projeto_id', many: true },
    profiles: { t: 'profiles', fk: 'responsavel_id', many: false },
  },
  protocolos: { projetos: { t: 'projetos', fk: 'projeto_id', many: false } },
  historico: { profiles: { t: 'profiles', fk: 'autor_id', many: false }, projetos: { t: 'projetos', fk: 'projeto_id', many: false } },
  tempos: { projetos: { t: 'projetos', fk: 'projeto_id', many: false }, profiles: { t: 'profiles', fk: 'usuario_id', many: false } },
  projeto_equipe: { profiles: { t: 'profiles', fk: 'usuario_id', many: false } },
};

function splitTop(s: string): string[] {
  const out: string[] = []; let d = 0, cur = '';
  for (const c of s) {
    if (c === '(') d++;
    if (c === ')') d--;
    if (c === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function expand(table: string, row: Row, sel: string): Row {
  const out = { ...row };
  for (const item of splitTop(sel)) {
    const m = item.match(/^(\w+)\(([\s\S]*)\)$/);
    if (!m) continue;
    const rel = REL[table]?.[m[1]];
    if (!rel) continue;
    out[m[1]] = rel.many
      ? db[rel.t].filter((r) => r[rel.fk] === row.id && ver(rel.t, r)).map((r) => expand(rel.t, r, m[2]))
      : (() => { const r = db[rel.t].find((x) => x.id === row[rel.fk]); return r && ver(rel.t, r) ? expand(rel.t, r, m[2]) : null; })();
  }
  return out;
}

function instanciarEtapas(p: Row) {
  for (const m of db.etapa_modelos) {
    const naoAplic = m.fase === 5 || (m.escopo === 'legal' && !p.tem_legal) ||
      (m.escopo === 'interiores' && !p.tem_interiores) || (m.escopo === 'complementares' && !p.tem_complementares) ||
      (m.escopo === 'habitese' && !p.tem_habitese) || (p.tipo_estudo === 'mais_projetos' && ['11', '12', '13', '14'].includes(m.codigo));
    db.projeto_etapas.push({
      id: uid(), projeto_id: p.id, etapa_codigo: m.codigo, status: naoAplic ? 'nao_aplicavel' : 'pendente',
      responsavel_id: null, iniciada_em: null, concluida_em: null, rodadas_ajuste: 0, observacao: null,
    });
  }
  const e1 = db.projeto_etapas.find((e) => e.projeto_id === p.id && e.etapa_codigo === '01')!;
  e1.status = 'em_andamento'; e1.iniciada_em = new Date().toISOString();
  db.historico.push({ id: uid(), projeto_id: p.id, etapa_codigo: '01', tipo: 'etapa_iniciada', texto: 'Projeto criado', autor_id: eu, created_at: new Date().toISOString() });
  for (const e of db.projeto_etapas.filter((x) => x.projeto_id === p.id && x.status !== 'nao_aplicavel')) {
    const fase = db.etapa_modelos.find((m) => m.codigo === e.etapa_codigo)!.fase;
    if (fase <= 4 || fase === 6) inserirTarefas(p.id, e.etapa_codigo, ['todas', p.tipo_estudo ?? 'padrao']);
  }
}

/** Setor que cuida da etapa e profissional que faz a tarefa (mesma regra do banco: especialidade na equipe, senão o responsável). */
const filaEtapa = (cod: string): string | null => db.etapa_modelos.find((m) => m.codigo === cod)?.setores.find((x: string) => x !== 'terceiros') ?? null;
function responsavelEtapa(pid: string, cod: string): string | null {
  if (filaEtapa(cod) !== 'projetos') return null;
  const esp = cod === '15' ? 'arquitetonico' : ['16', 'H1', 'H2', 'H3'].includes(cod) ? 'legal' : ['17', '18'].includes(cod) ? 'interiores' : cod === '19' ? 'complementares' : null;
  const membro = esp ? db.projeto_equipe.find((e) => e.projeto_id === pid && e.especialidade === esp) : null;
  return membro?.usuario_id ?? db.projetos.find((p) => p.id === pid)?.responsavel_id ?? null;
}
function atribuirTarefas(pid: string) {
  for (const t of db.projeto_tarefas.filter((x) => x.projeto_id === pid && !x.atribuicao_manual)) {
    if (!db.projeto_tarefa_itens.some((i) => i.tarefa_id === t.id && i.feito)) t.responsavel_id = responsavelEtapa(pid, t.etapa_codigo);
  }
}

/** Copia as tarefas do protocolo para o projeto (uma vez por etapa), como a função do banco. */
function inserirTarefas(projetoId: string, etapa: string, variantes: string[]): number {
  if (db.projeto_tarefas.some((t) => t.projeto_id === projetoId && t.etapa_codigo === etapa)) return 0;
  let n = 0;
  for (const m of TAREFAS.filter((t) => t.etapa === etapa && variantes.includes(t.variante)).sort((a, b) => a.ordem - b.ordem)) {
    const tid = uid();
    db.projeto_tarefas.push({ id: tid, projeto_id: projetoId, etapa_codigo: etapa, ordem: m.ordem, titulo: m.titulo, descricao: m.descricao, prioridade: m.prioridade, responsavel_id: responsavelEtapa(projetoId, etapa), setor_fila: filaEtapa(etapa), atribuicao_manual: false });
    const textos: (string | null)[] = m.itens.length ? m.itens : [null];
    textos.forEach((texto, k) => db.projeto_tarefa_itens.push({ id: uid(), tarefa_id: tid, projeto_id: projetoId, ordem: k + 1, texto, feito: false, feito_por: null, feito_em: null }));
    n++;
  }
  return n;
}

const DEFAULTS: Record<string, () => Row> = {
  clientes: () => ({
    servicos: [], servico_estudo: null, servico_aprovacao: null, servicos_observacao: null,
    codigo: null, categoria: null, premium: false, telefone: null, email: null, observacoes: null, tipo_pessoa: 'fisica', documento: null, rg: null, data_nascimento: null,
    estado_civil: null, nacionalidade: null, profissao: null, telefone2: null, whatsapp: null, contato_preferido: null, origem: null, indicado_por: null,
    end_cep: null, end_logradouro: null, end_numero: null, end_complemento: null, end_bairro: null, end_cidade: null, end_uf: null,
    empresa_razao_social: null, empresa_cnpj: null, empresa_responsavel: null, empresa_responsavel_cpf: null,
    obra_intencao: null, obra_metragem: null, obra_cep: null, obra_logradouro: null, obra_numero: null, obra_complemento: null, obra_bairro: null, obra_cidade: null, obra_uf: null,
    obra_condominio: null, obra_lote: null, obra_quadra: null, obra_inscricao_municipal: null, obra_matricula: null, obra_financiada: null, responsavel_comercial: null,
    atualizado_em: new Date().toISOString(), atualizado_por: null,
  }),
  projetos: () => ({ perfil: null, servicos: null, servicos_observacao: null, tipo_estudo: 'padrao', tem_habitese: false, horas_estimadas: null, codigo: null, responsavel_id: perfilEu().perfil === 'admin' ? null : eu, tem_legal: false, tem_interiores: false, tem_complementares: false, tipo_aprovacao: null, status: 'ativo', pausado_em: null, motivo_pausa: null, observacoes: null }),
  protocolos: () => ({ orgao: null, numero: null, status: 'a_protocolar', data_protocolo: null, prazo: null, cliente_notificado: false, observacao: null, updated_at: new Date().toISOString() }),
  historico: () => ({ etapa_codigo: null, autor_id: eu }),
  protocolo_andamentos: () => ({ autor_id: eu }),
  projeto_documentos: () => ({ modelo_id: null, codigo_arquivo: null, visivel_cliente: false }),
  tempos: () => ({ usuario_id: eu, iniciado_em: new Date().toISOString(), finalizado_em: null }),
  banco_horas_ajustes: () => ({ data: data(0), criado_por: eu }),
};
const NEGADO = { data: null, error: { message: 'new row violates row-level security policy' } };
DEFAULTS.servico_categorias = () => ({ etapas: [], execucao: 'escritorio', ordem: 99, ativo: true });
DEFAULTS.servico_itens = () => ({ ordem: 99, ativo: true });
DEFAULTS.perfis_cliente = () => ({ faixa: '', estudo: 'padrao', entregas: [], area_min: null, area_max: null, sugerir: true, ordem: 99, ativo: true });
DEFAULTS.parceiros = () => ({ tipo: 'outro', tipo_pessoa: 'juridica', documento: null, contato: null, telefone: null, whatsapp: null, email: null, cidade: null, uf: null, observacoes: null, ativo: true });
const SO_ADMIN = new Set(['projeto_equipe', 'etapa_modelos', 'documento_modelos', 'servico_categorias', 'servico_itens', 'perfis_cliente']);

class Q implements PromiseLike<any> {
  op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  payload: any; sel = '*'; one = false; lim = Infinity; tabela: string; visaoCliente: boolean; faixa: [number, number] | null = null;
  filtros: ((r: Row) => boolean)[] = []; ordem: [string, boolean, boolean][] = [];
  constructor(public table: string) { this.visaoCliente = table === 'etapas_cliente'; this.tabela = this.visaoCliente ? 'etapa_modelos' : table; }
  select(s = '*') { this.sel = s; return this; }
  insert(p: any) { this.op = 'insert'; this.payload = p; return this; }
  update(p: any) { this.op = 'update'; this.payload = p; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c: string, v: any) { this.filtros.push((r) => r[c] === v); return this; }
  neq(c: string, v: any) { this.filtros.push((r) => r[c] !== v); return this; }
  gte(c: string, v: any) { this.filtros.push((r) => r[c] >= v); return this; }
  lte(c: string, v: any) { this.filtros.push((r) => r[c] <= v); return this; }
  range(a: number, b: number) { this.faixa = [a, b]; return this; }
  is(c: string, v: any) { this.filtros.push((r) => (r[c] ?? null) === v); return this; }
  in(c: string, vs: any[]) { this.filtros.push((r) => vs.includes(r[c])); return this; }
  not(c: string, o: string, v: string | null) {
    if (o === 'is') { this.filtros.push((r) => (v === null ? r[c] != null : r[c] !== v)); return this; }
    const vs = String(v).replace(/[()]/g, '').split(','); this.filtros.push((r) => !vs.includes(String(r[c]))); return this; }
  order(c: string, o: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    const asc = o.ascending !== false; this.ordem.push([c, asc, o.nullsFirst ?? !asc]); return this;
  }
  limit(n: number) { this.lim = n; return this; }
  single() { this.one = true; return this; }
  then<A, B>(ok?: (v: any) => A | PromiseLike<A>, ko?: (e: any) => B | PromiseLike<B>) {
    return Promise.resolve(this.run()).then(ok, ko);
  }
  run() {
    const t = this.tabela, tabela = db[t], p = perfilEu();
    const casa = (r: Row) => this.filtros.every((f) => f(r)) && (this.visaoCliente || ver(t, r));
    let alvo: Row[];
    if (this.op !== 'select') {
      if (p.perfil === 'cliente') return NEGADO;
      if (SO_ADMIN.has(t) && p.perfil !== 'admin') return NEGADO;
      if (t === 'banco_horas_ajustes' && !podeBanco()) return NEGADO;
      if (t === 'parceiros' && this.op !== 'delete' && !(p.perfil === 'admin' || ['administrativo', 'comercial', 'financeiro'].includes(p.setor))) return NEGADO;
    }
    if (this.op === 'insert') {
      const itens = Array.isArray(this.payload) ? this.payload : [this.payload];
      alvo = itens.map((i: Row) => {
        const r: Row = { id: uid(), created_at: new Date().toISOString(), ...(DEFAULTS[t]?.() ?? {}), ...i };
        if (t === 'projetos' && r.responsavel_id == null && p.perfil !== 'admin') r.responsavel_id = eu;
        tabela.push(r);
        if (t === 'projetos') instanciarEtapas(r);
        if (t === 'projeto_equipe') atribuirTarefas(r.projeto_id);
        return r;
      });
    } else if (this.op === 'update') {
      let campos = { ...this.payload };
      if (t === 'projeto_tarefas') campos = Object.fromEntries(Object.entries(campos).filter(([k]) => ['responsavel_id', 'atribuicao_manual'].includes(k)));
      if (t === 'profiles' && p.perfil !== 'admin') for (const k of ['perfil', 'setor', 'cliente_id', 'ativo', 'especialidades', 'carga_semanal_horas']) delete campos[k];
      tabela.filter((r) => casa(r) && (t !== 'profiles' || p.perfil === 'admin' || r.id === eu)).forEach((r) => {
        if (t === 'projeto_tarefa_itens' && 'feito' in campos) {
          Object.assign(r, campos, campos.feito ? (r.feito ? {} : { feito_por: eu, feito_em: new Date().toISOString() }) : { feito_por: null, feito_em: null });
        } else Object.assign(r, campos);
        if (t === 'projetos' && 'responsavel_id' in campos) atribuirTarefas(r.id);
      });
      return { data: null, error: null };
    } else if (this.op === 'delete') {
      if (p.perfil !== 'admin' && !(t === 'banco_horas_ajustes' && podeBanco())) return { data: null, error: null };
      const afetados = t === 'projeto_equipe' ? tabela.filter(casa).map((r) => r.projeto_id) : [];
      db[t] = tabela.filter((r) => !casa(r));
      afetados.forEach(atribuirTarefas);
      return { data: null, error: null };
    } else alvo = tabela.filter(casa);
    for (const [c, asc, nf] of [...this.ordem].reverse()) {
      alvo = [...alvo].sort((a, b) => {
        const x = a[c], y = b[c];
        if (x == null || y == null) return x == null && y == null ? 0 : (x == null) === nf ? -1 : 1;
        return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1);
      });
    }
    if (this.faixa) alvo = alvo.slice(this.faixa[0], this.faixa[1] + 1);
    let dados = alvo.slice(0, this.lim).map((r) => expand(t, r, this.sel));
    if (this.visaoCliente) dados = dados.map(({ entrada, saida, regra, setores, ...resto }) => { void entrada; void saida; void regra; void setores; return resto; });
    if (this.one) return dados[0] ? { data: dados[0], error: null } : { data: null, error: { message: 'Registro não encontrado' } };
    return { data: dados, error: null };
  }
}

/* ---------- dados de exemplo ---------- */
const MIN_BASE: Record<string, number> = { '01': 20, '02': 15, '03': 25, '04': 10, '05': 70, '06': 60, '07': 240, '08': 10, '09': 75, '10': 15, '11': 200, '12': 10, '13': 70, '14': 15, '15': 480, '16': 300, '17': 360, '18': 420, '19': 120, '20': 45, '21': 10, '22': 60, '23': 50, '24': 20 };
function semearTempos(projetoId: string, responsavel: string) {
  const k = db.projetos.length - 1;
  for (const e of db.projeto_etapas.filter((x) => x.projeto_id === projetoId && ['concluida', 'em_andamento'].includes(x.status))) {
    const feito = e.status === 'concluida';
    const min = (MIN_BASE[e.etapa_codigo] ?? 30) * (0.8 + 0.12 * k) * (feito ? 1 : 0.3);
    const sessoes = min > 100 ? 2 : 1;
    for (let s = 0; s < sessoes; s++) {
      const dur = (min / sessoes) * 60_000;
      const fim = new Date(e.concluida_em ?? iso(-1)).getTime() - s * 4 * 3_600_000;
      db.tempos.push({ id: uid(), projeto_id: projetoId, etapa_codigo: e.etapa_codigo, usuario_id: responsavel, iniciado_em: new Date(fim - dur).toISOString(), finalizado_em: new Date(fim).toISOString() });
    }
  }
}

function novoProjeto(cliente: Row, p: Row, ate: string, rodadas = 0) {
  const c = { id: uid(), created_at: iso(-90), ...DEFAULTS.clientes(), ...cliente }; db.clientes.push(c);
  const pr: Row = { id: uid(), created_at: iso(-90), cliente_id: c.id, ...DEFAULTS.projetos(), ...p };
  db.projetos.push(pr); instanciarEtapas(pr);
  db.historico = db.historico.filter((h) => h.projeto_id !== pr.id);
  const alvo = db.etapa_modelos.find((m) => m.codigo === ate)!;
  let n = 0;
  for (const e of db.projeto_etapas.filter((x) => x.projeto_id === pr.id)) {
    const m = db.etapa_modelos.find((x) => x.codigo === e.etapa_codigo)!;
    if (m.fase > 4 || e.status === 'nao_aplicavel') continue;
    if (m.ordem < alvo.ordem) { e.status = 'concluida'; e.iniciada_em = iso(-80 + n * 3); e.concluida_em = iso(-78 + n * 3); n++; }
    else if (m.ordem === alvo.ordem) { e.status = 'em_andamento'; e.iniciada_em = iso(-2); e.concluida_em = null; e.rodadas_ajuste = rodadas; }
    else { e.status = 'pendente'; e.iniciada_em = null; e.concluida_em = null; }
  }
  semearTempos(pr.id, pr.responsavel_id);
  for (const e of db.projeto_etapas.filter((x) => x.projeto_id === pr.id && ['concluida', 'em_andamento'].includes(x.status))) {
    const ids = db.projeto_tarefas.filter((t) => t.projeto_id === pr.id && t.etapa_codigo === e.etapa_codigo).map((t) => t.id);
    const its = db.projeto_tarefa_itens.filter((i) => ids.includes(i.tarefa_id)).sort((a, b) => a.ordem - b.ordem);
    const quantos = e.status === 'concluida' ? its.length : Math.floor(its.length / 2);
    its.slice(0, quantos).forEach((i) => { i.feito = true; i.feito_por = pr.responsavel_id; i.feito_em = e.concluida_em ?? e.iniciada_em ?? iso(-1); });
  }
  db.historico.push({ id: uid(), projeto_id: pr.id, etapa_codigo: ate, tipo: 'etapa_iniciada', texto: 'Etapa iniciada', autor_id: pr.responsavel_id, created_at: iso(-2) });
  db.historico.push({ id: uid(), projeto_id: pr.id, etapa_codigo: null, tipo: 'nota', texto: 'Cliente prefere reuniões online às terças.', autor_id: pr.responsavel_id, created_at: iso(-10) });
  return pr;
}
const proto = (projeto_id: string, p: Row) => db.protocolos.push({ id: uid(), projeto_id, created_at: iso(-5), ...DEFAULTS.protocolos(), ...p });
const doc = (projeto_id: string, etapa: string, nome: string, arquivo: string, liberado: boolean) =>
  db.projeto_documentos.push({ id: uid(), projeto_id, etapa_codigo: etapa, modelo_id: null, nome, codigo_arquivo: null, arquivo_path: `${projeto_id}/${etapa}/${arquivo}`, arquivo_nome: arquivo, created_at: iso(-3), visivel_cliente: liberado });

const silva = novoProjeto({ nome: 'Marcos Silva', codigo: 'CA000101', categoria: 'A2', premium: true, telefone: '(15) 99999-0101' },
  { nome: 'Residência Silva', responsavel_id: 'marina', tem_legal: true, tem_interiores: true, tem_complementares: true, tem_habitese: true, tipo_aprovacao: 'residencial', perfil: 'A2', servicos: ['estrutural-04', 'estrutural-05', 'eletrico-02', 'hidro-02', 'hidro-04', 'interiores-02', 'interiores-07', 'prefeitura-06'], servicos_observacao: 'Complementares feitos por parceiros; a Cariati confere a compatibilização.' }, '09', 2);
db.projeto_equipe.push({ id: uid(), projeto_id: silva.id, usuario_id: 'rafael', especialidade: 'interiores' });
const oliveira = novoProjeto({ nome: 'Ana Oliveira', codigo: 'CA000102', categoria: 'B' },
  { nome: 'Casa de Praia Oliveira', responsavel_id: 'marina', tem_legal: true, tem_complementares: true, tipo_aprovacao: 'residencial', perfil: 'B', servicos: ['eletrico-02', 'eletrico-04'] }, '16');
proto(oliveira.id, { tipo: 'prefeitura', orgao: 'Prefeitura Municipal', numero: '2026/48213', status: 'exigencia', data_protocolo: data(-18), prazo: data(2), cliente_notificado: true });
proto(oliveira.id, { tipo: 'condominio', orgao: 'Condomínio Praia Azul', status: 'em_analise', data_protocolo: data(-9), prazo: data(12), cliente_notificado: true });
doc(oliveira.id, '05', 'Ata da reunião de briefing', 'ATA_CA000102_BRF.pdf', true);
doc(oliveira.id, '10', 'Aceite da planta baixa', 'ESTD_CA000102_REV01.pdf', true);
doc(oliveira.id, '14', 'Termo de aceite da fachada', 'ACT_CA000102_FACH_REV01.pdf', true);
doc(oliveira.id, '15', 'Checklist interno do projeto arquitetônico', 'CHCK_CA000102_ARQ.pdf', false);
db.profiles.find((x) => x.id === 'cliente')!.cliente_id = oliveira.cliente_id;
const rocha = novoProjeto({ nome: 'Comercial Rocha', codigo: 'CA000103', categoria: 'D' }, { nome: 'Loja Centro', responsavel_id: 'rafael', tipo_estudo: 'mais_projetos' }, '23');
proto(rocha.id, { tipo: 'entrega_cliente', status: 'protocolado', prazo: data(3), cliente_notificado: true });
novoProjeto({ nome: 'Paulo Costa', codigo: 'CA000104', categoria: 'B' },
  { nome: 'Sobrado Costa', responsavel_id: 'rafael', tipo_estudo: 'ampliacao', status: 'pausado', pausado_em: data(-160), motivo_pausa: 'Pausa por falta de retorno do cliente' }, '05');
const lima = novoProjeto({ nome: 'Carla Lima', codigo: 'CA000105', categoria: 'A' }, { nome: 'Apartamento Lima', responsavel_id: 'marina', tem_interiores: true }, '04');

/** 40 dias de trabalho recentes por pessoa, nas etapas em andamento, para o banco de horas ter o que analisar. */
/** Histórico de 12 meses: projetos já entregues (e dois rescindidos) para os gráficos da Visão geral terem evolução. */
function semearHistorico() {
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const tipos = ['padrao', 'padrao', 'padrao', 'ampliacao', 'mais_projetos'];
  const nomes = ['Residência Ferraz', 'Sobrado Nogueira', 'Casa Menezes', 'Loja Aurora', 'Cobertura Prado', 'Residência Vieira', 'Clínica Santos', 'Casa Barros', 'Edifício Lopes', 'Residência Cunha', 'Escritório Alba', 'Casa Teixeira'];
  const cod = (e: Row) => e.etapa_codigo as string;
  for (let i = 0; i < nomes.length; i++) {
    const criadoHa = 352 - i * 22 - Math.round(rnd() * 8);
    const tipo = tipos[i % tipos.length], legal = i % 3 === 0, rescindido = i === 4 || i === 9;
    const c = { id: uid(), created_at: iso(-criadoHa), ...DEFAULTS.clientes(), nome: 'Cliente ' + nomes[i].split(' ').slice(1).join(' '), codigo: `CA0000${50 + i}`, categoria: 'BC'[i % 2] };
    db.clientes.push(c);
    const pr: Row = { id: uid(), created_at: iso(-criadoHa), cliente_id: c.id, ...DEFAULTS.projetos(), nome: nomes[i], codigo: null, responsavel_id: i % 2 ? 'rafael' : 'marina', tipo_estudo: tipo, tem_legal: legal, tem_interiores: i % 4 === 1, status: rescindido ? 'rescindido' : 'finalizado' };
    db.projetos.push(pr); instanciarEtapas(pr);
    db.historico = db.historico.filter((h) => h.projeto_id !== pr.id);
    const etapas = db.projeto_etapas.filter((x) => x.projeto_id === pr.id && x.status !== 'nao_aplicavel' && db.etapa_modelos.find((m) => m.codigo === cod(x))!.fase <= 4)
      .sort((x, y) => db.etapa_modelos.find((m) => m.codigo === cod(x))!.ordem - db.etapa_modelos.find((m) => m.codigo === cod(y))!.ordem);
    const REF = REF_PADRAO;
    const melhora = 1.3 - 0.35 * (i / nomes.length);       // a equipe vai ficando mais rápida ao longo do ano
    const durs = etapas.map((e) => Math.max(0.5, (REF[cod(e)] ?? 5) * (0.55 + rnd() * 0.9) * melhora));
    const parar = rescindido ? Math.floor(etapas.length * 0.55) : etapas.length;
    let total = durs.slice(0, parar).reduce((q, d) => q + d, 0);
    const k = Math.min(1, (criadoHa - 4 - rnd() * 6) / total); total *= k;
    let t = criadoHa;
    etapas.forEach((e, n) => {
      if (n >= parar) { e.status = 'pendente'; e.iniciada_em = null; e.concluida_em = null; return; }
      const d = durs[n] * k;
      e.status = 'concluida'; e.iniciada_em = iso(-t); t -= d; e.concluida_em = iso(-t);
      e.rodadas_ajuste = ['09', '13'].includes(cod(e)) ? Math.floor(rnd() * 3) : 0;
    });
    if (rescindido) { pr.pausado_em = data(-Math.round(t)); pr.motivo_pausa = 'Sem retorno do cliente'; }
    for (const e of etapas.filter((x) => x.status === 'concluida')) {
      const ids = db.projeto_tarefas.filter((q) => q.projeto_id === pr.id && q.etapa_codigo === cod(e)).map((q) => q.id);
      db.projeto_tarefa_itens.filter((q) => ids.includes(q.tarefa_id)).forEach((q) => { q.feito = true; q.feito_por = pr.responsavel_id; q.feito_em = new Date(new Date(e.iniciada_em).getTime() + rnd() * (new Date(e.concluida_em).getTime() - new Date(e.iniciada_em).getTime())).toISOString(); });
    }
  }
  // projetos atuais entraram em datas diferentes, e alguns já passaram do prazo de referência
  const idade: Record<string, number> = { 'Residência Silva': 24, 'Casa de Praia Oliveira': 78, 'Loja Centro': 42, 'Sobrado Costa': 160, 'Apartamento Lima': 12, 'Casa Duarte': 120 };
  for (const [nome, ha] of Object.entries(idade)) { const p = db.projetos.find((x) => x.nome === nome); if (p) p.created_at = iso(-ha); }
  const atrasar = (nome: string, codigo: string, ha: number) => {
    const p = db.projetos.find((x) => x.nome === nome); const e = p && db.projeto_etapas.find((x) => x.projeto_id === p.id && x.etapa_codigo === codigo && x.status === 'em_andamento');
    if (e) e.iniciada_em = iso(-ha);
  };
  atrasar('Casa de Praia Oliveira', '16', 47); atrasar('Apartamento Lima', '04', 9); atrasar('Loja Centro', '09', 20); atrasar('Galpão Alves', '07', 17);
}
function semearDias() {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const fimDe = (p: Row) => db.projeto_etapas.find((e) => e.projeto_id === p.id && e.etapa_codigo === '24' && e.concluida_em)?.concluida_em ?? (['finalizado', 'rescindido'].includes(p.status) ? db.projeto_etapas.filter((e) => e.projeto_id === p.id && e.concluida_em).map((e) => e.concluida_em).sort().pop() : null);
  const vivos = (dt: Date) => db.projetos.filter((p) => new Date(p.created_at) <= dt && (!fimDe(p) || new Date(fimDe(p)) >= dt));
  const alvos = [
    { u: 'marina', h: 8.3, ok: (p: Row) => p.responsavel_id === 'marina' },
    { u: 'rafael', h: 7.0, ok: (p: Row) => p.responsavel_id === 'rafael' || p.id === db.projeto_equipe[0]?.projeto_id },
    { u: 'julia', h: 7.6, ok: () => true },
    { u: 'demo', h: 2.2, ok: () => true },
  ];
  const etapaEm = (p: Row, dt: Date) => {
    const es = db.projeto_etapas.filter((e) => e.projeto_id === p.id && e.iniciada_em);
    const t = dt.getTime();
    const e = es.find((x) => new Date(x.iniciada_em).getTime() <= t && (!x.concluida_em || new Date(x.concluida_em).getTime() >= t)) ?? es.find((x) => x.status === 'em_andamento');
    return e?.etapa_codigo ?? '01';
  };
  for (let d = -365; d <= -1; d++) {
    const dt = dia(d); const w = dt.getDay();
    if (w === 0 || w === 6) continue;
    const vivo = vivos(dt);
    const ritmo = 0.78 + 0.22 * (1 + d / 365) + (dt.getMonth() === 0 || dt.getMonth() === 11 ? -0.12 : 0);   // equipe produz mais ao longo do ano; janeiro e dezembro mais lentos
    for (const a of alvos) {
      const projs = vivo.filter((p) => ['ativo', 'pausado'].includes(p.status) || fimDe(p)).filter(a.ok);
      if (rnd() < 0.05 || !projs.length) continue;
      const total = Math.max(1, a.h * ritmo + (rnd() - 0.5) * 2.2);
      const partes = [[8 + Math.floor(rnd() * 2), 30, total * 0.55], [13 + Math.floor(rnd() * 2), 0, total * 0.45]];
      for (const [h, m, dur] of partes) {
        const pr = projs[Math.floor(rnd() * projs.length)];
        const ini = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), h, m).getTime();
        db.tempos.push({ id: uid(), projeto_id: pr.id, etapa_codigo: etapaEm(pr, dt), usuario_id: a.u, iniciado_em: new Date(ini).toISOString(), finalizado_em: new Date(ini + dur * 3_600_000).toISOString() });
      }
    }
  }
  db.banco_horas_ajustes.push(
    { id: uid(), usuario_id: 'marina', data: data(-10), minutos: 180, motivo: 'Hora extra: fechamento do projeto na Prefeitura', criado_por: 'julia', created_at: iso(-10) },
    { id: uid(), usuario_id: 'rafael', data: data(-6), minutos: -480, motivo: 'Folga compensatória', criado_por: 'julia', created_at: iso(-7) },
  );
}

// Galpão Alves: cliente C (estudo + projetos), com a Rafael no croqui e fachadas
novoProjeto({ nome: 'Alves & Filhos', codigo: 'CA000107', categoria: 'E' }, { nome: 'Galpão Alves', responsavel_id: 'rafael', tipo_estudo: 'mais_projetos' }, '07');
// Casa Duarte: projeto principal encerrado; o Habite-se está na entrada da Prefeitura
{
  const duarte = novoProjeto({ nome: 'Roberto Duarte', codigo: 'CA000106', categoria: 'B' }, { nome: 'Casa Duarte', responsavel_id: 'marina', tem_legal: true, tem_habitese: true, tipo_aprovacao: 'residencial' }, '24');
  const marcar = (cod: string, quantos: number, quando: string) => {
    const ids = db.projeto_tarefas.filter((t) => t.projeto_id === duarte.id && t.etapa_codigo === cod).map((t) => t.id);
    db.projeto_tarefa_itens.filter((i) => ids.includes(i.tarefa_id)).sort((a, b) => a.ordem - b.ordem).slice(0, quantos)
      .forEach((i) => { i.feito = true; i.feito_por = 'marina'; i.feito_em = quando; });
  };
  const et = (cod: string) => db.projeto_etapas.find((x) => x.projeto_id === duarte.id && x.etapa_codigo === cod)!;
  Object.assign(et('24'), { status: 'concluida', concluida_em: iso(-20) });
  Object.assign(et('H1'), { status: 'concluida', iniciada_em: iso(-18), concluida_em: iso(-8) }); marcar('H1', 99, iso(-8));
  Object.assign(et('H2'), { status: 'em_andamento', iniciada_em: iso(-8) }); marcar('H2', 6, iso(-2));
}

// Sobrado Costa: pausa por falta de retorno, com as 3 tentativas de contato já feitas e a notificação enviada
{
  const costa = db.projetos.find((x) => x.nome === 'Sobrado Costa')!;
  inserirTarefas(costa.id, 'P2', ['todas', 'ampliacao']);
  const ids = db.projeto_tarefas.filter((t) => t.projeto_id === costa.id && t.etapa_codigo === 'P2').sort((a, b) => a.ordem - b.ordem).slice(0, 4).map((t) => t.id);
  db.projeto_tarefa_itens.filter((i) => ids.includes(i.tarefa_id)).forEach((i) => { i.feito = true; i.feito_por = 'rafael'; i.feito_em = iso(-160); });
}
/** Dados de cadastro de exemplo (CPFs e CNPJs fictícios, mas com dígitos verificadores válidos). */
function completarClientes() {
  const ed = (nome: string, d: Row) => { const c = db.clientes.find((x) => x.nome === nome); if (c) Object.assign(c, d); };
  ed('Marcos Silva', { documento: '52998224725', rg: '12.345.678-9 SSP/SP', data_nascimento: '1978-04-12', estado_civil: 'Casado(a)', nacionalidade: 'Brasileira', profissao: 'Engenheiro',
    telefone: '(15) 3333-0101', whatsapp: '(15) 99999-0101', email: 'marcos.silva@exemplo.com', contato_preferido: 'whatsapp', origem: 'Indicação de cliente', indicado_por: 'Ana Oliveira',
    end_cep: '18035-100', end_logradouro: 'Rua das Acácias', end_numero: '210', end_bairro: 'Jardim Europa', end_cidade: 'Sorocaba', end_uf: 'SP',
    obra_intencao: 'Residencial', obra_metragem: 320, obra_cep: '18110-000', obra_logradouro: 'Alameda dos Ipês', obra_numero: '45', obra_bairro: 'Alphaville', obra_cidade: 'Votorantim', obra_uf: 'SP',
    obra_condominio: 'Residencial Bosque', obra_lote: '12', obra_quadra: 'F', obra_inscricao_municipal: '31.045.221-0', obra_matricula: '48.213', obra_financiada: false, responsavel_comercial: 'demo' });
  ed('Ana Oliveira', { documento: '11144477735', rg: '23.456.789-0 SSP/SP', estado_civil: 'Solteiro(a)', nacionalidade: 'Brasileira', profissao: 'Médica', telefone: '(15) 99888-0102', email: 'ana.oliveira@exemplo.com',
    end_cep: '18040-000', end_logradouro: 'Av. Itavuvu', end_numero: '1500', end_bairro: 'Centro', end_cidade: 'Sorocaba', end_uf: 'SP',
    obra_intencao: 'Residencial', obra_metragem: 210, obra_logradouro: 'Rua do Mar', obra_numero: '88', obra_bairro: 'Praia Azul', obra_cidade: 'Ubatuba', obra_uf: 'SP', obra_lote: '7', obra_quadra: 'C', obra_financiada: true });
  ed('Marcos Silva', { servicos: ['estrutural-04', 'estrutural-05', 'eletrico-02', 'hidro-02', 'hidro-04'], servico_estudo: 'padrao', servico_aprovacao: 'residencial', servicos_observacao: 'Complementares: estrutural, elétrico e hidrossanitário.' });
  ed('Ana Oliveira', { servicos: ['interiores-02', 'interiores-07', 'prefeitura-06'], servico_estudo: 'padrao', servico_aprovacao: 'residencial' });
  ed('Carla Lima', { telefone: '(11) 97777-0105', email: 'carla.lima@exemplo.com', end_cidade: 'São Paulo', end_uf: 'SP', obra_intencao: 'Interiores' });
  ed('Comercial Rocha', { tipo_pessoa: 'juridica', documento: '11222333000181', empresa_razao_social: 'Comercial Rocha Ltda', empresa_responsavel: 'Paulo Rocha', empresa_responsavel_cpf: '39053344705',
    telefone: '(15) 3222-0103', email: 'contato@rocha.exemplo.com', end_cep: '18010-000', end_logradouro: 'Rua XV de Novembro', end_numero: '300', end_bairro: 'Centro', end_cidade: 'Sorocaba', end_uf: 'SP',
    obra_intencao: 'Comercial', obra_metragem: 540, obra_logradouro: 'Rua XV de Novembro', obra_numero: '300', obra_cidade: 'Sorocaba', obra_uf: 'SP' });
  ed('Alves & Filhos', { tipo_pessoa: 'juridica', documento: '45997418000153', empresa_razao_social: 'Alves & Filhos Transportes Ltda', empresa_responsavel: 'José Alves', origem: 'Parceiro', obra_intencao: 'Industrial', obra_metragem: 1200 });
}
proto(silva.id, { tipo: 'prefeitura', orgao: 'Prefeitura Municipal', numero: '2026/50011', status: 'protocolado', data_protocolo: data(-30), prazo: data(-3), cliente_notificado: true });
completarClientes();
db.servico_categorias = PADRAO.categorias.map((c, i) => ({ id: c.id, nome: c.nome, etapas: c.etapas, execucao: c.execucao, ordem: i + 1, ativo: true }));
db.servico_itens = PADRAO.categorias.flatMap((c) => c.itens.map((x, i) => ({ id: x.id, categoria_id: c.id, nome: x.nome, ordem: i + 1, ativo: true })));
db.perfis_cliente = PADRAO.perfis.map((p, i) => ({ ...p, ordem: i + 1 }));
db.parceiros = [
  ['Estrutura Viva Engenharia', 'estrutural', 'juridica', '11222333000181', 'Carlos Menezes', '(62) 3255-1010', '(62) 99911-2020', 'contato@estruturaviva.com.br', 'Goiânia', 'GO'],
  ['Luz & Fluxo Instalações', 'eletrica_hidraulica', 'juridica', '45723174000110', 'Patrícia Duarte', '(62) 3212-7788', '(62) 99822-3344', 'projetos@luzefluxo.com.br', 'Goiânia', 'GO'],
  ['Topo Geo Levantamentos', 'topografia', 'juridica', '33000167000101', 'Marcos Tavares', null, '(62) 99733-4455', 'marcos@topogeo.com.br', 'Aparecida de Goiânia', 'GO'],
  ['Helena Paisagismo', 'paisagismo', 'fisica', '52998224725', 'Helena Rocha', null, '(62) 99644-5566', 'helena@paisagismo.com', 'Goiânia', 'GO'],
  ['Despachante Rápido', 'despachante', 'fisica', '39053344705', 'José Ribeiro', '(62) 3200-9090', null, null, 'Goiânia', 'GO'],
].map(([nome, tipo, tipo_pessoa, documento, contato, telefone, whatsapp, email, cidade, uf], i) =>
  ({ id: uid(), nome, tipo, tipo_pessoa, documento, contato, telefone, whatsapp, email, cidade, uf, observacoes: null, ativo: i !== 4, created_at: new Date().toISOString() }));
semearHistorico();
semearDias();
void lima;

function rpc(nome: string, args: any = {}) {
  const agora = new Date().toISOString();
  const parar = () => db.tempos.filter((t) => t.usuario_id === eu && !t.finalizado_em).forEach((t) => { t.finalizado_em = agora; });
  const admin = perfilEu().perfil === 'admin';
  const falha = (message: string) => Promise.resolve({ data: null, error: { message } });
  if (nome.startsWith('admin_')) {
    if (!admin) return falha('Só o administrador gerencia acessos');
    const alvo = db.profiles.find((x) => x.id === args.p_id);
    if (nome === 'admin_criar_usuario') {
      const em = String(args.p_email ?? '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return falha('E-mail inválido');
      if (String(args.p_senha ?? '').length < 8) return falha('A senha precisa ter pelo menos 8 caracteres');
      if (!String(args.p_nome ?? '').trim()) return falha('Informe o nome');
      if (args.p_perfil === 'cliente' && !args.p_cliente_id) return falha('Escolha o cadastro do cliente');
      if (db.profiles.some((x) => String(x.email).toLowerCase() === em)) return falha('Já existe um acesso com este e-mail');
      const id = uid();
      db.profiles.push({ id, email: em, nome: String(args.p_nome).trim(), setor: args.p_setor ?? 'projetos', perfil: args.p_perfil, especialidades: args.p_especialidades ?? [], cliente_id: args.p_perfil === 'cliente' ? args.p_cliente_id : null, ativo: true, carga_semanal_horas: args.p_carga ?? 40 });
      return Promise.resolve({ data: id, error: null });
    }
    if (!alvo) return falha('Acesso não encontrado');
    if (nome === 'admin_redefinir_senha') return String(args.p_senha ?? '').length < 8 ? falha('A senha precisa ter pelo menos 8 caracteres') : Promise.resolve({ data: null, error: null });
    if (nome === 'admin_alterar_email') {
      const em = String(args.p_email ?? '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return falha('E-mail inválido');
      if (db.profiles.some((x) => x.id !== alvo.id && String(x.email).toLowerCase() === em)) return falha('Já existe um acesso com este e-mail');
      alvo.email = em; return Promise.resolve({ data: null, error: null });
    }
    if (nome === 'admin_excluir_usuario') {
      if (alvo.id === eu) return falha('Você não pode excluir o seu próprio acesso');
      if (alvo.perfil === 'admin' && !db.profiles.some((x) => x.perfil === 'admin' && x.ativo && x.id !== alvo.id)) return falha('É preciso manter pelo menos um administrador ativo');
      if (db.projetos.some((x) => x.responsavel_id === alvo.id) || db.tempos.some((x) => x.usuario_id === alvo.id) || db.historico.some((x) => x.autor_id === alvo.id))
        return falha('Esta pessoa tem projetos, tempos ou histórico registrados. Desative o acesso em vez de excluir.');
      db.profiles = db.profiles.filter((x) => x.id !== alvo.id); db.projeto_equipe = db.projeto_equipe.filter((x) => x.usuario_id !== alvo.id);
      return Promise.resolve({ data: null, error: null });
    }
  }
  if (nome === 'iniciar_cronometro') {
    if (!verProjeto(args.p_projeto)) return Promise.resolve(NEGADO);
    parar();
    const r = { id: uid(), projeto_id: args.p_projeto, etapa_codigo: args.p_etapa, usuario_id: eu, iniciado_em: agora, finalizado_em: null };
    db.tempos.push(r);
    return Promise.resolve({ data: r, error: null });
  }
  if (nome === 'instanciar_tarefas_etapa') {
    if (perfilEu().perfil === 'cliente' || !verProjeto(args.p_projeto)) return Promise.resolve({ data: null, error: { message: 'Sem permissão para este projeto' } });
    const pr = db.projetos.find((x) => x.id === args.p_projeto)!;
    const v = args.p_etapa === 'P3'
      ? ['todas', db.projeto_tarefas.some((t) => t.projeto_id === pr.id && t.etapa_codigo === 'P2') ? 'apos_ausencia' : 'apos_solicitacao']
      : ['todas', pr.tipo_estudo ?? 'padrao'];
    return Promise.resolve({ data: inserirTarefas(pr.id, args.p_etapa, v), error: null });
  }
  if (nome === 'iniciar_habitese') {
    const pr = db.projetos.find((x) => x.id === args.p_projeto);
    if (!pr || perfilEu().perfil === 'cliente' || !verProjeto(pr.id)) return Promise.resolve({ data: null, error: { message: 'Sem permissão para este projeto' } });
    pr.tem_habitese = true; if (pr.status === 'finalizado') pr.status = 'ativo';
    for (const e of db.projeto_etapas.filter((x) => x.projeto_id === pr.id && x.etapa_codigo.startsWith('H'))) {
      if (e.status === 'nao_aplicavel') e.status = 'pendente';
      if (e.etapa_codigo === 'H1' && e.status === 'pendente') { e.status = 'em_andamento'; e.iniciada_em = new Date().toISOString(); }
      inserirTarefas(pr.id, e.etapa_codigo, ['todas']);
    }
    db.historico.push({ id: uid(), projeto_id: pr.id, etapa_codigo: 'H1', tipo: 'etapa_iniciada', texto: 'Habite-se iniciado', autor_id: eu, created_at: new Date().toISOString() });
    return Promise.resolve({ data: null, error: null });
  }
  if (nome === 'parar_cronometro') { parar(); return Promise.resolve({ data: null, error: null }); }
  return Promise.resolve({ data: null, error: { message: 'Função não disponível na demonstração' } });
}

export const demoClient: any = {
  from: (t: string) => new Q(t),
  rpc,
  auth: {
    getUser: async () => ({ data: { user: { id: eu } } }),
    getSession: async () => ({ data: { session: { user: { id: eu } } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signInWithPassword: async () => ({ error: null }),
    updateUser: async () => ({ error: null }),
    signOut: async () => { location.reload(); },
  },
  storage: {
    from: () => ({
      upload: async () => ({ error: null }),
      createSignedUrl: async () => ({ data: null, error: { message: 'Abrir arquivos não funciona na demonstração.' } }),
    }),
  },
};
