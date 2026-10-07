import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Cliente, Profile, Projeto } from '../lib/types';
import { CONTATOS, ESTADOS_CIVIS, INTENCOES, ORIGENS, UFS, cnpjValido, completude, cpfValido, digitos, formatarCep, formatarCnpj, formatarCpf, formatarDocumento, formatarTelefone } from '../lib/cadastro';
import { PROJETO_STATUS, fmtData } from '../lib/labels';
import { pessoaPodeEditarClientes, usePerfil } from '../lib/perfil';
import { Medidor } from '../components/graficos';
import { Carregando, Vazio } from '../ui/Holo';
import { avisar } from '../ui/avisos';
import { perfilPorId, useCatalogo } from '../lib/servicos';
import { EscolherServicos, ResumoServicos, type Escolha } from '../components/ServicosCliente';

type Form = Record<string, string | boolean | null>;
const TEXTOS = ['codigo', 'nome', 'categoria', 'documento', 'rg', 'estado_civil', 'nacionalidade', 'profissao', 'telefone', 'telefone2', 'whatsapp', 'email', 'contato_preferido', 'origem', 'indicado_por',
  'end_cep', 'end_logradouro', 'end_numero', 'end_complemento', 'end_bairro', 'end_cidade', 'end_uf', 'empresa_razao_social', 'empresa_cnpj', 'empresa_responsavel', 'empresa_responsavel_cpf',
  'obra_intencao', 'obra_cep', 'obra_logradouro', 'obra_numero', 'obra_complemento', 'obra_bairro', 'obra_cidade', 'obra_uf', 'obra_condominio', 'obra_lote', 'obra_quadra',
  'obra_inscricao_municipal', 'obra_matricula', 'observacoes'] as const;

/** O banco ainda não tem as colunas de serviços (migração 0018)? Então grava o cadastro sem elas. */
const semColunaServicos = (m: string) => /servico|schema cache|column/i.test(m);
const semServicos = (c: Record<string, unknown>) => { const { servicos, servico_estudo, servico_aprovacao, servicos_observacao, ...resto } = c; void servicos; void servico_estudo; void servico_aprovacao; void servicos_observacao; return resto; };

function Campo({ rotulo, children, largo }: { rotulo: string; children: ReactNode; largo?: boolean }) {
  return <label className={largo ? 'campo largo' : 'campo'}>{rotulo}{children}</label>;
}
function Secao({ titulo, sub, children }: { titulo: string; sub?: string; children: ReactNode }) {
  return <section className="card secao"><h2>{titulo}</h2>{sub && <p className="mudo pequeno">{sub}</p>}<div className="grade-campos">{children}</div></section>;
}

