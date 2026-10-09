import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Cliente, Profile } from '../lib/types';
import { TIPOS_APROVACAO, TIPOS_PROJETO, TIPO_ESTUDO, TIPO_ESTUDO_DESC } from '../lib/labels';
import type { TipoEstudo } from '../lib/types';
import { usePerfil } from '../lib/perfil';
import { flagsDe, idsPremium, juntarAprovacoes, lerAprovacoes, perfilPorId, useCatalogo } from '../lib/servicos';
import { erroEmail, erroTelefone, formatarTelefone, proximoCodigo, telefoneLocal } from '../lib/cadastro';
import { preencherEtapa01 } from '../lib/flow';

const primeiroNome = (n: string) => (n.trim().split(/\s+/)[0] ?? '').toUpperCase();

export default function NovoProjeto() {
  const nav = useNavigate();
  const eu = usePerfil();
  const catalogo = useCatalogo();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [equipe, setEquipe] = useState<Profile[]>([]);
  const [params] = useSearchParams();
  const [clienteId, setClienteId] = useState(params.get('cliente') ?? '');
  const [novoCliente, setNovoCliente] = useState({ nome: '', codigo: '', categoria: '', premium: false, telefone: '', email: '' });
  const [tipoProj, setTipoProj] = useState('');
  const [outroTipo, setOutroTipo] = useState('');
  const [ident, setIdent] = useState('');
  const [identEditado, setIdentEditado] = useState(false);
  const [responsavel, setResponsavel] = useState(eu.id);
  const [tipoEstudo, setTipoEstudo] = useState<TipoEstudo>('padrao');
  const [legal, setLegal] = useState(false);
  const [interiores, setInteriores] = useState(false);
  const [compl, setCompl] = useState(false);
  const [habitese, setHabitese] = useState(false);
  const [aprovacoes, setAprovacoes] = useState<string[]>([]);
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('clientes').select('*').order('nome').then(({ data }) => setClientes((data as Cliente[]) ?? []));
    supabase.from('profiles').select('*').neq('perfil', 'cliente').eq('ativo', true).order('nome').then(({ data }) => setEquipe((data as Profile[]) ?? []));
  }, []);

  const clienteSel = clientes.find((c) => c.id === clienteId);
  const sugestao = useMemo(() => proximoCodigo(clientes.map((c) => c.codigo)), [clientes]);
  const [codigoTocado, setCodigoTocado] = useState(false);
  useEffect(() => { if (!clienteId && !codigoTocado) setNovoCliente((n) => (n.codigo === sugestao.proximo ? n : { ...n, codigo: sugestao.proximo })); }, [sugestao, clienteId, codigoTocado]);
  const codigoRepetido = !clienteId && !!novoCliente.codigo && clientes.some((c) => (c.codigo ?? '').toUpperCase() === novoCliente.codigo.trim().toUpperCase());
  const eTel = erroTelefone(novoCliente.telefone), eMail = erroEmail(novoCliente.email);

  // nome de identificação sugerido: primeiro nome do cliente (dá para trocar)
  const nomeCliente = clienteSel?.nome ?? novoCliente.nome;
  useEffect(() => { if (!identEditado) setIdent(primeiroNome(nomeCliente)); }, [nomeCliente, identEditado]);

  const tipo = TIPOS_PROJETO.find((t) => t.id === tipoProj);
  const etiqueta = tipo ? (tipo.id === 'outros' ? outroTipo.trim().toUpperCase() : tipo.etiqueta) : '';
  const nomeProjeto = etiqueta && ident.trim() ? `[${etiqueta}] ${ident.trim().toUpperCase()}` : '';

  // o tipo do projeto preenche o escopo; o cadastro do cliente (serviços) preenche o restante
  useEffect(() => {
    if (!tipo) return;
    if (tipo.legal) { setLegal(true); if (tipo.aprov) setAprovacoes((a) => (a.length ? a : tipo.aprov!)); }
    if (tipo.interiores) setInteriores(true);
    if (tipo.estudo) setTipoEstudo(tipo.estudo);
  }, [tipo]);

  useEffect(() => {
    if (!clienteSel || (!clienteSel.servicos?.length && !clienteSel.servico_estudo && !perfilPorId(clienteSel.categoria))) return;
    const f = flagsDe(clienteSel.servicos ?? [], clienteSel.categoria);
    setLegal((v) => v || f.legal); setInteriores((v) => v || f.interiores); setCompl(f.complementares); setHabitese(f.habitese);
    const est = clienteSel.servico_estudo || perfilPorId(clienteSel.categoria)?.estudo; if (est) setTipoEstudo(est as TipoEstudo);
    if (clienteSel.servico_aprovacao) setAprovacoes(lerAprovacoes(clienteSel.servico_aprovacao));
  }, [clienteSel]);

  // perfil D ou E (+ Projetos) leva o estudo "+ Projetos" automaticamente; dá para trocar depois
  const categoria = clienteId ? clienteSel?.categoria : novoCliente.categoria;
  useEffect(() => { if (categoria === 'D' || categoria === 'E' || perfilPorId(categoria)?.estudo === 'mais_projetos') setTipoEstudo('mais_projetos'); }, [categoria]);

  const alternarAprov = (t: string) => setAprovacoes((a) => (a.includes(t) ? a.filter((x) => x !== t) : [...a, t]));

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    if (!tipo) { setErro('Escolha o tipo do projeto.'); return; }
    if (tipo.id === 'outros' && !etiqueta) { setErro('Escreva o tipo do projeto no campo “Outros”.'); return; }
    if (!nomeProjeto) { setErro('Informe o nome de identificação do cliente (ex.: AUGUSTO).'); return; }
    if (!clienteId) {
      if (codigoRepetido) { setErro('Este código já está em uso. Use o sugerido ou outro.'); return; }
      if (eTel) { setErro(eTel); return; }
      if (eMail) { setErro(eMail); return; }
    }
    setBusy(true);
    try {
      let cid = clienteId;
      let premium = false;
      if (!cid) {
        premium = novoCliente.premium;
        const { data, error } = await supabase.from('clientes').insert({
          nome: novoCliente.nome, codigo: novoCliente.codigo.trim().toUpperCase() || null, categoria: novoCliente.categoria || null,
          premium, telefone: telefoneLocal(novoCliente.telefone) ? formatarTelefone(novoCliente.telefone) : null, email: novoCliente.email.trim() || null,
          ...(premium ? { servicos: idsPremium() } : {}),
        }).select('id').single();
        if (error) throw error;
        cid = data.id;
      }
      const servicos = clienteId ? clienteSel?.servicos ?? [] : premium ? idsPremium() : [];
      const corpoProjeto = {
        cliente_id: cid, nome: nomeProjeto, responsavel_id: responsavel || null, tem_legal: legal,
        tem_interiores: interiores, tem_complementares: compl, tem_habitese: habitese, tipo_estudo: tipoEstudo,
        tipo_aprovacao: legal && aprovacoes.length ? juntarAprovacoes(aprovacoes) : null,
        perfil: (clienteId ? clienteSel?.categoria : novoCliente.categoria) || null, servicos,
        servicos_observacao: clienteId ? clienteSel?.servicos_observacao ?? null : null,
        entregas: clienteId ? clienteSel?.entregas ?? null : null, tipo_projeto: tipo.id === 'outros' ? `outros:${etiqueta}` : tipo.id,
      };
      let r = await supabase.from('projetos').insert(corpoProjeto).select('id').single();
      if (r.error && /perfil|servico|entregas|tipo_projeto|schema cache|column/i.test(r.error.message)) {   // banco sem as migrações 0018/0020: cria sem os campos novos
        const { perfil, servicos: sv, servicos_observacao, entregas, tipo_projeto, ...basico } = corpoProjeto; void perfil; void sv; void servicos_observacao; void entregas; void tipo_projeto;
        r = await supabase.from('projetos').insert(basico).select('id').single();
      }
      const { data, error } = r;
      if (error) throw error;
      try { await preencherEtapa01(data.id, clienteId ? clienteSel : { ...novoCliente } as Partial<Cliente>, eu.id); } catch { /* a etapa 01 pode ser preenchida à mão */ }
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
        <p className="mudo pequeno" style={{ margin: 0 }}>O cadastro completo do cliente (documentos, endereço e dados da obra) fica em <Link to="/clientes">Clientes</Link>. Quando o cadastro já tem dados, a Etapa 01 (coleta inicial) chega marcada.</p>
        <label>Cliente
          <select value={clienteId} onChange={(e) => { setClienteId(e.target.value); setIdentEditado(false); }}>
            <option value="">+ Cadastrar novo cliente</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.codigo ? ` (${c.codigo})` : ''}</option>)}
          </select>
        </label>
        {!clienteId && (
          <fieldset>
            <legend>Dados do cliente</legend>
            <label>Nome<input required value={novoCliente.nome} onChange={(e) => setNovoCliente({ ...novoCliente, nome: e.target.value })} /></label>
            <div className="duas">
              <label>Código
                <input placeholder={sugestao.proximo} value={novoCliente.codigo} aria-invalid={codigoRepetido} onChange={(e) => { setCodigoTocado(true); setNovoCliente({ ...novoCliente, codigo: e.target.value.toUpperCase() }); }} />
                {codigoRepetido
                  ? <span className="campo-erro" role="alert">Este código já existe. Sugestão: {sugestao.proximo}</span>
                  : <span className="campo-dica">{sugestao.ultimo ? `Último cadastrado: ${sugestao.ultimo} → sugerido: ${sugestao.proximo}` : `Sugerido: ${sugestao.proximo}`}</span>}
              </label>
              <label>Perfil (por metragem · D e E: + Projetos)
                <select value={novoCliente.categoria} onChange={(e) => setNovoCliente({ ...novoCliente, categoria: e.target.value })}>
                  <option value="">—</option>{catalogo.perfis.filter((c) => c.ativo).map((c) => <option key={c.id} value={c.id}>{c.nome} · {c.faixa}</option>)}
                </select>
              </label>
            </div>
            <div className="duas">
              <label>Telefone (WhatsApp)
                <input inputMode="tel" placeholder="+55 (00) 90000-0000" value={novoCliente.telefone} aria-invalid={!!eTel} onChange={(e) => setNovoCliente({ ...novoCliente, telefone: formatarTelefone(e.target.value) })} />
                {eTel && <span className="campo-erro" role="alert">{eTel}</span>}
              </label>
              <label>E-mail
                <input type="text" inputMode="email" autoCapitalize="none" placeholder="nome@email.com" value={novoCliente.email} aria-invalid={!!eMail} onChange={(e) => setNovoCliente({ ...novoCliente, email: e.target.value })} />
                {eMail && <span className="campo-erro" role="alert">{eMail}</span>}
              </label>
            </div>
            <label className="check"><input type="checkbox" checked={novoCliente.premium} onChange={(e) => setNovoCliente({ ...novoCliente, premium: e.target.checked })} />Cliente Premium (pendrive na entrega + todos os serviços da categoria Premium)</label>
          </fieldset>
        )}
        <fieldset>
          <legend>Nome do projeto</legend>
          <label>Tipo do projeto
            <select id="tipo-projeto" required value={tipoProj} onChange={(e) => setTipoProj(e.target.value)}>
              <option value="">Escolha…</option>
              {TIPOS_PROJETO.map((t) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
            </select>
          </label>
          {tipoProj === 'outros' && <label>Qual tipo?<input placeholder="Ex.: LOJA, GALPÃO, PORTAL" value={outroTipo} onChange={(e) => setOutroTipo(e.target.value)} /></label>}
          <label>Nome de identificação do cliente
            <input placeholder="AUGUSTO" value={ident} onChange={(e) => { setIdent(e.target.value.toUpperCase()); setIdentEditado(true); }} />
            <span className="campo-dica">Só o nome pelo qual o cliente é conhecido — o tipo entra sozinho.</span>
          </label>
          <p className="pequeno" style={{ margin: 0 }}>Nome do projeto: <strong>{nomeProjeto || '[RESIDÊNCIA] AUGUSTO'}</strong>{!nomeProjeto && <span className="mudo"> (exemplo; outros: [COMERCIAL] AUGUSTO, [PORTAL] AUGUSTO)</span>}</p>
        </fieldset>
        <label>Responsável pelo projeto
          <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
            <option value="">—</option>{equipe.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.id === eu.id ? ' (você)' : ''}</option>)}
          </select>
          <span className="campo-dica">Quem cadastra nem sempre é quem conduz o projeto: escolha o responsável.</span>
        </label>
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
            <div role="group" aria-label="Tipo de aprovação">
              <span className="pequeno mudo">Tipo de aprovação (pode marcar mais de um, ex.: unificação + aprovação)</span>
              {TIPOS_APROVACAO.map((t) => <label key={t} className="check"><input type="checkbox" checked={aprovacoes.includes(t)} onChange={() => alternarAprov(t)} />{t}</label>)}
            </div>
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
