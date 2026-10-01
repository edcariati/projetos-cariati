/* Modo demonstração (VITE_DEMO=1): banco em memória com dados de exemplo.
   Imita só o que o app usa do supabase-js. Nada é salvo e nada sai do navegador. */
import sqlEtapas from '../../supabase/migrations/0002_seed_etapas.sql?raw';
import sqlDocs from '../../supabase/migrations/0004_seed_documentos.sql?raw';

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

const uid = () => crypto.randomUUID();
const dia = (d: number) => new Date(Date.now() + d * 86_400_000);
const iso = (d: number) => dia(d).toISOString();
const data = (d: number) => dia(d).toISOString().slice(0, 10);

const db: Record<string, Row[]> = {
  profiles: [{ id: 'demo', nome: 'Equipe Projetos', setor: 'projetos', papel: 'admin' }],
  clientes: [], etapa_modelos: [], projetos: [], projeto_etapas: [], historico: [],
  protocolos: [], protocolo_andamentos: [], documento_modelos: [], projeto_documentos: [],
};

const COLS_ETAPA = ['codigo', 'ordem', 'fase', 'titulo', 'rotulo', 'setores', 'cliente_participa', 'entrada', 'saida', 'regra', 'opcional', 'aceite_formal', 'escopo'];
db.etapa_modelos = parseTuples(sqlEtapas).map((t) => Object.fromEntries(COLS_ETAPA.map((c, k) => [c, t[k]])));
db.documento_modelos = parseTuples(sqlDocs).map((t) => ({ id: uid(), etapa_codigo: t[0], nome: t[1], padrao_arquivo: t[2], ordem: t[3] }));

const REL: Record<string, Record<string, { t: string; fk: string; many: boolean }>> = {
  projetos: { clientes: { t: 'clientes', fk: 'cliente_id', many: false }, projeto_etapas: { t: 'projeto_etapas', fk: 'projeto_id', many: true } },
  protocolos: { projetos: { t: 'projetos', fk: 'projeto_id', many: false } },
  historico: { profiles: { t: 'profiles', fk: 'autor_id', many: false } },
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
      ? db[rel.t].filter((r) => r[rel.fk] === row.id).map((r) => expand(rel.t, r, m[2]))
      : (() => { const r = db[rel.t].find((x) => x.id === row[rel.fk]); return r ? expand(rel.t, r, m[2]) : null; })();
  }
  return out;
}

function instanciarEtapas(p: Row) {
  for (const m of db.etapa_modelos) {
    const naoAplic = m.fase === 5 || (m.escopo === 'legal' && !p.tem_legal) ||
      (m.escopo === 'interiores' && !p.tem_interiores) || (m.escopo === 'complementares' && !p.tem_complementares);
    db.projeto_etapas.push({
      id: uid(), projeto_id: p.id, etapa_codigo: m.codigo, status: naoAplic ? 'nao_aplicavel' : 'pendente',
      responsavel_id: null, iniciada_em: null, concluida_em: null, rodadas_ajuste: 0, observacao: null,
    });
  }
  const e1 = db.projeto_etapas.find((e) => e.projeto_id === p.id && e.etapa_codigo === '01')!;
  e1.status = 'em_andamento'; e1.iniciada_em = new Date().toISOString();
  db.historico.push({ id: uid(), projeto_id: p.id, etapa_codigo: '01', tipo: 'etapa_iniciada', texto: 'Projeto criado', autor_id: 'demo', created_at: new Date().toISOString() });
}

const DEFAULTS: Record<string, () => Row> = {
  clientes: () => ({ codigo: null, categoria: null, premium: false, telefone: null, email: null, observacoes: null }),
  projetos: () => ({ codigo: null, responsavel_id: null, tem_legal: false, tem_interiores: false, tem_complementares: false, tipo_aprovacao: null, status: 'ativo', pausado_em: null, motivo_pausa: null, observacoes: null }),
  protocolos: () => ({ orgao: null, numero: null, status: 'a_protocolar', data_protocolo: null, prazo: null, cliente_notificado: false, observacao: null, updated_at: new Date().toISOString() }),
  historico: () => ({ etapa_codigo: null, autor_id: 'demo' }),
  protocolo_andamentos: () => ({ autor_id: 'demo' }),
  projeto_documentos: () => ({ modelo_id: null, codigo_arquivo: null }),
};