/** Cadastro completo de um cliente (novo ou existente). */
export default function ClienteDetalhe() {
  const { id } = useParams();
  const novo = id === 'novo';
  const nav = useNavigate();
  const eu = usePerfil();
  const pode = pessoaPodeEditarClientes(eu);
  const [f, setF] = useState<Form>({ tipo_pessoa: 'fisica', nacionalidade: 'Brasileira', premium: false, obra_financiada: null });
  const [pessoas, setPessoas] = useState<Profile[]>([]);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [meta, setMeta] = useState<{ atualizado_em?: string; por?: string } | null>(null);
  const [carregando, setCarregando] = useState(!novo);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const [cepMsg, setCepMsg] = useState('');
  const [passo, setPasso] = useState(0);
  const [rascunho, setRascunho] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!novo) return;
    try { const r = localStorage.getItem('rascunho-cliente'); if (r) { setF((x) => ({ ...x, ...JSON.parse(r) })); setRascunho(true); } } catch { /* sem rascunho */ }
  }, [novo]);
  useEffect(() => {
    if (!novo) return;
    const t = setTimeout(() => { try { if (f.nome) localStorage.setItem('rascunho-cliente', JSON.stringify(f)); } catch { /* ignora */ } }, 600);
    return () => clearTimeout(t);
  }, [f, novo]);

  useEffect(() => {
    supabase.from('profiles').select('*').neq('perfil', 'cliente').eq('ativo', true).order('nome').then(({ data }) => setPessoas((data as Profile[]) ?? []));
    if (novo) return;
    Promise.all([
      supabase.from('clientes').select('*').eq('id', id!).single(),
      supabase.from('projetos').select('*').eq('cliente_id', id!).order('created_at', { ascending: false }),
    ]).then(([c, p]) => {
      const d = c.data as Cliente | null;
      if (d) {
        const x: Form = { ...(d as unknown as Form) };
        x.documento = formatarDocumento(d.documento ?? '', d.tipo_pessoa); x.empresa_cnpj = formatarCnpj(d.empresa_cnpj ?? ''); x.empresa_responsavel_cpf = formatarCpf(d.empresa_responsavel_cpf ?? '');
        x.telefone = formatarTelefone(d.telefone ?? ''); x.telefone2 = formatarTelefone(d.telefone2 ?? ''); x.whatsapp = formatarTelefone(d.whatsapp ?? '');
        x.obra_metragem = d.obra_metragem === null || d.obra_metragem === undefined ? '' : String(d.obra_metragem).replace('.', ',');
        x.servicos_ids = (d.servicos ?? []).join(','); x.servico_estudo = d.servico_estudo ?? ''; x.servico_aprovacao = d.servico_aprovacao ?? ''; x.servicos_observacao = d.servicos_observacao ?? '';
        setF(x); setMeta({ atualizado_em: d.atualizado_em, por: pessoas.find((q) => q.id === d.atualizado_por)?.nome });
      }
      setProjetos((p.data as Projeto[]) ?? []); setCarregando(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const v = (k: string) => (f[k] as string | null | undefined) ?? '';
  const set = (k: string, val: string | boolean | null) => { setF((x) => ({ ...x, [k]: val })); setOk(''); };
  const catalogo = useCatalogo();
  const juridica = f.tipo_pessoa === 'juridica';
  const escolha: Escolha = { perfil: String(f.categoria ?? ''), ids: String(f.servicos_ids ?? '').split(',').filter(Boolean), estudo: String(f.servico_estudo ?? ''), aprovacao: String(f.servico_aprovacao ?? ''), obs: String(f.servicos_observacao ?? '') };
  const setEscolha = (e: Escolha) => { setF((x) => ({ ...x, categoria: e.perfil, servicos_ids: e.ids.join(','), servico_estudo: e.estudo, servico_aprovacao: e.aprovacao, servicos_observacao: e.obs })); setOk(''); };
  const PASSOS = ['Identificação', 'Contato', 'Endereço', 'Obra', 'Observações', 'Serviços', 'Confirmação'];
  const mostra = (k: number) => !novo || passo === k;
  const avancar = () => {
    const bloco = form.current?.querySelectorAll('.passo')[passo];
    const invalido = bloco?.querySelector(':invalid') as HTMLInputElement | null;
    if (invalido) { invalido.reportValidity(); return; }
    setPasso((x) => Math.min(PASSOS.length - 1, x + 1)); window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const [comEmpresa, setComEmpresa] = useState(false);
  const mostrarEmpresa = juridica || comEmpresa || !!v('empresa_razao_social');
  const comp = completude({ ...(f as unknown as Cliente), obra_metragem: v('obra_metragem') ? 1 : null, obra_financiada: f.obra_financiada as boolean | null });

  async function buscarCep(p: 'end' | 'obra') {
    const cep = digitos(v(`${p}_cep`));
    if (cep.length !== 8) return setCepMsg('Digite os 8 números do CEP.');
    setCepMsg('Buscando…');
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`); const d = await r.json();
      if (d.erro) return setCepMsg('CEP não encontrado.');
      setF((x) => ({ ...x, [`${p}_logradouro`]: x[`${p}_logradouro`] || d.logradouro, [`${p}_bairro`]: x[`${p}_bairro`] || d.bairro, [`${p}_cidade`]: x[`${p}_cidade`] || d.localidade, [`${p}_uf`]: x[`${p}_uf`] || d.uf }));
      setCepMsg('');
    } catch { setCepMsg('Não foi possível buscar o CEP agora. Preencha o endereço à mão.'); }
  }
  const copiarEndereco = () => setF((x) => ({ ...x, obra_cep: x.end_cep, obra_logradouro: x.end_logradouro, obra_numero: x.end_numero, obra_complemento: x.end_complemento, obra_bairro: x.end_bairro, obra_cidade: x.end_cidade, obra_uf: x.end_uf }));

  async function salvar(e: FormEvent) {
    e.preventDefault(); setErro(''); setOk('');
    const doc = digitos(v('documento'));
    if (doc && (juridica ? !cnpjValido(doc) : !cpfValido(doc))) return setErro(juridica ? 'O CNPJ informado não é válido.' : 'O CPF informado não é válido.');
    if (digitos(v('empresa_cnpj')) && !cnpjValido(v('empresa_cnpj'))) return setErro('O CNPJ da empresa não é válido.');
    if (digitos(v('empresa_responsavel_cpf')) && !cpfValido(v('empresa_responsavel_cpf'))) return setErro('O CPF do responsável pela empresa não é válido.');
    const corpo: Record<string, unknown> = { tipo_pessoa: f.tipo_pessoa, premium: !!f.premium, obra_financiada: f.obra_financiada ?? null, data_nascimento: v('data_nascimento') || null, responsavel_comercial: v('responsavel_comercial') || null };
    corpo.servicos = escolha.ids; corpo.servico_estudo = escolha.estudo || null; corpo.servico_aprovacao = escolha.ids.includes('legal') ? escolha.aprovacao || null : null; corpo.servicos_observacao = escolha.obs.trim() || null;
    for (const k of TEXTOS) corpo[k] = v(k).trim() || null;
    corpo.documento = doc || null; corpo.empresa_cnpj = digitos(v('empresa_cnpj')) || null; corpo.empresa_responsavel_cpf = digitos(v('empresa_responsavel_cpf')) || null;
    const m = v('obra_metragem').replace(',', '.'); corpo.obra_metragem = m && Number.isFinite(Number(m)) ? Number(m) : null;
    setBusy(true);
    try {
      if (novo) {
        let r = await supabase.from('clientes').insert(corpo).select('id').single();
        if (r.error && semColunaServicos(r.error.message)) { r = await supabase.from('clientes').insert(semServicos(corpo)).select('id').single(); avisar('Cliente salvo, mas os serviços não foram gravados: rode o atualizar_0018.sql no Supabase.', { tipo: 'erro' }); }
        const { data, error } = r;
        if (error) throw error;
        try { localStorage.removeItem('rascunho-cliente'); } catch { /* ignora */ }
        avisar('Cliente cadastrado.');
        nav(`/clientes/${data.id}`, { replace: true });
      } else {
        let r = await supabase.from('clientes').update(corpo).eq('id', id!);
        if (r.error && semColunaServicos(r.error.message)) { r = await supabase.from('clientes').update(semServicos(corpo)).eq('id', id!); avisar('Cadastro salvo, mas os serviços não foram gravados: rode o atualizar_0018.sql no Supabase.', { tipo: 'erro' }); }
        const { error } = r;
        if (error) throw error;
        setOk('Cadastro salvo.'); setMeta({ atualizado_em: new Date().toISOString(), por: eu.nome });
      }
    } catch (err) {
      const msg = (err as Error).message || '';
      setErro(/clientes_documento_unico|duplicate key/.test(msg) ? (/codigo/.test(msg) ? 'Já existe um cliente com este código.' : 'Já existe um cliente cadastrado com este CPF/CNPJ.') : msg);
    }
    setBusy(false);
  }

  if (carregando) return <Carregando tipo="cartoes" n={2} texto="Carregando cadastro…" />;
  const wa = digitos(v('whatsapp') || v('telefone'));

  return (
    <>
      <p><Link to="/clientes">← Clientes</Link></p>
      <div className="titulo">
        <div>
          <h1>{novo ? 'Novo cliente' : v('nome') || 'Cliente'}</h1>
          {!novo && <div className="mudo">{v('codigo') || 'sem código'} · {juridica ? 'Pessoa jurídica' : 'Pessoa física'}{v('categoria') ? ` · perfil ${v('categoria')}` : ''}{f.premium ? ' · premium' : ''}</div>}
        </div>
        {!novo && (
          <div className="acoes">
            {wa.length >= 10 && <a className="btn" href={`https://wa.me/55${wa}`} target="_blank" rel="noreferrer">WhatsApp</a>}
            {v('email') && <a className="btn" href={`mailto:${v('email')}`}>E-mail</a>}
            {pode && <Link className="primario btn" to={`/projetos/novo?cliente=${id}`}>+ Novo projeto</Link>}
          </div>
        )}
      </div>

      <section className="card completude">
        <div className="viz-pct"><Medidor valor={comp.pct} max={100} aviso={2} perigo={2} rotulo="Cadastro completo" /><em><b>{comp.pct}%</b> completo</em></div>
        {comp.faltando.length > 0 ? <p className="mudo pequeno">Falta preencher: {comp.faltando.join(', ')}.</p> : <p className="mudo pequeno">✓ Todos os dados do levantamento estão preenchidos.</p>}
        {!pode && <p className="aviso">Você pode consultar este cadastro. Quem edita é o administrador, o Administrativo, o Comercial e o Financeiro.</p>}
      </section>

      {novo && (
        <>
          <ol className="passos" aria-label="Etapas do cadastro">
            {PASSOS.map((n, k) => <li key={n} className={k === passo ? 'atual' : k < passo ? 'feito' : ''} aria-current={k === passo ? 'step' : undefined}><button type="button" onClick={() => (k <= passo ? setPasso(k) : undefined)} disabled={k > passo}><i>{k < passo ? '✓' : k + 1}</i><span>{n}</span></button></li>)}
          </ol>
          {rascunho && <p className="aviso">Recuperei o rascunho que você deixou aberto. <button type="button" className="link" onClick={() => { try { localStorage.removeItem('rascunho-cliente'); } catch { /* ignora */ } setF({ tipo_pessoa: 'fisica', nacionalidade: 'Brasileira', premium: false, obra_financiada: null }); setRascunho(false); setPasso(0); }}>Descartar rascunho</button></p>}
          <p className="mudo pequeno">O que você digita é salvo automaticamente neste aparelho até concluir o cadastro.</p>
        </>
      )}
      {!novo && (escolha.ids.length > 0 || !!perfilPorId(escolha.perfil)) && <ResumoServicos v={escolha} />}
      <form onSubmit={salvar} ref={form}>
        <fieldset disabled={!pode} className="sem-borda">
          <div className="passo" hidden={!mostra(0)}>
          <Secao titulo="Identificação">
            <Campo rotulo="Tipo de cliente" largo>
              <span className="radios">
                <label className="check"><input type="radio" name="tp" checked={!juridica} onChange={() => set('tipo_pessoa', 'fisica')} />Pessoa física</label>
                <label className="check"><input type="radio" name="tp" checked={juridica} onChange={() => set('tipo_pessoa', 'juridica')} />Pessoa jurídica</label>
              </span>
            </Campo>
            <Campo rotulo={juridica ? 'Nome fantasia ou nome do contato' : 'Nome completo'} largo><input required value={v('nome')} onChange={(e) => set('nome', e.target.value)} /></Campo>
            <Campo rotulo="Código"><input placeholder="CA000123" value={v('codigo')} onChange={(e) => set('codigo', e.target.value.toUpperCase())} /></Campo>
            <Campo rotulo="Perfil (por metragem · D e E: + Projetos)"><select value={v('categoria')} onChange={(e) => { set('categoria', e.target.value); const pf = perfilPorId(e.target.value); if (pf) set('servico_estudo', pf.estudo); }}><option value="">—</option>{!perfilPorId(v('categoria')) && v('categoria') && <option value={v('categoria')}>{v('categoria')} (antigo)</option>}{catalogo.perfis.filter((c) => c.ativo || c.id === v('categoria')).map((c) => <option key={c.id} value={c.id}>{c.nome} · {c.faixa}</option>)}</select></Campo>
            <label className="check campo largo"><input type="checkbox" checked={!!f.premium} onChange={(e) => set('premium', e.target.checked)} />Cliente premium (pendrive na entrega)</label>
          </Secao>

          <Secao titulo={juridica ? 'Dados da empresa' : 'Dados pessoais'}>
            <Campo rotulo={juridica ? 'CNPJ' : 'CPF'}><input inputMode="numeric" value={v('documento')} onChange={(e) => set('documento', formatarDocumento(e.target.value, juridica ? 'juridica' : 'fisica'))} placeholder={juridica ? '00.000.000/0000-00' : '000.000.000-00'} /></Campo>
            {!juridica && <>
              <Campo rotulo="RG (documento de identidade)"><input value={v('rg')} onChange={(e) => set('rg', e.target.value)} /></Campo>
              <Campo rotulo="Data de nascimento"><input type="date" value={v('data_nascimento')} onChange={(e) => set('data_nascimento', e.target.value)} /></Campo>
              <Campo rotulo="Estado civil"><select value={v('estado_civil')} onChange={(e) => set('estado_civil', e.target.value)}><option value="">—</option>{ESTADOS_CIVIS.map((c) => <option key={c}>{c}</option>)}</select></Campo>
              <Campo rotulo="Nacionalidade"><input value={v('nacionalidade')} onChange={(e) => set('nacionalidade', e.target.value)} /></Campo>
              <Campo rotulo="Profissão"><input value={v('profissao')} onChange={(e) => set('profissao', e.target.value)} /></Campo>
            </>}
          </Secao>

          {(mostrarEmpresa || !juridica) && (
            <Secao titulo="Empresa" sub={juridica ? 'Quem assina o contrato pela empresa.' : 'Preencha só se o contrato for em nome de uma empresa.'}>
              {!juridica && !mostrarEmpresa && <label className="check campo largo"><input type="checkbox" checked={comEmpresa} onChange={(e) => setComEmpresa(e.target.checked)} />O contrato é em nome de uma empresa</label>}
              {mostrarEmpresa && <>
                {!juridica && <Campo rotulo="CNPJ"><input inputMode="numeric" value={v('empresa_cnpj')} onChange={(e) => set('empresa_cnpj', formatarCnpj(e.target.value))} /></Campo>}
                <Campo rotulo="Razão social" largo={juridica}><input value={v('empresa_razao_social')} onChange={(e) => set('empresa_razao_social', e.target.value)} /></Campo>
                <Campo rotulo="Responsável que assina (constante no contrato social)"><input value={v('empresa_responsavel')} onChange={(e) => set('empresa_responsavel', e.target.value)} /></Campo>
                <Campo rotulo="CPF do responsável"><input inputMode="numeric" value={v('empresa_responsavel_cpf')} onChange={(e) => set('empresa_responsavel_cpf', formatarCpf(e.target.value))} /></Campo>
              </>}
            </Secao>
          )}

          </div>
          <div className="passo" hidden={!mostra(1)}>
          <Secao titulo="Contato">
            <Campo rotulo="Telefone"><input inputMode="tel" value={v('telefone')} onChange={(e) => set('telefone', formatarTelefone(e.target.value))} /></Campo>
            <Campo rotulo="WhatsApp"><input inputMode="tel" value={v('whatsapp')} onChange={(e) => set('whatsapp', formatarTelefone(e.target.value))} /></Campo>
            <Campo rotulo="Outro telefone"><input inputMode="tel" value={v('telefone2')} onChange={(e) => set('telefone2', formatarTelefone(e.target.value))} /></Campo>
            <Campo rotulo="E-mail"><input type="email" value={v('email')} onChange={(e) => set('email', e.target.value)} /></Campo>
            <Campo rotulo="Prefere ser contatado por"><select value={v('contato_preferido')} onChange={(e) => set('contato_preferido', e.target.value)}><option value="">—</option>{CONTATOS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></Campo>
            <Campo rotulo="Como chegou ao escritório"><select value={v('origem')} onChange={(e) => set('origem', e.target.value)}><option value="">—</option>{ORIGENS.map((o) => <option key={o}>{o}</option>)}</select></Campo>
            <Campo rotulo="Indicado por"><input value={v('indicado_por')} onChange={(e) => set('indicado_por', e.target.value)} /></Campo>
            <Campo rotulo="Responsável comercial"><select value={v('responsavel_comercial')} onChange={(e) => set('responsavel_comercial', e.target.value)}><option value="">—</option>{pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></Campo>
          </Secao>

          </div>
          <div className="passo" hidden={!mostra(2)}>
          <Secao titulo="Endereço atual do cliente">
            <Campo rotulo="CEP"><span className="com-botao"><input inputMode="numeric" value={v('end_cep')} onChange={(e) => set('end_cep', formatarCep(e.target.value))} onBlur={() => digitos(v('end_cep')).length === 8 && !v('end_logradouro') && buscarCep('end')} /><button type="button" onClick={() => buscarCep('end')}>Buscar</button></span></Campo>
            <Campo rotulo="Rua, avenida…" largo><input value={v('end_logradouro')} onChange={(e) => set('end_logradouro', e.target.value)} /></Campo>
            <Campo rotulo="Número"><input value={v('end_numero')} onChange={(e) => set('end_numero', e.target.value)} /></Campo>
            <Campo rotulo="Complemento"><input value={v('end_complemento')} onChange={(e) => set('end_complemento', e.target.value)} /></Campo>
            <Campo rotulo="Bairro"><input value={v('end_bairro')} onChange={(e) => set('end_bairro', e.target.value)} /></Campo>
            <Campo rotulo="Cidade"><input value={v('end_cidade')} onChange={(e) => set('end_cidade', e.target.value)} /></Campo>
            <Campo rotulo="UF"><select value={v('end_uf')} onChange={(e) => set('end_uf', e.target.value)}><option value="">—</option>{UFS.map((u) => <option key={u}>{u}</option>)}</select></Campo>
            {cepMsg && <p className="mudo pequeno campo largo">{cepMsg}</p>}
          </Secao>

          </div>
          <div className="passo" hidden={!mostra(3)}>
          <Secao titulo="Dados da obra" sub="O que o levantamento de dados do protocolo pede.">
            <Campo rotulo="Intenção do projeto"><select value={v('obra_intencao')} onChange={(e) => set('obra_intencao', e.target.value)}><option value="">—</option>{INTENCOES.map((o) => <option key={o}>{o}</option>)}</select></Campo>
            <Campo rotulo="Metragem aproximada (m²)"><input inputMode="decimal" value={v('obra_metragem')} onChange={(e) => set('obra_metragem', e.target.value.replace(/[^\d,.]/g, ''))} /></Campo>
            <Campo rotulo="Obra financiada?"><select value={f.obra_financiada === null || f.obra_financiada === undefined ? '' : f.obra_financiada ? 'sim' : 'nao'} onChange={(e) => set('obra_financiada', e.target.value === '' ? null : e.target.value === 'sim')}><option value="">Não informado</option><option value="sim">Sim</option><option value="nao">Não</option></select></Campo>
            <div className="campo largo"><button type="button" onClick={copiarEndereco}>Usar o mesmo endereço do cliente</button></div>
            <Campo rotulo="CEP da obra"><span className="com-botao"><input inputMode="numeric" value={v('obra_cep')} onChange={(e) => set('obra_cep', formatarCep(e.target.value))} onBlur={() => digitos(v('obra_cep')).length === 8 && !v('obra_logradouro') && buscarCep('obra')} /><button type="button" onClick={() => buscarCep('obra')}>Buscar</button></span></Campo>
            <Campo rotulo="Rua, avenida…" largo><input value={v('obra_logradouro')} onChange={(e) => set('obra_logradouro', e.target.value)} /></Campo>
            <Campo rotulo="Número"><input value={v('obra_numero')} onChange={(e) => set('obra_numero', e.target.value)} /></Campo>
            <Campo rotulo="Complemento"><input value={v('obra_complemento')} onChange={(e) => set('obra_complemento', e.target.value)} /></Campo>
            <Campo rotulo="Bairro"><input value={v('obra_bairro')} onChange={(e) => set('obra_bairro', e.target.value)} /></Campo>
            <Campo rotulo="Cidade"><input value={v('obra_cidade')} onChange={(e) => set('obra_cidade', e.target.value)} /></Campo>
            <Campo rotulo="UF"><select value={v('obra_uf')} onChange={(e) => set('obra_uf', e.target.value)}><option value="">—</option>{UFS.map((u) => <option key={u}>{u}</option>)}</select></Campo>
            <Campo rotulo="Condomínio ou loteamento"><input value={v('obra_condominio')} onChange={(e) => set('obra_condominio', e.target.value)} /></Campo>
            <Campo rotulo="Lote"><input value={v('obra_lote')} onChange={(e) => set('obra_lote', e.target.value)} /></Campo>
            <Campo rotulo="Quadra"><input value={v('obra_quadra')} onChange={(e) => set('obra_quadra', e.target.value)} /></Campo>
            <Campo rotulo="Inscrição municipal (IPTU)"><input value={v('obra_inscricao_municipal')} onChange={(e) => set('obra_inscricao_municipal', e.target.value)} /></Campo>
            <Campo rotulo="Matrícula do imóvel"><input value={v('obra_matricula')} onChange={(e) => set('obra_matricula', e.target.value)} /></Campo>
          </Secao>

          </div>
          <div className="passo" hidden={!mostra(4)}>
          <Secao titulo="Observações"><Campo rotulo="Anotações sobre o cliente" largo><textarea rows={4} value={v('observacoes')} onChange={(e) => set('observacoes', e.target.value)} /></Campo></Secao>
          </div>
          <div className="passo" hidden={!mostra(5)}>
            <section className="card secao">
              <h2>Serviços contratados</h2>
              <p className="mudo pequeno">Marque o que o escritório vai entregar a este cliente. Isso define as etapas do fluxo e já preenche o “Novo projeto”.</p>
              <EscolherServicos v={escolha} aoMudar={setEscolha} metragem={Number(v('obra_metragem').replace(',', '.')) || undefined} desabilitado={!pode} />
            </section>
          </div>
          {novo && (
            <div className="passo" hidden={!mostra(6)}>
              <section className="card secao">
                <h2>Confirme o cadastro</h2>
                <dl className="confirma">
                  <dt>Cliente</dt><dd>{v('nome') || '—'}{v('codigo') ? ` · ${v('codigo')}` : ''}{v('categoria') ? ` · perfil ${v('categoria')}` : ''}</dd>
                  <dt>Documento</dt><dd>{v('documento') || '—'}</dd>
                  <dt>Contato</dt><dd>{[v('whatsapp') || v('telefone'), v('email')].filter(Boolean).join(' · ') || '—'}</dd>
                  <dt>Obra</dt><dd>{[v('obra_intencao'), v('obra_metragem') ? `${v('obra_metragem')} m²` : '', v('obra_cidade')].filter(Boolean).join(' · ') || '—'}</dd>
                </dl>
              </section>
              <ResumoServicos v={escolha} />
            </div>
          )}
        </fieldset>

        {erro && <p className="erro" role="alert">{erro}</p>}
        {ok && <p className="mudo" role="status">✓ {ok}</p>}
        {pode && (
          <div className="barra-salvar">
            {novo && passo > 0 && <button type="button" onClick={() => setPasso((x) => x - 1)}>Voltar</button>}
            {novo && passo < PASSOS.length - 1
              ? <button key="avancar" type="button" className="primario" onClick={avancar}>Avançar</button>
              : <button key="salvar" className="primario" disabled={busy}>{busy ? 'Salvando…' : novo ? 'Cadastrar cliente' : 'Salvar cadastro'}</button>}
            {meta?.atualizado_em && <span className="mudo pequeno">Atualizado em {fmtData(meta.atualizado_em)}{meta.por ? ` por ${meta.por}` : ''}</span>}
          </div>
        )}
      </form>

      {!novo && (
        <section className="card">
          <h2>Projetos do cliente <span className="badge">{projetos.length}</span></h2>
          {projetos.length === 0 ? <p className="mudo">Nenhum projeto ainda.</p> : (
            <ul className="lista">{projetos.map((p) => (
              <li key={p.id}><Link to={`/projetos/${p.id}`}><b>{p.nome}</b><span className={`tag ${p.status}`} style={{ marginLeft: 8 }}>{PROJETO_STATUS[p.status]}</span><span className="mudo pequeno"> · criado em {fmtData(p.created_at)}</span></Link></li>
            ))}</ul>
          )}
        </section>
      )}
    </>
  );
}
