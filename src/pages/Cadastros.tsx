import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Cliente, Especialidade, Parceiro, Profile, Setor } from '../lib/types';
import { ESPECIALIDADE, PARCEIRO_TIPO, PERFIL, SETOR } from '../lib/labels';
import { cnpjValido, cpfValido, digitos, formatarDocumento, formatarTelefone } from '../lib/cadastro';
import { usePerfil } from '../lib/perfil';
import { confirmar, pedirTexto } from '../components/Dialogo';
import { avisar } from '../ui/avisos';
import { Carregando, Vazio } from '../ui/Holo';

/** Senha aleatória de 12 caracteres, sem letras que se confundem (0/O, 1/l/I). */
function gerarSenha() {
  const alfabeto = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint32Array(12); crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join('') + '#7';
}
const copiar = (t: string) => navigator.clipboard?.writeText(t).catch(() => undefined);

/** Cadastros do administrador: clientes, parceiros e quem usa o aplicativo (com senha e exclusão). */
export default function Cadastros({ aba }: { aba: 'clientes' | 'parceiros' | 'usuarios' }) {
  return (
    <>
      <div className="titulo"><h1>Cadastros</h1></div>
      <nav className="abas" aria-label="Cadastros">
        <NavLink to="/cadastros/clientes">Clientes</NavLink>
        <NavLink to="/cadastros/parceiros">Parceiros</NavLink>
        <NavLink to="/cadastros/usuarios">Quem usa o aplicativo</NavLink>
      </nav>
      {aba === 'clientes' && <AbaClientes />}
      {aba === 'parceiros' && <AbaParceiros />}
      {aba === 'usuarios' && <AbaUsuarios />}
    </>
  );
}