class Q implements PromiseLike<any> {
  op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  payload: any; sel = '*'; one = false; lim = Infinity;
  filtros: ((r: Row) => boolean)[] = []; ordem: [string, boolean, boolean][] = [];
  constructor(public table: string) {}
  select(s = '*') { this.sel = s; return this; }
  insert(p: any) { this.op = 'insert'; this.payload = p; return this; }
  update(p: any) { this.op = 'update'; this.payload = p; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c: string, v: any) { this.filtros.push((r) => r[c] === v); return this; }
  in(c: string, vs: any[]) { this.filtros.push((r) => vs.includes(r[c])); return this; }
  not(c: string, _o: string, v: string) { const vs = v.replace(/[()]/g, '').split(','); this.filtros.push((r) => !vs.includes(String(r[c]))); return this; }
  order(c: string, o: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    const asc = o.ascending !== false; this.ordem.push([c, asc, o.nullsFirst ?? !asc]); return this;
  }
  limit(n: number) { this.lim = n; return this; }
  single() { this.one = true; return this; }
  then<A, B>(ok?: (v: any) => A | PromiseLike<A>, ko?: (e: any) => B | PromiseLike<B>) {
    return Promise.resolve(this.run()).then(ok, ko);
  }
  run() {
    const tabela = db[this.table];
    const casa = (r: Row) => this.filtros.every((f) => f(r));
    let alvo: Row[];
    if (this.op === 'insert') {
      const itens = Array.isArray(this.payload) ? this.payload : [this.payload];
      alvo = itens.map((i: Row) => {
        const r = { id: uid(), created_at: new Date().toISOString(), ...(DEFAULTS[this.table]?.() ?? {}), ...i };
        tabela.push(r);
        if (this.table === 'projetos') instanciarEtapas(r);
        return r;
      });
    } else if (this.op === 'update') {
      tabela.filter(casa).forEach((r) => Object.assign(r, this.payload));
      return { data: null, error: null };
    } else if (this.op === 'delete') {
      db[this.table] = tabela.filter((r) => !casa(r));
      return { data: null, error: null };
    } else alvo = tabela.filter(casa);
    for (const [c, asc, nf] of [...this.ordem].reverse()) {
      alvo = [...alvo].sort((a, b) => {
        const x = a[c], y = b[c];
        if (x == null || y == null) return x == null && y == null ? 0 : (x == null) === nf ? -1 : 1;
        return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1);
      });
    }
    const dados = alvo.slice(0, this.lim).map((r) => expand(this.table, r, this.sel));
    if (this.one) return dados[0] ? { data: dados[0], error: null } : { data: null, error: { message: 'Registro não encontrado' } };
    return { data: dados, error: null };
  }
}

/* ---------- dados de exemplo ---------- */
function novoProjeto(cliente: Row, p: Row, ate: string, rodadas = 0) {
  const c = { id: uid(), created_at: iso(-90), ...DEFAULTS.clientes(), ...cliente }; db.clientes.push(c);
  const pr: Row = { id: uid(), created_at: iso(-90), cliente_id: c.id, ...DEFAULTS.projetos(), responsavel_id: 'demo', ...p };
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
  db.historico.push({ id: uid(), projeto_id: pr.id, etapa_codigo: ate, tipo: 'etapa_iniciada', texto: 'Etapa iniciada', autor_id: 'demo', created_at: iso(-2) });
  db.historico.push({ id: uid(), projeto_id: pr.id, etapa_codigo: null, tipo: 'nota', texto: 'Cliente prefere reuniões online às terças.', autor_id: 'demo', created_at: iso(-10) });
  return pr;
}
const proto = (projeto_id: string, p: Row) => db.protocolos.push({ id: uid(), projeto_id, created_at: iso(-5), ...DEFAULTS.protocolos(), ...p });

novoProjeto({ nome: 'Marcos Silva', codigo: 'CA000101', categoria: 'A', premium: true, telefone: '(15) 99999-0101' },
  { nome: 'Residência Silva', tem_legal: true, tem_interiores: true, tipo_aprovacao: 'residencial' }, '09', 2);
const oliveira = novoProjeto({ nome: 'Ana Oliveira', codigo: 'CA000102', categoria: 'B' },
  { nome: 'Casa de Praia Oliveira', tem_legal: true, tipo_aprovacao: 'residencial' }, '16');
proto(oliveira.id, { tipo: 'prefeitura', orgao: 'Prefeitura Municipal', numero: '2026/48213', status: 'exigencia', data_protocolo: data(-18), prazo: data(2), cliente_notificado: true });
proto(oliveira.id, { tipo: 'condominio', orgao: 'Condomínio Praia Azul', status: 'em_analise', data_protocolo: data(-9), prazo: data(12), cliente_notificado: true });
const rocha = novoProjeto({ nome: 'Comercial Rocha', codigo: 'CA000103', categoria: 'C' }, { nome: 'Loja Centro' }, '23');
proto(rocha.id, { tipo: 'entrega_cliente', status: 'protocolado', prazo: data(3), cliente_notificado: true });
novoProjeto({ nome: 'Paulo Costa', codigo: 'CA000104', categoria: 'B' },
  { nome: 'Sobrado Costa', status: 'pausado', pausado_em: data(-160), motivo_pausa: 'Pausa a pedido do cliente' }, '05');
novoProjeto({ nome: 'Carla Lima', codigo: 'CA000105', categoria: 'A' }, { nome: 'Apartamento Lima', tem_interiores: true }, '03');

export const demoClient: any = {
  from: (t: string) => new Q(t),
  auth: {
    getSession: async () => ({ data: { session: { user: { id: 'demo' } } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signInWithPassword: async () => ({ error: null }),
    signOut: async () => { location.reload(); },
  },
  storage: {
    from: () => ({
      upload: async () => ({ error: null }),
      createSignedUrl: async () => ({ data: null, error: { message: 'Download indisponível no modo demonstração.' } }),
    }),
  },
};
