import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  Activity, Archive, ArrowDownUp, Boxes, Check, CheckCircle2, ChevronRight,
  CircleAlert, ClipboardList, Clock3, FileCheck2, History, LayoutDashboard,
  MapPin, Package, Plus, RefreshCw, Search, Send,
  Truck, Warehouse, X,
} from 'lucide-react'
import {
  apiClient, type ApiHealth, type DashboardData, type DecisionHistory,
  type Entity, type Inventory, type LogisticsRequest,
} from './services/APIClient'

type Section = 'inicio' | 'solicitacoes' | 'revisao' | 'estoque' | 'unidades' | 'materiais'
const navItems: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'inicio', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'solicitacoes', label: 'Solicitações', icon: ClipboardList },
  { id: 'revisao', label: 'Revisão humana', icon: FileCheck2 },
  { id: 'estoque', label: 'Estoque', icon: Warehouse },
  { id: 'unidades', label: 'Unidades', icon: MapPin },
  { id: 'materiais', label: 'Materiais', icon: Package },
]

const statusText: Record<string, string> = {
  pendente: 'Pendente', encaminhada: 'Encaminhada', em_analise: 'Em análise',
  aguardando_revisao: 'Aguardando revisão', atendida: 'Atendida', concluida: 'Concluída',
  aprovada: 'Aprovada', rejeitada: 'Rejeitada', cancelada: 'Cancelada',
}
const readable = (value?: string | null) => value ? value.replaceAll('_', ' ') : '—'
const dateText = (value?: string | null) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Ocorreu um erro inesperado.'