/* ---------------------------------------------------------------- Clientes */
function AbaClientes() {
  const [lista, setLista] = useState<Cliente[] | null>(null);
  const [projetos, setProjetos] = useState<{ cliente_id: string }[]>([]);
  const [logins, setLogins] = useState<{ id: string; cliente_id: string | null }[]>([]);
  const [busca, setBusca] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const carregar = useCallback(async () => {
    const [c, p, l] = await Promise.all([
      supabase.from('clientes').select('*').order('nome'),
      supabase.from('projetos').select('cliente_id'),
      supabase.from('profiles').select('id,cliente_id').eq('perfil', 'cliente'),
    ]);
    setLista((c.data as Cliente[]) ?? []); setProjetos((p.data as { cliente_id: string }[]) ?? []); setLogins((l.data as { id: string; cliente_id: string | null }[]) ?? []);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const nProj = (id: string) => projetos.filter((p) => p.cliente_id === id).length;
  const nLogin = (id: string) => logins.filter((l) => l.cliente_id === id).length;
  const q = busca.trim().toLowerCase(), qd = digitos(busca);
  const filtrada = (lista ?? []).filter((c) => !q || [c.nome, c.codigo, c.email].join(' ').toLowerCase().includes(q) || (qd.length >= 3 && digitos(c.documento).includes(qd)));

  async function excluir(c: Cliente) {
    setMsg(null);
    const login = nLogin(c.id);
    if (!(await confirmar(`Excluir o cliente "${c.nome}"? Isso não pode ser desfeito.${login ? ` O acesso dele ao aplicativo continua existindo, mas ficará sem cliente vinculado (exclua em "Quem usa o aplicativo").` : ''}`))) return;
    const { error } = await supabase.from('clientes').delete().eq('id', c.id);
    if (error) setMsg({ ok: false, texto: /foreign|restrict|violates/i.test(error.message) ? 'Este cliente tem projetos e não pode ser excluído.' : error.message });
    else { setMsg({ ok: true, texto: `Cliente "${c.nome}" excluído.` }); setLista((l) => (l ?? []).filter((x) => x.id !== c.id)); }
  }

  return (
    <>
      <div className="acoes cab-aba">
        <input id="busca-cad-cliente" placeholder="Buscar cliente por nome, CPF/CNPJ, e-mail ou código…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <Link className="primario btn" to="/clientes/novo">+ Cadastrar cliente</Link>
      </div>
      <p className="mudo pequeno">O cadastro completo (dados pessoais, endereço, obra) fica na ficha de cada cliente. Cliente com projeto não pode ser excluído: o histórico do projeto precisa ficar guardado.</p>
      {msg && <p className={msg.ok ? 'ok-msg' : 'erro'} role="status">{msg.texto}</p>}
      {lista === null ? <Carregando /> : (
        <div className="viz-tab card">
          <table className="tab-projetos tab-cad">
            <thead><tr><th>Cliente</th><th>CPF/CNPJ</th><th>Projetos</th><th>Acesso ao app</th><th>Ações</th></tr></thead>
            <tbody>
              {filtrada.map((c) => { const np = nProj(c.id), nl = nLogin(c.id); return (
                <tr key={c.id}>
                  <td><Link to={`/clientes/${c.id}`}><b>{c.nome}</b></Link><div className="mudo pequeno">{c.codigo ?? 'sem código'}{c.email ? ` · ${c.email}` : ''}</div></td>
                  <td>{c.documento ? formatarDocumento(c.documento, c.tipo_pessoa) : <span className="mudo">—</span>}</td>
                  <td>{np || <span className="mudo">nenhum</span>}</td>
                  <td>{nl ? <span className="situ ok">✓ tem login</span> : <span className="mudo">sem login</span>}</td>
                  <td className="acoes-linha">
                    <Link className="btn" to={`/clientes/${c.id}`}>Abrir ficha</Link>
                    <button className="perigo" disabled={np > 0} title={np > 0 ? `Tem ${np} projeto(s): não pode ser excluído` : 'Excluir cliente'} onClick={() => excluir(c)}>Excluir</button>
                  </td>
                </tr>
              ); })}
            </tbody>
          </table>
          {filtrada.length === 0 && <Vazio titulo="Nenhum cliente encontrado" texto="Ajuste a busca ou cadastre um novo cliente." icone="clientes" acao={{ rotulo: '+ Cadastrar cliente', to: '/clientes/novo' }} />}
        </div>
      )}
    </>
  );
}

/* --------------------------------------------------------------- Parceiros */
const PARCEIRO_VAZIO = { nome: '', tipo: 'estrutural', tipo_pessoa: 'juridica' as 'fisica' | 'juridica', documento: '', contato: '', telefone: '', whatsapp: '', email: '', cidade: '', uf: '', observacoes: '' };

function AbaParceiros() {
  const [lista, setLista] = useState<Parceiro[] | null>(null);
  const [f, setF] = useState(PARCEIRO_VAZIO);
  const [editando, setEditando] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('');

  const carregar = useCallback(async () => { const { data } = await supabase.from('parceiros').select('*').order('nome'); setLista((data as Parceiro[]) ?? []); }, []);
  useEffect(() => { carregar(); }, [carregar]);
  const set = (k: keyof typeof PARCEIRO_VAZIO, v: string) => setF((x) => ({ ...x, [k]: v }));

  function editar(p: Parceiro) {
    setEditando(p.id); setAberto(true); setErro(''); setMsg('');
    setF({ nome: p.nome, tipo: p.tipo, tipo_pessoa: p.tipo_pessoa, documento: p.documento ?? '', contato: p.contato ?? '', telefone: p.telefone ?? '', whatsapp: p.whatsapp ?? '', email: p.email ?? '', cidade: p.cidade ?? '', uf: p.uf ?? '', observacoes: p.observacoes ?? '' });
  }
  function limpar() { setEditando(null); setF(PARCEIRO_VAZIO); setErro(''); }

  async function salvar(e: React.FormEvent) {
    e.preventDefault(); setErro(''); setMsg('');
    if (!f.nome.trim()) return setErro('Informe o nome do parceiro.');
    if (f.documento && !(f.tipo_pessoa === 'fisica' ? cpfValido(f.documento) : cnpjValido(f.documento))) return setErro(f.tipo_pessoa === 'fisica' ? 'CPF inválido.' : 'CNPJ inválido.');
    if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) return setErro('E-mail inválido.');
    const linha = {
      nome: f.nome.trim(), tipo: f.tipo, tipo_pessoa: f.tipo_pessoa, documento: digitos(f.documento) || null, contato: f.contato.trim() || null,
      telefone: digitos(f.telefone) || null, whatsapp: digitos(f.whatsapp) || null, email: f.email.trim().toLowerCase() || null,
      cidade: f.cidade.trim() || null, uf: f.uf.trim().toUpperCase().slice(0, 2) || null, observacoes: f.observacoes.trim() || null,
    };
    const { error } = editando ? await supabase.from('parceiros').update(linha).eq('id', editando) : await supabase.from('parceiros').insert(linha);
    if (error) return setErro(error.message);
    setMsg(editando ? 'Parceiro atualizado.' : 'Parceiro cadastrado.'); limpar(); setAberto(false); carregar();
  }
  async function alternar(p: Parceiro) {
    setLista((l) => (l ?? []).map((x) => (x.id === p.id ? { ...x, ativo: !x.ativo } : x)));
    const { error } = await supabase.from('parceiros').update({ ativo: !p.ativo }).eq('id', p.id);
    if (error) { setErro(error.message); carregar(); return; }
    avisar(`${p.nome} ${p.ativo ? 'desativado' : 'reativado'}.`, { acao: { rotulo: 'Desfazer', fn: () => { void alternar({ ...p, ativo: !p.ativo }); } } });
  }
  async function excluir(p: Parceiro) {
    setErro(''); setMsg('');
    if (!(await confirmar(`Excluir o parceiro "${p.nome}"? Isso não pode ser desfeito. Se só quer parar de usar, prefira desativar.`))) return;
    const { error } = await supabase.from('parceiros').delete().eq('id', p.id);
    if (error) setErro(error.message); else { setMsg(`Parceiro "${p.nome}" excluído.`); setLista((l) => (l ?? []).filter((x) => x.id !== p.id)); }
  }

  const q = busca.trim().toLowerCase();
  const filtrada = (lista ?? []).filter((p) => (!tipo || p.tipo === tipo) && (!q || [p.nome, p.contato, p.email, p.cidade].join(' ').toLowerCase().includes(q)));

  return (
    <>
      <div className="acoes cab-aba">
        <input id="busca-parceiro" placeholder="Buscar parceiro…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select id="filtro-tipo-parceiro" value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo de parceiro">
          <option value="">Todos os tipos</option>{Object.entries(PARCEIRO_TIPO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="primario" onClick={() => { if (aberto && !editando) setAberto(false); else { limpar(); setAberto(true); } }}>{aberto && !editando ? 'Fechar' : '+ Cadastrar parceiro'}</button>
      </div>
      <p className="mudo pequeno">Projetistas, engenheiros, topógrafos, despachantes e fornecedores com quem a Cariati trabalha.</p>
      {msg && <p className="ok-msg" role="status">{msg}</p>}

      {aberto && (
        <form className="card pilha" onSubmit={salvar}>
          <h2>{editando ? 'Editar parceiro' : 'Novo parceiro'}</h2>
          <div className="duas">
            <label>Nome / empresa *<input id="par-nome" value={f.nome} onChange={(e) => set('nome', e.target.value)} /></label>
            <label>Tipo<select id="par-tipo" value={f.tipo} onChange={(e) => set('tipo', e.target.value)}>{Object.entries(PARCEIRO_TIPO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          </div>
          <div className="duas">
            <label>Pessoa<select id="par-pessoa" value={f.tipo_pessoa} onChange={(e) => setF((x) => ({ ...x, tipo_pessoa: e.target.value as 'fisica' | 'juridica', documento: '' }))}><option value="juridica">Jurídica (CNPJ)</option><option value="fisica">Física (CPF)</option></select></label>
            <label>{f.tipo_pessoa === 'fisica' ? 'CPF' : 'CNPJ'}<input id="par-doc" inputMode="numeric" value={formatarDocumento(f.documento, f.tipo_pessoa)} onChange={(e) => set('documento', e.target.value)} /></label>
          </div>
          <div className="duas">
            <label>Pessoa de contato<input id="par-contato" value={f.contato} onChange={(e) => set('contato', e.target.value)} /></label>
            <label>E-mail<input id="par-email" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></label>
          </div>
          <div className="duas">
            <label>Telefone<input id="par-tel" inputMode="tel" value={formatarTelefone(f.telefone)} onChange={(e) => set('telefone', e.target.value)} /></label>
            <label>WhatsApp<input id="par-zap" inputMode="tel" value={formatarTelefone(f.whatsapp)} onChange={(e) => set('whatsapp', e.target.value)} /></label>
          </div>
          <div className="duas">
            <label>Cidade<input id="par-cidade" value={f.cidade} onChange={(e) => set('cidade', e.target.value)} /></label>
            <label>UF<input id="par-uf" maxLength={2} value={f.uf} onChange={(e) => set('uf', e.target.value)} /></label>
          </div>
          <label>Observações<textarea id="par-obs" rows={2} value={f.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></label>
          {erro && <p className="erro" role="alert">{erro}</p>}
          <div className="acoes"><button className="primario">{editando ? 'Salvar alterações' : 'Cadastrar parceiro'}</button><button type="button" onClick={() => { limpar(); setAberto(false); }}>Cancelar</button></div>
        </form>
      )}
      {!aberto && erro && <p className="erro" role="alert">{erro}</p>}

      {lista === null ? <Carregando /> : (
        <div className="viz-tab card">
          <table className="tab-projetos tab-cad">
            <thead><tr><th>Parceiro</th><th>Tipo</th><th>Contato</th><th>Situação</th><th>Ações</th></tr></thead>
            <tbody>
              {filtrada.map((p) => (
                <tr key={p.id} className={p.ativo ? '' : 'inativa'}>
                  <td><b>{p.nome}</b><div className="mudo pequeno">{p.documento ? formatarDocumento(p.documento, p.tipo_pessoa) : 'sem documento'}{p.cidade ? ` · ${p.cidade}${p.uf ? '/' + p.uf : ''}` : ''}</div></td>
                  <td>{PARCEIRO_TIPO[p.tipo] ?? p.tipo}</td>
                  <td>{p.contato ?? <span className="mudo">—</span>}<div className="mudo pequeno">{[p.whatsapp || p.telefone ? formatarTelefone(p.whatsapp || p.telefone || '') : '', p.email].filter(Boolean).join(' · ')}</div></td>
                  <td>{p.ativo ? <span className="situ ok">✓ ativo</span> : <span className="situ atrasada">⏸ inativo</span>}</td>
                  <td className="acoes-linha">
                    <button onClick={() => editar(p)}>Editar</button>
                    <button onClick={() => alternar(p)}>{p.ativo ? 'Desativar' : 'Reativar'}</button>
                    <button className="perigo" onClick={() => excluir(p)}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtrada.length === 0 && <Vazio titulo={lista.length ? 'Nenhum parceiro encontrado' : 'Nenhum parceiro cadastrado ainda'} texto={lista.length ? 'Tente outro nome ou tipo.' : 'Cadastre engenheiros, topógrafos, despachantes e fornecedores para tê-los à mão.'} icone="cadastros" />}
        </div>
      )}
    </>
  );
}

/* ---------------------------------------------------- Quem usa o aplicativo */
const SETORES = Object.entries(SETOR) as [Setor, string][];

function AbaUsuarios() {
  const eu = usePerfil();
  const [pessoas, setPessoas] = useState<Profile[] | null>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState({ nome: '', email: '', senha: '', perfil: 'profissional', setor: 'projetos' as Setor, carga: '40', cliente_id: '' });
  const [esp, setEsp] = useState<Especialidade[]>([]);
  const [ver, setVer] = useState(false);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [criado, setCriado] = useState<{ nome: string; email: string; senha: string; titulo: string } | null>(null);
  const [busca, setBusca] = useState('');

  const carregar = useCallback(async () => {
    const [p, c] = await Promise.all([supabase.from('profiles').select('*').order('nome'), supabase.from('clientes').select('id,nome,codigo').order('nome')]);
    setPessoas((p.data as Profile[]) ?? []); setClientes((c.data as Cliente[]) ?? []);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));

  function abrirForm() { setAberto(true); setCriado(null); setErro(''); setVer(true); setF({ nome: '', email: '', senha: gerarSenha(), perfil: 'profissional', setor: 'projetos', carga: '40', cliente_id: '' }); setEsp([]); }

  async function criar(e: React.FormEvent) {
    e.preventDefault(); setErro('');
    if (!f.nome.trim()) return setErro('Informe o nome.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) return setErro('Informe um e-mail válido.');
    if (f.senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.');
    if (f.perfil === 'cliente' && !f.cliente_id) return setErro('Escolha o cadastro do cliente que vai usar este acesso.');
    setSalvando(true);
    const { error } = await supabase.rpc('admin_criar_usuario', {
      p_email: f.email.trim(), p_senha: f.senha, p_nome: f.nome.trim(), p_perfil: f.perfil, p_setor: f.setor,
      p_especialidades: f.perfil === 'profissional' ? esp : [], p_cliente_id: f.perfil === 'cliente' ? f.cliente_id : null, p_carga: Number(f.carga) || 0,
    });
    setSalvando(false);
    if (error) return setErro(error.message);
    setCriado({ nome: f.nome.trim(), email: f.email.trim().toLowerCase(), senha: f.senha, titulo: 'Acesso criado' }); setAberto(false); carregar();
  }

  async function redefinir(p: Profile) {
    setErro(''); setCriado(null);
    const sugestao = gerarSenha();
    const nova = await pedirTexto(`Nova senha para ${p.nome} (mínimo 8 caracteres). Sugestão: ${sugestao} — digite-a ou crie a sua.`);
    if (!nova) return;
    const { error } = await supabase.rpc('admin_redefinir_senha', { p_id: p.id, p_senha: nova });
    if (error) return setErro(error.message);
    setCriado({ nome: p.nome, email: p.email ?? '', senha: nova, titulo: 'Senha redefinida' });
  }
  async function trocarEmail(p: Profile) {
    setErro(''); setCriado(null);
    const novo = await pedirTexto(`Novo e-mail de login para ${p.nome}:`);
    if (!novo) return;
    const { error } = await supabase.rpc('admin_alterar_email', { p_id: p.id, p_email: novo });
    if (error) setErro(error.message); else carregar();
  }
  async function ativar(p: Profile) {
    setErro('');
    setPessoas((l) => (l ?? []).map((x) => (x.id === p.id ? { ...x, ativo: !x.ativo } : x)));
    const { error } = await supabase.from('profiles').update({ ativo: !p.ativo }).eq('id', p.id);
    if (error) { setErro(error.message); carregar(); return; }
    avisar(`Acesso de ${p.nome} ${p.ativo ? 'desativado' : 'reativado'}.`, { acao: { rotulo: 'Desfazer', fn: () => { void ativar({ ...p, ativo: !p.ativo }); } } });
  }
  async function excluir(p: Profile) {
    setErro(''); setCriado(null);
    if (!(await confirmar(`Excluir o acesso de ${p.nome}${p.email ? ` (${p.email})` : ''}? A pessoa não consegue mais entrar e isso não pode ser desfeito. Se ela já trabalhou em projetos ou registrou tempo, o sistema vai recusar: nesse caso, desative o acesso.`))) return;
    const { error } = await supabase.rpc('admin_excluir_usuario', { p_id: p.id });
    if (error) setErro(error.message); else setPessoas((l) => (l ?? []).filter((x) => x.id !== p.id));
  }

  const q = busca.trim().toLowerCase();
  const filtrada = useMemo(() => (pessoas ?? []).filter((p) => !q || `${p.nome} ${p.email ?? ''}`.toLowerCase().includes(q)), [pessoas, q]);
  const nomeCliente = (id: string | null) => clientes.find((c) => c.id === id)?.nome;

  return (
    <>
      <div className="acoes cab-aba">
        <input id="busca-usuario" placeholder="Buscar por nome ou e-mail…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <button className="primario" onClick={() => (aberto ? setAberto(false) : abrirForm())}>{aberto ? 'Fechar' : '+ Cadastrar acesso'}</button>
      </div>
      <p className="mudo pequeno">Cada pessoa entra com e-mail e senha e vê só o que o perfil dela permite. Por segurança, a senha fica guardada de forma criptografada: ninguém, nem você, consegue ler uma senha depois de criada. Se alguém esquecer, use <b>Redefinir senha</b>.</p>

      {criado && (
        <section className="card credenciais" role="status">
          <h2>{criado.titulo} — {criado.nome}</h2>
          <p className="mudo pequeno">Copie e envie agora. Esta senha só aparece nesta tela.</p>
          <div className="senha-linha"><span>E-mail</span><code id="cred-email">{criado.email}</code></div>
          <div className="senha-linha"><span>Senha</span><code id="cred-senha">{criado.senha}</code></div>
          <div className="acoes">
            <button onClick={() => copiar(`Acesso ao Projetos Cariati\nEndereço: ${location.origin}\nE-mail: ${criado.email}\nSenha: ${criado.senha}`)}>Copiar mensagem de acesso</button>
            <button onClick={() => setCriado(null)}>Ocultar</button>
          </div>
        </section>
      )}

      {aberto && (
        <form className="card pilha" onSubmit={criar}>
          <h2>Novo acesso ao aplicativo</h2>
          <div className="duas">
            <label>Nome *<input id="usr-nome" value={f.nome} onChange={(e) => set('nome', e.target.value)} /></label>
            <label>E-mail de login *<input id="usr-email" type="email" autoComplete="off" value={f.email} onChange={(e) => set('email', e.target.value)} /></label>
          </div>
          <label>Senha inicial * <span className="mudo pequeno">(mínimo 8 caracteres)</span>
            <span className="senha-campo">
              <input id="usr-senha" type={ver ? 'text' : 'password'} autoComplete="new-password" value={f.senha} onChange={(e) => set('senha', e.target.value)} />
              <button type="button" onClick={() => setVer((v) => !v)}>{ver ? 'Ocultar' : 'Mostrar'}</button>
              <button type="button" onClick={() => { set('senha', gerarSenha()); setVer(true); }}>Gerar outra</button>
            </span>
          </label>
          <div className="duas">
            <label>Perfil
              <select id="usr-perfil" value={f.perfil} onChange={(e) => set('perfil', e.target.value)}>{Object.entries(PERFIL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </label>
            {f.perfil !== 'cliente' ? (
              <label>Setor<select id="usr-setor" value={f.setor} onChange={(e) => set('setor', e.target.value)}>{SETORES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            ) : (
              <label>Cliente vinculado *
                <select id="usr-cliente" value={f.cliente_id} onChange={(e) => set('cliente_id', e.target.value)}>
                  <option value="">— escolha o cadastro do cliente —</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.codigo ? ` (${c.codigo})` : ''}</option>)}
                </select>
              </label>
            )}
          </div>
          {f.perfil === 'profissional' && (
            <>
              <label>Carga horária semanal (h)<input id="usr-carga" type="number" min={0} max={80} step={0.5} value={f.carga} onChange={(e) => set('carga', e.target.value)} /></label>
              <fieldset><legend>Especialidades</legend>
                <div className="etiquetas">{(Object.keys(ESPECIALIDADE) as Especialidade[]).map((x) => (
                  <label className="check" key={x}><input type="checkbox" checked={esp.includes(x)} onChange={() => setEsp((l) => (l.includes(x) ? l.filter((y) => y !== x) : [...l, x]))} />{ESPECIALIDADE[x]}</label>
                ))}</div>
              </fieldset>
            </>
          )}
          {f.perfil === 'admin' && <p className="aviso">O administrador enxerga e gerencia tudo, inclusive estes cadastros e as senhas dos outros.</p>}
          {erro && <p className="erro" role="alert">{erro}</p>}
          <div className="acoes"><button className="primario" disabled={salvando}>{salvando ? 'Criando…' : 'Criar acesso'}</button><button type="button" onClick={() => setAberto(false)}>Cancelar</button></div>
        </form>
      )}
      {!aberto && erro && <p className="erro" role="alert">{erro}</p>}

      {pessoas === null ? <Carregando /> : (
        <div className="viz-tab card">
          <table className="tab-projetos tab-cad">
            <thead><tr><th>Pessoa</th><th>Perfil</th><th>Situação</th><th>Ações</th></tr></thead>
            <tbody>
              {filtrada.map((p) => { const sou = p.id === eu.id; return (
                <tr key={p.id} className={p.ativo ? '' : 'inativa'}>
                  <td><b>{p.nome}</b>{sou ? ' (você)' : ''}<div className="mudo pequeno">{p.email ?? 'e-mail não informado'}</div></td>
                  <td>{PERFIL[p.perfil]}<div className="mudo pequeno">{p.perfil === 'cliente' ? (nomeCliente(p.cliente_id) ?? 'sem cliente vinculado') : SETOR[p.setor]}</div></td>
                  <td>{p.ativo ? <span className="situ ok">✓ ativo</span> : <span className="situ atrasada">⏸ desativado</span>}</td>
                  <td className="acoes-linha">
                    <button onClick={() => redefinir(p)}>Redefinir senha</button>
                    <button onClick={() => trocarEmail(p)}>Trocar e-mail</button>
                    <button disabled={sou} onClick={() => ativar(p)} title={sou ? 'Você não pode desativar o próprio acesso' : ''}>{p.ativo ? 'Desativar' : 'Reativar'}</button>
                    <button className="perigo" disabled={sou} onClick={() => excluir(p)} title={sou ? 'Você não pode excluir o próprio acesso' : ''}>Excluir</button>
                  </td>
                </tr>
              ); })}
            </tbody>
          </table>
          {filtrada.length === 0 && <Vazio titulo="Ninguém encontrado" texto="Confira o nome ou o e-mail digitado." icone="usuario" />}
        </div>
      )}
      <p className="mudo pequeno">Permissões finas (especialidades, setor, carga horária) de quem já existe ficam em <Link to="/equipe">Equipe</Link>.</p>
    </>
  );
}
