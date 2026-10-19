import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Cliente, Profile } from '../lib/types';
import { TIPOS_APROVACAO, TIPOS_COMPLEMENTARES, TIPOS_PROJETO, TIPO_ESTUDO, TIPO_ESTUDO_DESC } from '../lib/labels';
import type { TipoEstudo } from '../lib/types';
import { usePerfil } from '../lib/perfil';
import { ehPerfilA, flagsDe, juntarAprovacoes, lerAprovacoes, perfilPorId, useCatalogo } from '../lib/servicos';
import { erroEmail, erroTelefone, formatarTelefone, proximoCodigo, telefoneLocal } from '../lib/cadastro';
import { preencherEtapa01 } from '../lib/flow';
import { sincronizarEntregaveis } from '../lib/entregaveis';

type Ficha = { id: string; lead_id: string; recebida_em: string; ficha: Record<string, any> };   // eslint-disable-line @typescript-eslint/no-explicit-any
const txt = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');
const norm = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

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
  const [complTipos, setComplTipos] = useState<string[]>([]);
  const [outroCompl, setOutroCompl] = useState('');
  const [condominio, setCondominio] = useState(false);
  const [habitese, setHabitese] = useState(false);
  const [evf, setEvf] = useState(false);
  const [caixa, setCaixa] = useState(false);
  // o que a pessoa mexeu à mão não é mais trocado pelo tipo do projeto
  const manual = useRef(new Set<string>());
  const mexeu = (k: string) => manual.current.add(k);
  const [aprovacoes, setAprovacoes] = useState<string[]>([]);
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);
  const [fichas, setFichas] = useState<Ficha[]>([]);
  const [fichaSel, setFichaSel] = useState<Ficha | null>(null);

  useEffect(() => {
    supabase.from('clientes').select('*').order('nome').then(({ data }) => setClientes((data as Cliente[]) ?? []));
    supabase.from('fichas_atendimento').select('id,lead_id,recebida_em,ficha').eq('status', 'nova').order('recebida_em', { ascending: false }).then(({ data }) => setFichas((data as Ficha[]) ?? []));   // banco sem a migração 0025: lista vazia
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
  const nomeProjeto = etiqueta && ident.trim() ? `${etiqueta} ${ident.trim().toUpperCase()}` : '';

  // o tipo do projeto marca o escopo; ao trocar o tipo, o que ele tinha marcado sozinho se desmarca (o que a pessoa mexeu à mão fica)
  useEffect(() => {
    if (!tipo) return;
    if (!manual.current.has('legal')) setLegal(!!tipo.legal);
    if (!manual.current.has('interiores')) setInteriores(!!tipo.interiores);
    if (!manual.current.has('aprov')) setAprovacoes(tipo.aprov ?? []);
    if (!manual.current.has('estudo')) setTipoEstudo(categoria === 'D' || categoria === 'E' ? 'mais_projetos' : tipo.tipoEstudo ?? 'padrao');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo]);

  useEffect(() => {
    if (!clienteSel || (!clienteSel.servicos?.length && !clienteSel.servico_estudo && !perfilPorId(clienteSel.categoria))) return;
    const f = flagsDe(clienteSel.servicos ?? [], clienteSel.categoria);
    const ids = clienteSel.servicos ?? [];
    const doCat = [['estrutural-', 'Estrutural'], ['hidro-', 'Hidráulico'], ['eletrico-', 'Elétrico']].filter(([p]) => ids.some((i) => i.startsWith(p))).map(([, n]) => n);
    setLegal((v) => v || f.legal); setInteriores((v) => v || f.interiores); setHabitese(f.habitese); setCaixa(ids.some((i) => i.startsWith('caixa-'))); setEvf(ids.some((i) => i.startsWith('evf-')));
    setComplTipos((c) => [...new Set([...c, ...doCat])]);
    const est = clienteSel.servico_estudo || perfilPorId(clienteSel.categoria)?.estudo; if (est) setTipoEstudo(est as TipoEstudo);
    if (clienteSel.servico_aprovacao) setAprovacoes(lerAprovacoes(clienteSel.servico_aprovacao).filter((t) => TIPOS_APROVACAO.includes(t)));
  }, [clienteSel]);

  // perfil D ou E (+ Projetos) leva o estudo "+ Projetos" automaticamente; dá para trocar depois
  const categoria = clienteId ? clienteSel?.categoria : novoCliente.categoria;
  useEffect(() => { if (categoria === 'D' || categoria === 'E' || perfilPorId(categoria)?.estudo === 'mais_projetos') setTipoEstudo('mais_projetos'); }, [categoria]);

  // ficha de fechamento enviada pelo app de Atendimento: preenche cliente, tipo do projeto e escopo contratado (sem valores)
  function importarFicha(id: string) {
    const f = fichas.find((x) => x.id === id) ?? null;
    setFichaSel(f);
    if (!f) return;
    const d = f.ficha, c = d.cliente ?? {}, o = d.obra ?? {}, e = d.escopo_contratado ?? {};
    const perfilId = txt(d.perfil?.perfil_final ?? d.perfil);
    setClienteId(''); setIdentEditado(false);
    setNovoCliente((n) => ({ ...n, nome: txt(c.nome), telefone: formatarTelefone(txt(c.whatsapp ?? c.telefone)), email: txt(c.email), categoria: perfilPorId(perfilId) ? perfilId : '', premium: ehPerfilA(perfilId) }));
    const t = norm(txt(o.tipo_projeto));
    const achado = TIPOS_PROJETO.find((x) => norm(x.id) === t || norm(x.rotulo) === t);
    if (achado) setTipoProj(achado.id);
    if (e.legal != null) { mexeu('legal'); setLegal(!!e.legal); }
    if (e.interiores != null) { mexeu('interiores'); setInteriores(!!e.interiores); }
    if (Array.isArray(e.tipos_aprovacao)) { mexeu('aprov'); setAprovacoes(e.tipos_aprovacao.filter((x: string) => TIPOS_APROVACAO.includes(x))); }
    if (Array.isArray(e.complementares_tipos)) setComplTipos(e.complementares_tipos.filter((x: string) => TIPOS_COMPLEMENTARES.includes(x)));
    setCondominio(!!e.condominio); setHabitese(!!e.habitese); setEvf(!!e.evf); setCaixa(!!e.caixa);
  }

  const alternarAprov = (t: string) => { mexeu('aprov'); setAprovacoes((a) => (a.includes(t) ? a.filter((x) => x !== t) : [...a, t])); };

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
        }).select('id').single();
        if (error) throw error;
        cid = data.id;
      }
      const servicosFicha: string[] = fichaSel && !clienteId && Array.isArray(fichaSel.ficha.servicos_contratados) ? fichaSel.ficha.servicos_contratados.map((x: { item_id?: string }) => txt(x.item_id)).filter(Boolean) : [];
      const servicos = clienteId ? clienteSel?.servicos ?? [] : servicosFicha;
      if (fichaSel && !clienteId && cid) {   // endereço, dados da obra e serviços contratados vão para o cadastro do cliente
        const c = fichaSel.ficha.cliente ?? {}, o = fichaSel.ficha.obra ?? {};
        const metr = Number(String(o.metragem_terreno ?? o.area_pretendida ?? '').replace(',', '.'));
        await supabase.from('clientes').update({
          end_cep: txt(c.cep_cliente) || null, end_logradouro: txt(c.endereco_cliente) || null, end_cidade: txt(c.cidade_cliente) || null, end_uf: txt(c.estado_cliente) || null,
          obra_intencao: txt(o.intencao_projeto ?? o.tipo_obra) || null, obra_metragem: Number.isFinite(metr) && metr > 0 ? metr : null,
          obra_logradouro: txt(o.endereco_terreno) || null, obra_bairro: txt(o.bairro_terreno) || null, obra_cidade: txt(o.cidade_terreno) || null,
          obra_lote: txt(o.lote) || null, obra_quadra: txt(o.quadra) || null, responsavel_comercial: txt(fichaSel.ficha.responsavel_comercial) || null, servicos: servicosFicha,
        }).eq('id', cid);   // erro aqui não impede criar o projeto
      }
      const complementares = [...complTipos, ...(outroCompl.trim() ? [outroCompl.trim()] : [])];
      const corpoProjeto = {
        cliente_id: cid, nome: nomeProjeto, responsavel_id: responsavel || null, tem_legal: legal,
        tem_interiores: interiores, tem_complementares: complementares.length > 0, tem_habitese: habitese, tipo_estudo: tipoEstudo,
        tipo_aprovacao: legal && aprovacoes.length ? juntarAprovacoes(aprovacoes) : null,
        perfil: (clienteId ? clienteSel?.categoria : novoCliente.categoria) || null, servicos,
        servicos_observacao: clienteId ? clienteSel?.servicos_observacao ?? null : null,
        entregas: clienteId ? clienteSel?.entregas ?? null : null, tipo_projeto: tipo.id === 'outros' ? `outros:${etiqueta}` : tipo.id,
      };
      const extra = { complementares_tipos: complementares, tem_condominio: condominio, tem_evf: evf, tem_caixa: caixa };
      let r = await supabase.from('projetos').insert({ ...corpoProjeto, ...extra }).select('id').single();
      if (r.error && /complementares_tipos|tem_condominio|tem_evf|tem_caixa/i.test(r.error.message)) r = await supabase.from('projetos').insert(corpoProjeto).select('id').single();   // banco sem a migração 0023
      if (r.error && /perfil|servico|entregas|tipo_projeto|schema cache|column/i.test(r.error.message)) {   // banco sem as migrações 0018/0020: cria sem os campos novos
        const { perfil, servicos: sv, servicos_observacao, entregas, tipo_projeto, ...basico } = corpoProjeto; void perfil; void sv; void servicos_observacao; void entregas; void tipo_projeto;
        r = await supabase.from('projetos').insert(basico).select('id').single();
      }
      const { data, error } = r;
      if (error) throw error;
      if (fichaSel) await supabase.from('fichas_atendimento').update({ status: 'importada', projeto_id: data.id }).eq('id', fichaSel.id);
      try { await sincronizarEntregaveis(data.id, { perfil: corpoProjeto.perfil, entregas: corpoProjeto.entregas, servicos: corpoProjeto.servicos }); } catch { /* sem a migração 0021: a lista aparece quando o banco for atualizado */ }
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
        {fichas.length > 0 && (
          <label>Ficha recebida do atendimento
            <select value={fichaSel?.id ?? ''} onChange={(e) => importarFicha(e.target.value)}>
              <option value="">Não importar</option>
              {fichas.map((f) => <option key={f.id} value={f.id}>{txt(f.ficha.cliente?.nome) || f.lead_id} · {new Date(f.recebida_em).toLocaleDateString('pt-BR')}</option>)}
            </select>
            <span className="campo-dica">Preenche cliente, tipo de projeto e serviços contratados. Confira antes de criar.</span>
          </label>
        )}
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
                <select value={novoCliente.categoria} onChange={(e) => setNovoCliente({ ...novoCliente, categoria: e.target.value, premium: ehPerfilA(e.target.value) })}>
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
            <label className="check"><input type="checkbox" checked={novoCliente.premium} onChange={(e) => setNovoCliente({ ...novoCliente, premium: e.target.checked })} />Padrão para Perfil A</label>
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
          <label>Nome de identificação do projeto
            <input placeholder="AUGUSTO" value={ident} onChange={(e) => { setIdent(e.target.value.toUpperCase()); setIdentEditado(true); }} />
            <span className="campo-dica">Informe o sobrenome do cliente. O tipo de projeto será acrescentado automaticamente pelo sistema.</span>
          </label>
          <p className="pequeno" style={{ margin: 0 }}>Nome do projeto: <strong>{nomeProjeto || 'RESIDÊNCIA AUGUSTO'}</strong>{!nomeProjeto && <span className="mudo"> (exemplo)</span>}</p>
        </fieldset>
        <label>Responsável pelo projeto
          <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
            <option value="">—</option>{equipe.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.id === eu.id ? ' (você)' : ''}</option>)}
          </select>
          <span className="campo-dica">Quem cadastra nem sempre é quem conduz o projeto: escolha o responsável.</span>
        </label>
        {(!tipo || tipo.estudo) ? (
          <label>Tipo de estudo preliminar
            <select id="tipo-estudo" value={tipoEstudo} onChange={(e) => { mexeu('estudo'); setTipoEstudo(e.target.value as TipoEstudo); }}>
              {Object.entries(TIPO_ESTUDO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <span className="pequeno mudo">{TIPO_ESTUDO_DESC[tipoEstudo]}</span>
          </label>
        ) : <p className="mudo pequeno" id="sem-estudo">Este tipo de projeto não tem estudo preliminar.</p>}
        <fieldset>
          <legend>Escopo contratado (além do arquitetônico)</legend>
          <p className="pequeno mudo" style={{ margin: 0 }}>Na ordem em que acontece depois do estudo. O tipo do projeto marca o que costuma valer; você pode ajustar.</p>
          <label className="check"><input type="checkbox" checked={interiores} onChange={(e) => { mexeu('interiores'); setInteriores(e.target.checked); }} />Interiores — estudo e detalhamento</label>
          <div role="group" aria-label="Projetos complementares">
            <span className="pequeno mudo">Projetos complementares (marque os que o escritório fornece)</span>
            {TIPOS_COMPLEMENTARES.map((t) => <label key={t} className="check"><input type="checkbox" checked={complTipos.includes(t)} onChange={() => setComplTipos((c) => (c.includes(t) ? c.filter((x) => x !== t) : [...c, t]))} />{t}</label>)}
            <label>Outro complementar<input placeholder="Ex.: Luminotécnico, Ar-condicionado" value={outroCompl} onChange={(e) => setOutroCompl(e.target.value)} /></label>
          </div>
          <label className="check"><input type="checkbox" checked={legal} onChange={(e) => { mexeu('legal'); setLegal(e.target.checked); }} />Projeto legal — aprovação na Prefeitura</label>
          {legal && (
            <div role="group" aria-label="Tipo de aprovação">
              <span className="pequeno mudo">Caso necessário, assinale mais de uma opção. Ex.: Averbação residencial e Regularização.</span>
              {TIPOS_APROVACAO.map((t) => <label key={t} className="check"><input type="checkbox" checked={aprovacoes.includes(t)} onChange={() => alternarAprov(t)} />{t}</label>)}
            </div>
          )}
          <label className="check"><input type="checkbox" checked={condominio} onChange={(e) => setCondominio(e.target.checked)} />Aprovação em condomínio</label>
          <label className="check"><input type="checkbox" checked={habitese} onChange={(e) => setHabitese(e.target.checked)} />Habite-se</label>
          <label className="check"><input type="checkbox" checked={evf} onChange={(e) => setEvf(e.target.checked)} />EVF — estudo de viabilidade financeira</label>
          <label className="check"><input type="checkbox" checked={caixa} onChange={(e) => setCaixa(e.target.checked)} />Documentação Caixa</label>
        </fieldset>
        {erro && <p className="erro">{erro}</p>}
        <button className="primario" disabled={busy}>{busy ? 'Criando…' : 'Criar projeto'}</button>
      </form>
    </>
  );
}