function App() {
  const [section, setSection] = useState<Section>('inicio')
  const [health, setHealth] = useState<ApiHealth | null>(null)
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [requests, setRequests] = useState<LogisticsRequest[]>([])
  const [reviewQueue, setReviewQueue] = useState<LogisticsRequest[]>([])
  const [units, setUnits] = useState<Entity[]>([])
  const [materials, setMaterials] = useState<Entity[]>([])
  const [inventory, setInventory] = useState<Inventory[]>([])
  const [selected, setSelected] = useState<LogisticsRequest | null>(null)
  const [history, setHistory] = useState<DecisionHistory[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    const results = await Promise.allSettled([
      apiClient.getHealth(), apiClient.getDashboard(), apiClient.getRequests(),
      apiClient.getRequestsForReview(), apiClient.getUnits(), apiClient.getMaterials(), apiClient.getInventory(),
    ])
    const [h, d, r, q, u, m, i] = results
    const unitRows = u.status === 'fulfilled' ? u.value : []
    const materialRows = m.status === 'fulfilled' ? m.value : []
    const attachNames = (request: LogisticsRequest): LogisticsRequest => ({
      ...request,
      unit: request.unit ?? unitRows.find((item) => item.id === request.unidade_id)?.nome,
      material: request.material ?? materialRows.find((item) => item.id === request.material_id)?.nome,
    })
    if (h.status === 'fulfilled') setHealth(h.value)
    if (d.status === 'fulfilled') setDashboard({ ...d.value, recent_requests: d.value.recent_requests.map(attachNames) })
    if (r.status === 'fulfilled') setRequests(r.value.map(attachNames))
    if (q.status === 'fulfilled') setReviewQueue(q.value.map(attachNames))
    if (u.status === 'fulfilled') setUnits(u.value)
    if (m.status === 'fulfilled') setMaterials(m.value)
    if (i.status === 'fulfilled') setInventory(i.value)
    const failed = results.find((result) => result.status === 'rejected')
    if (failed?.status === 'rejected') setError(errorText(failed.reason))
    setLoading(false)
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3500)
    return () => window.clearTimeout(timer)
  }, [notice])

  const openRequest = async (request: LogisticsRequest) => {
    setSelected(request)
    setHistory([])
    try { setHistory(await apiClient.getDecisions(request.id)) }
    catch (reason) { setError(errorText(reason)) }
  }

  const handleCreateRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(event.currentTarget)
    setBusy(true)
    try {
      await apiClient.createRequest({
        unidade_id: String(form.get('unidade_id')),
        material_id: String(form.get('material_id')),
        quantidade: Number(form.get('quantidade')),
        justificativa: String(form.get('justificativa')),
      })
      formElement.reset()
      setNotice('Solicitação registrada e enviada para triagem.')
      await refresh()
    } catch (reason) { setError(errorText(reason)) }
    finally { setBusy(false) }
  }

  const handleReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected) return
    const form = new FormData(event.currentTarget)
    setBusy(true)
    try {
      await apiClient.reviewRequest(selected.id, {
        revisor: String(form.get('revisor')),
        notas: String(form.get('notas')) || undefined,
        categoria: String(form.get('categoria')) || undefined,
        setor: String(form.get('setor')) || undefined,
        prioridade: form.get('prioridade') === '' ? undefined : Number(form.get('prioridade')),
        status: String(form.get('status')),
      })
      setSelected(null)
      setNotice('Revisão salva no histórico da solicitação.')
      await refresh()
    } catch (reason) { setError(errorText(reason)) }
    finally { setBusy(false) }
  }

  const handleStatusUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected) return
    const form = new FormData(event.currentTarget)
    setBusy(true)
    try {
      await apiClient.updateRequestStatus(selected.id, String(form.get('status')))
      setSelected(null)
      setNotice('Status da solicitação atualizado.')
      await refresh()
    } catch (reason) { setError(errorText(reason)) }
    finally { setBusy(false) }
  }

  const createEntity = async (event: FormEvent<HTMLFormElement>, kind: 'unidades' | 'materiais') => {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(event.currentTarget)
    setBusy(true)
    try {
      const common = { nome: String(form.get('nome')).trim(), descricao: String(form.get('descricao')).trim() || null, ativo: true, codigo: String(form.get('codigo')).trim() }
      if (kind === 'unidades') await apiClient.createUnit({ ...common, localizacao: String(form.get('localizacao')).trim() })
      else await apiClient.createMaterial({ ...common, categoria: String(form.get('categoria')).trim(), unidade_medida: String(form.get('unidade_medida')).trim() || 'unidade' })
      formElement.reset()
      setNotice(kind === 'unidades' ? 'Unidade cadastrada.' : 'Material cadastrado.')
      await refresh()
    } catch (reason) { setError(errorText(reason)) }
    finally { setBusy(false) }
  }

  const createStock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(event.currentTarget)
    setBusy(true)
    try {
      await apiClient.upsertInventory({
        unidade_id: String(form.get('unidade_id')), material_id: String(form.get('material_id')),
        quantidade: Number(form.get('quantidade')), unidade_medida: String(form.get('unidade_medida')),
        observacoes: String(form.get('observacoes')) || null,
      })
      formElement.reset()
      setNotice('Saldo de estoque cadastrado.')
      await refresh()
    } catch (reason) { setError(errorText(reason)) }
    finally { setBusy(false) }
  }

  const filteredRequests = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR')
    return requests.filter((request) => [request.material, request.unit, request.justificativa, request.decisao?.categoria]
      .some((value) => (value ?? '').toLocaleLowerCase('pt-BR').includes(term)))
  }, [requests, search])

  const currentTitle = navItems.find((item) => item.id === section)?.label ?? 'Visão geral'
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#inicio" onClick={() => setSection('inicio')}>
        <span className="brand-mark"><Truck size={21} /></span>
        <span><b>Mil Logistics</b><small>GESTÃO LOGÍSTICA</small></span>
      </a>
      <div className="nav-caption">OPERAÇÃO</div>
      <nav className="nav-list" aria-label="Navegação principal">
        {navItems.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-link ${section === id ? 'active' : ''}`} onClick={() => setSection(id)}>
          <Icon size={17} strokeWidth={1.8} />{label}
          {id === 'revisao' && reviewQueue.length > 0 && <span className="nav-count">{reviewQueue.length}</span>}
        </button>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="db-card"><div className="db-label"><span className={`status-dot ${health?.database === 'connected' ? 'online' : ''}`} />MongoDB</div><p>{health?.database === 'connected' ? 'Conectado' : health ? 'Sem conexão' : 'Verificando conexão'}</p></div>
        <div className="plain-caption">Fluxo de solicitações e materiais</div>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar">
        <div className="topbar-context"><span className="eyebrow">MIL LOGISTICS <ChevronRight size={12} /> OPERAÇÕES</span><strong>{currentTitle}</strong></div>
        <button className="button button-quiet" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} />Atualizar</button>
      </header>
      <div className="content">
        {error && <div className="alert alert-error"><CircleAlert size={17} /><span>{error}</span><button aria-label="Fechar aviso" onClick={() => setError('')}><X size={15} /></button></div>}
        {notice && <div className="alert alert-success"><CheckCircle2 size={17} /><span>{notice}</span><button aria-label="Fechar aviso" onClick={() => setNotice('')}><X size={15} /></button></div>}
        {section === 'inicio' && <Dashboard data={dashboard} units={units.length} materials={materials.length} reviewCount={reviewQueue.length} onNewRequest={() => setSection('solicitacoes')} onSelectRequest={openRequest} />}
        {section === 'solicitacoes' && <RequestsView requests={filteredRequests} units={units} materials={materials} search={search} setSearch={setSearch} onCreate={handleCreateRequest} onOpen={openRequest} busy={busy} />}
        {section === 'revisao' && <ReviewView requests={reviewQueue} onOpen={openRequest} />}
        {section === 'unidades' && <EntitiesView title="Unidades" subtitle="Locais que solicitam e controlam materiais." kind="unidades" entities={units} onCreate={createEntity} busy={busy} />}
        {section === 'materiais' && <EntitiesView title="Materiais" subtitle="Catálogo de materiais disponíveis para solicitação." kind="materiais" entities={materials} onCreate={createEntity} busy={busy} />}
        {section === 'estoque' && <InventoryView inventory={inventory} units={units} materials={materials} onCreate={createStock} busy={busy} />}
      </div>
    </main>
    {selected && <RequestDetail request={selected} history={history} onClose={() => setSelected(null)} onReview={handleReview} onStatusUpdate={handleStatusUpdate} busy={busy} />}
  </div>
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow"><Activity size={13} />{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>
}

function Dashboard({ data, units, materials, reviewCount, onNewRequest, onSelectRequest }: {
  data: DashboardData | null; units: number; materials: number; reviewCount: number;
  onNewRequest: () => void; onSelectRequest: (request: LogisticsRequest) => void
}) {
  const metrics = data?.metrics
  const rows = data?.recent_requests ?? []
  const categoryTotal = data?.categories.reduce((total, category) => total + category.total, 0) ?? 0
  return <>
    <PageHeading eyebrow="CENTRO DE OPERAÇÕES" title="Visão geral" description="Acompanhe pedidos, materiais e revisões em um só lugar."
      action={<button className="button button-primary" onClick={onNewRequest}><Plus size={16} />Nova solicitação</button>} />
    <div className="metric-grid">
      <Metric label="Solicitações" value={metrics?.total ?? '—'} note="Registradas no sistema" icon={ClipboardList} />
      <Metric label="Em andamento" value={metrics?.pending ?? '—'} note="Aguardando atendimento" icon={Clock3} />
      <Metric label="Prioridade alta" value={metrics?.high_priority ?? '—'} note="Pontuação a partir de 75" icon={Activity} tone="amber" />
      <Metric label="Revisão humana" value={reviewCount} note="Precisam de conferência" icon={CircleAlert} tone="amber" />
      <Metric label="Concluídas" value={metrics?.completed ?? '—'} note="Pedidos atendidos" icon={CheckCircle2} tone="blue" />
    </div>
    <div className="overview-grid">
      <section className="panel request-panel">
        <div className="panel-heading"><div><h2>Solicitações recentes</h2><p>Pedidos com classificação e status atuais</p></div><button className="text-button" onClick={onNewRequest}>Criar pedido <ChevronRight size={14} /></button></div>
        <RequestTable requests={rows.slice(0, 6)} onOpen={onSelectRequest} empty="Nenhuma solicitação foi registrada." />
      </section>
      <div className="side-stack">
        <section className="panel categories-panel"><div className="panel-heading"><div><h2>Por categoria</h2><p>Distribuição das solicitações</p></div><span className="icon-tile"><Activity size={17} /></span></div>
          {data?.categories.length ? <div className="category-list">{data.categories.map((item, index) => <div className="category-item" key={item.name}><div><span>{item.name}</span><b>{item.total}</b></div><div className="progress-track"><i style={{ width: `${categoryTotal ? item.total / categoryTotal * 100 : 0}%`, background: ['#718b58', '#98aa7d', '#bac6a9', '#d0d8c4'][index % 4] }} /></div></div>)}</div> : <Empty text="A distribuição aparece após os primeiros pedidos." />}
        </section>
        <section className="summary-card"><div className="summary-icon"><Boxes size={18} /></div><h2>Cadastros do sistema</h2><p>Estrutura disponível para a operação.</p><div className="summary-stats"><span><b>{units}</b> unidades</span><span><b>{materials}</b> materiais</span></div></section>
        <section className="review-callout"><span className="review-callout-icon"><Check size={17} /></span><div><b>Triagem responsável</b><p>Pedidos sinalizados seguem para conferência humana antes da decisão final.</p></div></section>
      </div>
    </div>
  </>
}

function Metric({ label, value, note, icon: Icon, tone = 'green' }: { label: string; value: number | string; note: string; icon: typeof Boxes; tone?: string }) {
  return <article className="metric-card"><div className="metric-copy"><span>{label}</span><b>{value}</b><small>{note}</small></div><span className={`metric-icon ${tone}`}><Icon size={18} /></span></article>
}

function RequestsView({ requests, units, materials, search, setSearch, onCreate, onOpen, busy }: {
  requests: LogisticsRequest[]; units: Entity[]; materials: Entity[]; search: string; setSearch: (value: string) => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => void; onOpen: (request: LogisticsRequest) => void; busy: boolean
}) {
  return <>
    <PageHeading eyebrow="FLUXO DE ATENDIMENTO" title="Solicitações" description="Registre pedidos e acompanhe o caminho da triagem até o atendimento." />
    <div className="workflow-grid">
      <section className="panel form-panel"><div className="panel-heading"><div><h2>Abrir solicitação</h2><p>Preencha os dados do material e a justificativa.</p></div><span className="icon-tile"><Send size={16} /></span></div>
        <form onSubmit={onCreate} className="form-stack">
          <Field label="Unidade"><select name="unidade_id" required defaultValue=""><option value="" disabled>Selecione uma unidade</option>{units.map((u) => <option value={u.id} key={u.id}>{u.nome}</option>)}</select></Field>
          <Field label="Material"><select name="material_id" required defaultValue=""><option value="" disabled>Selecione um material</option>{materials.map((m) => <option value={m.id} key={m.id}>{m.nome}</option>)}</select></Field>
          <Field label="Quantidade"><input name="quantidade" type="number" min="0.01" step="any" placeholder="Ex.: 12" required /></Field>
          <Field label="Justificativa"><textarea name="justificativa" rows={4} minLength={3} maxLength={4000} placeholder="Descreva a necessidade e o contexto do pedido." required /></Field>
          {(!units.length || !materials.length) && <p className="inline-hint"><CircleAlert size={14} /> Cadastre ao menos uma unidade e um material para abrir pedidos.</p>}
          <button className="button button-primary full-button" disabled={busy || !units.length || !materials.length}><Plus size={16} />{busy ? 'Enviando…' : 'Registrar solicitação'}</button>
        </form>
      </section>
      <section className="panel list-panel"><div className="panel-heading"><div><h2>Todos os pedidos</h2><p>{requests.length} solicitações no fluxo</p></div><label className="search-box"><Search size={14} /><input aria-label="Buscar solicitações" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar pedidos" /></label></div>
        <RequestTable requests={requests} onOpen={onOpen} empty="Não há pedidos que correspondam à busca." />
      </section>
    </div>
  </>
}

function ReviewView({ requests, onOpen }: { requests: LogisticsRequest[]; onOpen: (request: LogisticsRequest) => void }) {
  return <><PageHeading eyebrow="CONFERÊNCIA" title="Revisão humana" description="Confira as sugestões da triagem e registre a decisão final." />
    <section className="panel list-panel"><div className="panel-heading"><div><h2>Fila de revisão</h2><p>{requests.length} pedidos precisam de análise</p></div><span className="icon-tile amber-tile"><FileCheck2 size={17} /></span></div>
      {requests.length ? <div className="review-list">{requests.map((request) => <button key={request.id} className="review-row" onClick={() => onOpen(request)}><span className="review-item-icon"><Package size={17} /></span><span className="review-main"><b>{request.material ?? 'Material'} <small>× {request.quantidade ?? request.quantity}</small></b><span>{request.unit ?? 'Unidade'} · {dateText(request.criado_em ?? request.created_at)}</span><span className="review-reason">{request.justificativa}</span></span><span className="priority-pill">{request.decisao?.prioridade !== null && request.decisao?.prioridade !== undefined ? `Prioridade ${request.decisao.prioridade}` : 'Sem prioridade'}</span><ChevronRight size={16} /></button>)}</div> : <Empty text="A fila de revisão está vazia." icon={<CheckCircle2 size={21} />} />}
    </section>
  </>
}

function EntitiesView({ title, subtitle, kind, entities, onCreate, busy }: {
  title: string; subtitle: string; kind: 'unidades' | 'materiais'; entities: Entity[];
  onCreate: (event: FormEvent<HTMLFormElement>, kind: 'unidades' | 'materiais') => void; busy: boolean
}) {
  const Icon = kind === 'unidades' ? MapPin : Package
  return <><PageHeading eyebrow="CADASTROS" title={title} description={subtitle} />
    <div className="workflow-grid narrow-form-grid"><section className="panel form-panel"><div className="panel-heading"><div><h2>Novo cadastro</h2><p>Adicione um registro ao catálogo.</p></div><span className="icon-tile"><Plus size={17} /></span></div>
      <form className="form-stack" onSubmit={(event) => onCreate(event, kind)}><Field label="Nome"><input name="nome" maxLength={160} placeholder={kind === 'unidades' ? 'Ex.: Base Norte' : 'Ex.: Kit de primeiros socorros'} required /></Field><Field label="Código"><input name="codigo" placeholder="Ex.: UNI-001" required={kind === 'unidades'} /></Field>{kind === 'unidades' ? <Field label="Localização"><input name="localizacao" placeholder="Cidade, base ou endereço" required /></Field> : <><Field label="Categoria"><input name="categoria" placeholder="Ex.: manutenção" required /></Field><Field label="Unidade de medida"><input name="unidade_medida" defaultValue="unidade" placeholder="Ex.: caixa, litro, unidade" required /></Field></>}<Field label="Descrição"><textarea name="descricao" rows={3} placeholder="Informações complementares (opcional)." /></Field><button className="button button-primary full-button" disabled={busy}><Plus size={16} />{busy ? 'Salvando…' : `Cadastrar ${kind === 'unidades' ? 'unidade' : 'material'}`}</button></form>
    </section><section className="panel list-panel"><div className="panel-heading"><div><h2>Registros cadastrados</h2><p>{entities.length} itens</p></div><span className="icon-tile"><Icon size={17} /></span></div>
      {entities.length ? <div className="entity-list">{entities.map((entity) => <div className="entity-row" key={entity.id}><span className="entity-icon"><Icon size={16} /></span><span><b>{entity.nome}</b><small>{entity.descricao || 'Sem descrição'}</small></span><span className={`state-tag ${entity.ativo === false ? 'off' : ''}`}>{entity.ativo === false ? 'Inativo' : 'Ativo'}</span></div>)}</div> : <Empty text={`Nenhum registro de ${kind === 'unidades' ? 'unidade' : 'material'} cadastrado.`} />}
    </section></div>
  </>
}

function InventoryView({ inventory, units, materials, onCreate, busy }: {
  inventory: Inventory[]; units: Entity[]; materials: Entity[]; onCreate: (event: FormEvent<HTMLFormElement>) => void; busy: boolean
}) {
  const unitName = (id: string) => units.find((item) => item.id === id)?.nome ?? 'Unidade removida'
  const materialName = (id: string) => materials.find((item) => item.id === id)?.nome ?? 'Material removido'
  return <><PageHeading eyebrow="CONTROLE DE MATERIAIS" title="Estoque" description="Consulte os saldos informativos por unidade e material." />
    <div className="workflow-grid"><section className="panel form-panel"><div className="panel-heading"><div><h2>Adicionar saldo</h2><p>Registre a quantidade disponível na unidade.</p></div><span className="icon-tile"><Warehouse size={17} /></span></div>
      <form className="form-stack" onSubmit={onCreate}><Field label="Unidade"><select name="unidade_id" required defaultValue=""><option value="" disabled>Selecione uma unidade</option>{units.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></Field><Field label="Material"><select name="material_id" required defaultValue=""><option value="" disabled>Selecione um material</option>{materials.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></Field><div className="form-pair"><Field label="Quantidade"><input name="quantidade" type="number" min="0" step="any" required placeholder="0" /></Field><Field label="Unidade de medida"><input name="unidade_medida" defaultValue="unidade" required /></Field></div><Field label="Observações"><textarea name="observacoes" rows={3} placeholder="Opcional" /></Field><button className="button button-primary full-button" disabled={busy || !units.length || !materials.length}><Plus size={16} />Adicionar ao estoque</button></form>
    </section><section className="panel list-panel"><div className="panel-heading"><div><h2>Saldos registrados</h2><p>{inventory.length} posições de estoque</p></div><span className="icon-tile"><ArrowDownUp size={17} /></span></div>
      {inventory.length ? <div className="stock-list">{inventory.map((item) => <div className="stock-row" key={item.id}><span className="entity-icon"><Boxes size={16} /></span><span className="stock-desc"><b>{materialName(item.material_id)}</b><small>{unitName(item.unidade_id)}{item.observacoes ? ` · ${item.observacoes}` : ''}</small></span><span className="stock-amount"><b>{item.quantidade}</b><small>{item.unidade_medida}</small></span></div>)}</div> : <Empty text="Nenhum saldo registrado." />}
    </section></div>
  </>
}

function RequestTable({ requests, onOpen, empty }: { requests: LogisticsRequest[]; onOpen: (request: LogisticsRequest) => void; empty: string }) {
  return requests.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Material e quantidade</th><th>Unidade</th><th>Prioridade</th><th>Situação</th><th>Data</th><th /></tr></thead><tbody>{requests.map((request) => {
    const priority = request.decisao?.prioridade ?? request.priority
    const status = request.status
    return <tr key={request.id} onClick={() => onOpen(request)} tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && onOpen(request)}><td><span className="table-primary">{request.material ?? 'Material'}</span><small>{request.quantidade ?? request.quantity} {request.decisao?.unidade_medida ?? 'un.'}</small></td><td>{request.unit ?? 'Unidade'}</td><td>{priority !== null && priority !== undefined ? <span className="priority-pill">{priority}</span> : '—'}</td><td><span className={`status-pill ${request.decisao?.revisao_humana || status === 'aguardando_revisao' ? 'status-review' : ''}`}><i />{statusText[status] ?? readable(status)}</span></td><td>{dateText(request.criado_em ?? request.created_at)}</td><td><ChevronRight size={15} /></td></tr>
  })}</tbody></table></div> : <Empty text={empty} icon={<Archive size={21} />} />
}

function RequestDetail({ request, history, onClose, onReview, onStatusUpdate, busy }: { request: LogisticsRequest; history: DecisionHistory[]; onClose: () => void; onReview: (event: FormEvent<HTMLFormElement>) => void; onStatusUpdate: (event: FormEvent<HTMLFormElement>) => void; busy: boolean }) {
  const decision = request.decisao ?? {}
  const needsReview = decision.revisao_humana || request.status === 'aguardando_revisao'
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title">
    <header className="detail-header"><div><div className="eyebrow">DETALHE DO PEDIDO</div><h2 id="detail-title">{request.material ?? 'Solicitação'}</h2></div><button className="icon-button" aria-label="Fechar" onClick={onClose}><X size={18} /></button></header>
    <div className="detail-body"><div className="detail-chips"><span className="status-pill"><i />{statusText[request.status] ?? readable(request.status)}</span>{decision.prioridade !== null && decision.prioridade !== undefined && <span className="priority-pill">Prioridade {decision.prioridade}</span>}</div>
      <div className="detail-grid"><DetailField label="Unidade" value={request.unit ?? '—'} /><DetailField label="Quantidade" value={`${request.quantidade ?? request.quantity}`} /><DetailField label="Categoria" value={decision.categoria ?? 'Não classificada'} /><DetailField label="Setor sugerido" value={decision.setor ?? 'Não definido'} /><DetailField label="Criada em" value={dateText(request.criado_em ?? request.created_at)} /></div>
      <div className="detail-block"><label>Justificativa</label><p>{request.justificativa || 'Sem justificativa informada.'}</p></div>
      {decision.erro_provedor && <div className="inline-hint"><CircleAlert size={14} />A triagem automática não ficou disponível. Revise os campos manualmente.</div>}
      {!needsReview && <form className="status-update form-stack" onSubmit={onStatusUpdate}><div className="subheading"><h3>Atualizar andamento</h3></div><div className="form-pair"><Field label="Status"><select name="status" defaultValue={request.status}><option value="pendente">Pendente</option><option value="em_analise">Em análise</option><option value="encaminhada">Encaminhada</option><option value="atendida">Atendida</option><option value="concluida">Concluída</option><option value="cancelada">Cancelada</option></select></Field><button className="button button-primary status-save" disabled={busy}>Salvar status</button></div></form>}
      {needsReview && <section className="review-form-section"><div className="subheading"><h3>Registrar revisão</h3><span>Decisão humana</span></div><form className="form-stack" onSubmit={onReview}>
        <div className="form-pair"><Field label="Revisor"><input name="revisor" maxLength={160} placeholder="Nome do responsável" required /></Field><Field label="Prioridade (0–100)"><input name="prioridade" type="number" min="0" max="100" defaultValue={decision.prioridade ?? ''} /></Field></div>
        <div className="form-pair"><Field label="Categoria"><input name="categoria" defaultValue={decision.categoria ?? ''} placeholder="Ex.: manutenção" /></Field><Field label="Setor"><input name="setor" defaultValue={decision.setor ?? ''} placeholder="Ex.: logística" /></Field></div>
        <Field label="Status após revisão"><select name="status" defaultValue="pendente"><option value="pendente">Pendente</option><option value="em_analise">Em análise</option><option value="atendida">Atendida</option><option value="cancelada">Cancelada</option></select></Field>
        <Field label="Notas da revisão"><textarea name="notas" rows={3} placeholder="Motivo, contexto ou encaminhamento." /></Field>
        <button className="button button-primary full-button" disabled={busy}><CheckCircle2 size={16} />{busy ? 'Salvando…' : 'Salvar decisão'}</button>
      </form></section>}
      <section className="history-section"><div className="subheading"><h3><History size={15} />Histórico de decisões</h3><span>{history.length} eventos</span></div>{history.length ? <ol className="history-list">{history.map((entry) => <li key={entry.id}><span className="history-dot" /><div><b>{entry.tipo === 'revisao_humana' ? 'Revisão humana' : entry.tipo === 'alteracao_status' ? 'Alteração de status' : 'Triagem inicial'}</b><small>{dateText(entry.criado_em)}{entry.revisor ? ` · ${entry.revisor}` : ''}</small>{entry.tipo === 'alteracao_status' && <p>{statusText[entry.status_anterior ?? ''] ?? readable(entry.status_anterior)} → {statusText[entry.status_novo ?? ''] ?? readable(entry.status_novo)}</p>}{entry.notas && <p>{entry.notas}</p>}</div></li>)}</ol> : <p className="muted-copy">Nenhum evento de decisão registrado.</p>}</section>
    </div>
  </section></div>
}

function DetailField({ label, value }: { label: string; value: string }) { return <div><label>{label}</label><b>{value}</b></div> }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label> }
function Empty({ text, icon = <Archive size={20} /> }: { text: string; icon?: ReactNode }) { return <div className="empty-state"><span>{icon}</span><p>{text}</p></div> }

export default App
