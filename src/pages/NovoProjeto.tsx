import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Cliente, Profile } from '../lib/types';
import { TIPOS_APROVACAO, TIPO_ESTUDO, TIPO_ESTUDO_DESC } from '../lib/labels';
import type { TipoEstudo } from '../lib/types';
import { usePerfil } from '../lib/perfil';
import { flagsDe, perfilPorId, useCatalogo } from '../lib/servicos';

export default function NovoProjeto() {
  const nav = useNavigate();
  const eu = usePerfil();
  const catalogo = useCatalogo();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [equipe, setEquipe] = useState<Profile[]>([]);
  const [params] = useSearchParams();
  const [clienteId, setClienteId] = useState(params.get('cliente') ?? '');
  const [novoCliente, setNovoCliente] = useState({ nome: '', codigo: '', categoria: '', premium: false, telefone: '', email: '' });
  const [nome, setNome] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [tipoEstudo, setTipoEstudo] = useState<TipoEstudo>('padrao');
  const [legal, setLegal] = useState(false);
  const [interiores, setInteriores] = useState(false);
  const [compl, setCompl] = useState(false);
  const [habitese, setHabitese] = useState(false);
  const [aprovacao, setAprovacao] = useState('');
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('clientes').select('*').order('nome').then(({ data }) => setClientes((data as Cliente[]) ?? []));
    supabase.from('profiles').select('*').neq('perfil', 'cliente').eq('ativo', true).order('nome').then(({ data }) => setEquipe((data as Profile[]) ?? []));
  }, []);

  // serviços combinados no cadastro do cliente pré-preenchem o escopo
  const clienteSel = clientes.find((c) => c.id === clienteId);
  useEffect(() => {
    if (!clienteSel || (!clienteSel.servicos?.length && !clienteSel.servico_estudo && !perfilPorId(clienteSel.categoria))) return;
    const f = flagsDe(clienteSel.servicos ?? [], clienteSel.categoria);
    setLegal(f.legal); setInteriores(f.interiores); setCompl(f.complementares); setHabitese(f.habitese);
    const est = clienteSel.servico_estudo || perfilPorId(clienteSel.categoria)?.estudo; if (est) setTipoEstudo(est as TipoEstudo);
    if (clienteSel.servico_aprovacao) setAprovacao(clienteSel.servico_aprovacao);
  }, [clienteSel]);

  // perfil D ou E (+ Projetos) sugere o estudo "+ Projetos"; dá para trocar
  const categoria = clienteId ? clientes.find((c) => c.id === clienteId)?.categoria : novoCliente.categoria;
  useEffect(() => { if (categoria === 'D' || categoria === 'E') setTipoEstudo('mais_projetos'); }, [categoria]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErro('');
    try {
      let cid = clienteId;
      if (!cid) {
        const { data, error } = await supabase.from('clientes').insert({
          nome: novoCliente.nome, codigo: novoCliente.codigo || null, categoria: novoCliente.categoria || null,
          premium: novoCliente.premium, telefone: novoCliente.telefone || null, email: novoCliente.email || null,
        }).select('id').single();
        if (error) throw error;
        cid = data.id;
      }
      const corpoProjeto = {
        cliente_id: cid, nome, responsavel_id: responsavel || null, tem_legal: legal,
        tem_interiores: interiores, tem_complementares: compl, tem_habitese: habitese, tipo_estudo: tipoEstudo, tipo_aprovacao: legal ? aprovacao || null : null,
        perfil: (clienteId ? clienteSel?.categoria : novoCliente.categoria) || null, servicos: clienteId ? clienteSel?.servicos ?? [] : [], servicos_observacao: clienteId ? clienteSel?.servicos_observacao ?? null : null,
      };
      let r = await supabase.from('projetos').insert(corpoProjeto).select('id').single();
      if (r.error && /perfil|servico|schema cache|column/i.test(r.error.message)) {   // banco sem a migração 0018: cria sem a cópia do perfil e dos serviços
        const { perfil, servicos, servicos_observacao, ...basico } = corpoProjeto; void perfil; void servicos; void servicos_observacao;
        r = await supabase.from('projetos').insert(basico).select('id').single();
      }
      const { data, error } = r;
      if (error) throw error;
      nav(`/projetos/${data.id}`);
    } catch (err) {
      setErro((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="titulo"><h1>Novo projeto</h1></div>
      <form className="card form" onSubmit={salvar}>
        <p className="mudo pequeno" style={{ margin: 0 }}>O cadastro completo do cliente (documentos, endereço e dados da obra) fica em <Link to="/clientes">Clientes</Link>.</p>
        <label>Cliente
          <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            <option value="">+ Cadastrar novo cliente</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.codigo ? ` (${c.codigo})` : ''}</option>)}
          </select>
        </label>
        {!clienteId && (
          <fieldset>
            <legend>Dados do cliente</legend>
            <label>Nome<input required value={novoCliente.nome} onChange={(e) => setNovoCliente({ ...novoCliente, nome: e.target.value })} /></label>
            <div className="duas">
              <label>Código<input placeholder="CA000123" value={novoCliente.codigo} onChange={(e) => setNovoCliente({ ...novoCliente, codigo: e.target.value })} /></label>
              <label>Perfil (por metragem · D e E: + Projetos)
                <select value={novoCliente.categoria} onChange={(e) => setNovoCliente({ ...novoCliente, categoria: e.target.value })}>
                  <option value="">—</option>{catalogo.perfis.filter((c) => c.ativo).map((c) => <option key={c.id} value={c.id}>{c.nome} · {c.faixa}</option>)}
                </select>
              </label>
            </div>
            <div className="duas">
              <label>Telefone<input value={novoCliente.telefone} onChange={(e) => setNovoCliente({ ...novoCliente, telefone: e.target.value })} /></label>
              <label>E-mail<input type="email" value={novoCliente.email} onChange={(e) => setNovoCliente({ ...novoCliente, email: e.target.value })} /></label>
            </div>
            <label className="check"><input type="checkbox" checked={novoCliente.premium} onChange={(e) => setNovoCliente({ ...novoCliente, premium: e.target.checked })} />Cliente premium (pendrive na entrega)</label>
          </fieldset>
        )}
        <label>Nome do projeto<input required value={nome} onChange={(e) => setNome(e.target.value)} /></label>
        {eu.perfil === 'admin' ? (
          <label>Responsável
            <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
              <option value="">—</option>{equipe.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </label>
        ) : <p className="mudo pequeno">Você será o responsável por este projeto.</p>}
        <label>Tipo de estudo preliminar
          <select id="tipo-estudo" value={tipoEstudo} onChange={(e) => setTipoEstudo(e.target.value as TipoEstudo)}>
            {Object.entries(TIPO_ESTUDO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <span className="pequeno mudo">{TIPO_ESTUDO_DESC[tipoEstudo]}</span>
        </label>
        <fieldset>
          <legend>Escopo contratado (além do arquitetônico)</legend>
          <label className="check"><input type="checkbox" checked={legal} onChange={(e) => setLegal(e.target.checked)} />Projeto legal (aprovação na Prefeitura)</label>
          {legal && (
            <label>Tipo de aprovação
              <select value={aprovacao} onChange={(e) => setAprovacao(e.target.value)}>
                <option value="">—</option>{TIPOS_APROVACAO.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
          )}
          <label className="check"><input type="checkbox" checked={interiores} onChange={(e) => setInteriores(e.target.checked)} />Interiores (estudo + detalhamento)</label>
          <label className="check"><input type="checkbox" checked={compl} onChange={(e) => setCompl(e.target.checked)} />Projetos complementares</label>
          <label className="check"><input type="checkbox" checked={habitese} onChange={(e) => setHabitese(e.target.checked)} />Habite-se (serviço após a regularização ou a obra pronta)</label>
        </fieldset>
        {erro && <p className="erro">{erro}</p>}
        <button className="primario" disabled={busy}>{busy ? 'Criando…' : 'Criar projeto'}</button>
      </form>
    </>
  );
}
