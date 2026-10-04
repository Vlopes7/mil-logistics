import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  Activity, Archive, ArrowDownUp, Boxes, Check, CheckCircle2, ChevronRight,
  CircleAlert, ClipboardList, Clock3, FileCheck2, History, LayoutDashboard,
  MapPin, Package, Pencil, Plus, RefreshCw, Search, Send, Trash2,
  Truck, Warehouse, X,
} from 'lucide-react'
import {
  apiClient, type ApiHealth, type DashboardData, type DecisionHistory,
  type Entity, type Inventory, type LogisticsRequest, type Priority,
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
const priorityLabels: Record<Priority, string> = {
  baixa: 'Baixa', normal: 'Normal', alta: 'Alta', critica: 'Crítica',
}
const priorityText = (value?: Priority | number | null) => {
  if (typeof value === 'number') {
    if (value >= 88) return 'Crítica'
    if (value >= 63) return 'Alta'
    if (value >= 38) return 'Normal'
    return 'Baixa'
  }
  return value ? priorityLabels[value] : '—'
}
const priorityValue = (value?: Priority | number | null): Priority | '' => {
  if (typeof value === 'number') {
    if (value >= 88) return 'critica'
    if (value >= 63) return 'alta'
    if (value >= 38) return 'normal'
    return 'baixa'
  }
  return value ?? ''
}
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
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.removeEventListener('focus', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [refresh])
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
        prioridade: form.get('prioridade') ? String(form.get('prioridade')) as Priority : undefined,
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

  const updateEntity = async (event: FormEvent<HTMLFormElement>, kind: 'unidades' | 'materiais', id: string) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const common = {
      nome: String(form.get('nome')).trim(),
      descricao: String(form.get('descricao')).trim() || null,
      ativo: form.get('ativo') === 'true',
      codigo: String(form.get('codigo')).trim() || null,
    }
    setBusy(true)
    try {
      if (kind === 'unidades') {
        await apiClient.updateUnit(id, { ...common, codigo: common.codigo ?? '', localizacao: String(form.get('localizacao')).trim() })
      } else {
        await apiClient.updateMaterial(id, {
          ...common,
          categoria: String(form.get('categoria')).trim(),
          unidade_medida: String(form.get('unidade_medida')).trim(),
        })
      }
      setNotice(kind === 'unidades' ? 'Unidade atualizada.' : 'Material atualizado.')
      await refresh()
    } catch (reason) { setError(errorText(reason)) }
    finally { setBusy(false) }
  }

  const deleteEntity = async (kind: 'unidades' | 'materiais', entity: Entity) => {
    if (!window.confirm(`Excluir ${kind === 'unidades' ? 'a unidade' : 'o material'} “${entity.nome}”?`)) return
    setBusy(true)
    try {
      if (kind === 'unidades') await apiClient.deleteUnit(entity.id)
      else await apiClient.deleteMaterial(entity.id)
      setNotice(kind === 'unidades' ? 'Unidade excluída.' : 'Material excluído.')
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

  const updateStock = async (event: FormEvent<HTMLFormElement>, itemId: string) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    try {
      await apiClient.updateInventory(itemId, {
        quantidade: Number(form.get('quantidade')),
        unidade_medida: String(form.get('unidade_medida')).trim(),
        observacoes: String(form.get('observacoes')).trim() || null,
      })
      setNotice('Saldo de estoque atualizado.')
      await refresh()
    } catch (reason) { setError(errorText(reason)) }
    finally { setBusy(false) }
  }

  const deleteStock = async (item: Inventory) => {
    if (!window.confirm(`Excluir o saldo de ${materialName(item.material_id)} em ${unitName(item.unidade_id)}?`)) return
    setBusy(true)
    try {
      await apiClient.deleteInventory(item.id)
      setNotice('Saldo de estoque excluído.')
      await refresh()
    } catch (reason) { setError(errorText(reason)) }
    finally { setBusy(false) }
  }

  const updateRequest = async (requestId: string, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    try {
      await apiClient.updateRequest(requestId, {
        unidade_id: String(form.get('unidade_id')),
        material_id: String(form.get('material_id')),
        quantidade: Number(form.get('quantidade')),
        justificativa: String(form.get('justificativa')).trim(),
      })
      setSelected(null)
      setNotice('Solicitação atualizada e enviada para nova revisão.')
      await refresh()
    } catch (reason) { setError(errorText(reason)) }
    finally { setBusy(false) }
  }

  const deleteRequest = async (request: LogisticsRequest) => {
    if (!window.confirm(`Excluir a solicitação de ${request.material ?? 'material'}? O histórico de decisões também será removido.`)) return
    setBusy(true)
    try {
      await apiClient.deleteRequest(request.id)
      setSelected(null)
      setNotice('Solicitação excluída.')
      await refresh()
    } catch (reason) { setError(errorText(reason)) }
    finally { setBusy(false) }
  }

  const unitName = (id: string) => units.find((item) => item.id === id)?.nome ?? 'Unidade removida'
  const materialName = (id: string) => materials.find((item) => item.id === id)?.nome ?? 'Material removido'

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
        {navItems.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-link ${section === id ? 'active' : ''}`} onClick={() => { setSection(id); if (id === 'solicitacoes' || id === 'estoque' || id === 'unidades' || id === 'materiais') void refresh() }}>
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
        {section === 'unidades' && <EntitiesView title="Unidades" subtitle="Locais que solicitam e controlam materiais." kind="unidades" entities={units} onCreate={createEntity} onUpdate={updateEntity} onDelete={deleteEntity} busy={busy} />}
        {section === 'materiais' && <EntitiesView title="Materiais" subtitle="Catálogo de materiais disponíveis para solicitação." kind="materiais" entities={materials} onCreate={createEntity} onUpdate={updateEntity} onDelete={deleteEntity} busy={busy} />}
        {section === 'estoque' && <InventoryView inventory={inventory} units={units} materials={materials} onCreate={createStock} onUpdate={updateStock} onDelete={deleteStock} busy={busy} />}
      </div>
    </main>
    {selected && <RequestDetail request={selected} history={history} units={units} materials={materials} onClose={() => setSelected(null)} onReview={handleReview} onStatusUpdate={handleStatusUpdate} onUpdate={(event) => updateRequest(selected.id, event)} onDelete={() => void deleteRequest(selected)} busy={busy} />}
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
      <Metric label="Prioridade alta" value={metrics?.high_priority ?? '—'} note="Pedidos classificados como alta ou crítica" icon={Activity} tone="amber" />
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
      {requests.length ? <div className="review-list">{requests.map((request) => <button key={request.id} className="review-row" onClick={() => onOpen(request)}><span className="review-item-icon"><Package size={17} /></span><span className="review-main"><b>{request.material ?? 'Material'} <small>× {request.quantidade ?? request.quantity}</small></b><span>{request.unit ?? 'Unidade'} · {dateText(request.criado_em ?? request.created_at)}</span><span className="review-reason">{request.justificativa}</span></span><span className="priority-pill">{request.decisao?.prioridade !== null && request.decisao?.prioridade !== undefined ? `Prioridade ${priorityText(request.decisao.prioridade)}` : 'Sem prioridade'}</span><ChevronRight size={16} /></button>)}</div> : <Empty text="A fila de revisão está vazia." icon={<CheckCircle2 size={21} />} />}
    </section>
  </>
}

function EntitiesView({ title, subtitle, kind, entities, onCreate, onUpdate, onDelete, busy }: {
  title: string; subtitle: string; kind: 'unidades' | 'materiais'; entities: Entity[];
  onCreate: (event: FormEvent<HTMLFormElement>, kind: 'unidades' | 'materiais') => void
  onUpdate: (event: FormEvent<HTMLFormElement>, kind: 'unidades' | 'materiais', id: string) => void
  onDelete: (kind: 'unidades' | 'materiais', entity: Entity) => void
  busy: boolean
}) {
  const Icon = kind === 'unidades' ? MapPin : Package
  const [editingId, setEditingId] = useState<string | null>(null)
  return <><PageHeading eyebrow="CADASTROS" title={title} description={subtitle} />
    <div className="workflow-grid narrow-form-grid">
      <section className="panel form-panel">
        <div className="panel-heading"><div><h2>Novo cadastro</h2><p>Adicione um registro ao catálogo.</p></div><span className="icon-tile"><Plus size={17} /></span></div>
        <form className="form-stack" onSubmit={(event) => onCreate(event, kind)}>
          <Field label="Nome"><input name="nome" maxLength={160} placeholder={kind === 'unidades' ? 'Ex.: Base Norte' : 'Ex.: Kit de primeiros socorros'} required /></Field>
          <Field label="Código"><input name="codigo" placeholder={kind === 'unidades' ? 'Ex.: UNI-001' : 'Opcional'} required={kind === 'unidades'} /></Field>
          {kind === 'unidades' ? <Field label="Localização"><input name="localizacao" placeholder="Cidade, base ou endereço" required /></Field> : <>
            <Field label="Categoria"><input name="categoria" placeholder="Ex.: manutenção" required /></Field>
            <Field label="Unidade de medida"><input name="unidade_medida" defaultValue="unidade" placeholder="Ex.: caixa, litro, unidade" required /></Field>
          </>}
          <Field label="Descrição"><textarea name="descricao" rows={3} placeholder="Informações complementares (opcional)." /></Field>
          <button className="button button-primary full-button" disabled={busy}><Plus size={16} />{busy ? 'Salvando…' : `Cadastrar ${kind === 'unidades' ? 'unidade' : 'material'}`}</button>
        </form>
      </section>
      <section className="panel list-panel">
        <div className="panel-heading"><div><h2>Registros cadastrados</h2><p>{entities.length} itens · use as ações para editar ou excluir</p></div><span className="icon-tile"><Icon size={17} /></span></div>
        {entities.length ? <div className="entity-list">{entities.map((entity) => editingId === entity.id ? <form className="entity-edit-form" key={entity.id} onSubmit={(event) => onUpdate(event, kind, entity.id)}>
          <div className="edit-form-grid">
            <Field label="Nome"><input name="nome" defaultValue={entity.nome} maxLength={160} required /></Field>
            <Field label="Código"><input name="codigo" defaultValue={entity.codigo ?? ''} required={kind === 'unidades'} /></Field>
            {kind === 'unidades' ? <Field label="Localização"><input name="localizacao" defaultValue={entity.localizacao ?? ''} required /></Field> : <>
              <Field label="Categoria"><input name="categoria" defaultValue={entity.categoria ?? ''} required /></Field>
              <Field label="Unidade de medida"><input name="unidade_medida" defaultValue={entity.unidade_medida ?? 'unidade'} required /></Field>
            </>}
            <Field label="Situação"><select name="ativo" defaultValue={entity.ativo === false ? 'false' : 'true'}><option value="true">Ativo</option><option value="false">Inativo</option></select></Field>
            <Field label="Descrição"><textarea name="descricao" defaultValue={entity.descricao ?? ''} rows={2} /></Field>
          </div>
          <div className="row-actions"><button className="button button-primary" type="submit" disabled={busy}><Check size={14} />Salvar</button><button className="button button-quiet" type="button" onClick={() => setEditingId(null)} disabled={busy}>Cancelar</button></div>
        </form> : <div className="entity-row" key={entity.id}>
          <span className="entity-icon"><Icon size={16} /></span>
          <span className="entity-copy"><b>{entity.nome}</b><small>{entity.descricao || (kind === 'unidades' ? entity.localizacao : entity.categoria) || 'Sem descrição'}</small></span>
          <span className={`state-tag ${entity.ativo === false ? 'off' : ''}`}>{entity.ativo === false ? 'Inativo' : 'Ativo'}</span>
          <div className="row-actions compact-actions"><button className="icon-button" type="button" aria-label={`Editar ${entity.nome}`} title="Editar" onClick={() => setEditingId(entity.id)} disabled={busy}><Pencil size={14} /></button><button className="icon-button danger-button" type="button" aria-label={`Excluir ${entity.nome}`} title="Excluir" onClick={() => onDelete(kind, entity)} disabled={busy}><Trash2 size={14} /></button></div>
        </div>)}</div> : <Empty text={`Nenhum registro de ${kind === 'unidades' ? 'unidade' : 'material'} cadastrado.`} />}
      </section>
    </div>
  </>
}

function InventoryView({ inventory, units, materials, onCreate, onUpdate, onDelete, busy }: {
  inventory: Inventory[]; units: Entity[]; materials: Entity[];
  onCreate: (event: FormEvent<HTMLFormElement>) => void
  onUpdate: (event: FormEvent<HTMLFormElement>, itemId: string) => void
  onDelete: (item: Inventory) => void
  busy: boolean
}) {
  const unitName = (id: string) => units.find((item) => item.id === id)?.nome ?? 'Unidade removida'
  const materialName = (id: string) => materials.find((item) => item.id === id)?.nome ?? 'Material removido'
  const [editingId, setEditingId] = useState<string | null>(null)
  return <><PageHeading eyebrow="CONTROLE DE MATERIAIS" title="Estoque" description="Consulte os saldos informativos por unidade e material." />
    <div className="workflow-grid"><section className="panel form-panel"><div className="panel-heading"><div><h2>Adicionar saldo</h2><p>Registre a quantidade disponível na unidade.</p></div><span className="icon-tile"><Warehouse size={17} /></span></div>
      <form className="form-stack" onSubmit={onCreate}><Field label="Unidade"><select name="unidade_id" required defaultValue=""><option value="" disabled>Selecione uma unidade</option>{units.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></Field><Field label="Material"><select name="material_id" required defaultValue=""><option value="" disabled>Selecione um material</option>{materials.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></Field><div className="form-pair"><Field label="Quantidade"><input name="quantidade" type="number" min="0" step="any" required placeholder="0" /></Field><Field label="Unidade de medida"><input name="unidade_medida" defaultValue="unidade" required /></Field></div><Field label="Observações"><textarea name="observacoes" rows={3} placeholder="Opcional" /></Field><button className="button button-primary full-button" disabled={busy || !units.length || !materials.length}><Plus size={16} />Adicionar ao estoque</button></form>
    </section><section className="panel list-panel"><div className="panel-heading"><div><h2>Saldos registrados</h2><p>{inventory.length} posições de estoque</p></div><span className="icon-tile"><ArrowDownUp size={17} /></span></div>
      {inventory.length ? <div className="stock-list">{inventory.map((item) => editingId === item.id ? <form className="stock-edit-form" key={item.id} onSubmit={(event) => onUpdate(event, item.id)}>
        <div className="stock-edit-title"><b>{materialName(item.material_id)}</b><small>{unitName(item.unidade_id)}</small></div>
        <div className="edit-form-grid"><Field label="Quantidade"><input name="quantidade" type="number" min="0" step="any" defaultValue={item.quantidade} required /></Field><Field label="Unidade de medida"><input name="unidade_medida" defaultValue={item.unidade_medida} required /></Field><Field label="Observações"><input name="observacoes" defaultValue={item.observacoes ?? ''} /></Field></div>
        <div className="row-actions"><button className="button button-primary" type="submit" disabled={busy}><Check size={14} />Salvar</button><button className="button button-quiet" type="button" onClick={() => setEditingId(null)} disabled={busy}>Cancelar</button></div>
      </form> : <div className="stock-row" key={item.id}>
        <span className="entity-icon"><Boxes size={16} /></span><span className="stock-desc"><b>{materialName(item.material_id)}</b><small>{unitName(item.unidade_id)}{item.observacoes ? ` · ${item.observacoes}` : ''}</small></span>
        <span className="stock-amount"><b>{item.quantidade}</b><small>{item.unidade_medida}</small></span>
        <div className="row-actions compact-actions"><button className="icon-button" type="button" aria-label={`Editar saldo de ${materialName(item.material_id)}`} title="Editar saldo" onClick={() => setEditingId(item.id)} disabled={busy}><Pencil size={14} /></button><button className="icon-button danger-button" type="button" aria-label={`Excluir saldo de ${materialName(item.material_id)}`} title="Excluir saldo" onClick={() => onDelete(item)} disabled={busy}><Trash2 size={14} /></button></div>
      </div>)}</div> : <Empty text="Nenhum saldo registrado." />}
    </section></div>
  </>
}

function RequestTable({ requests, onOpen, empty }: { requests: LogisticsRequest[]; onOpen: (request: LogisticsRequest) => void; empty: string }) {
  return requests.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Material e quantidade</th><th>Unidade</th><th>Prioridade</th><th>Situação</th><th>Data</th><th /></tr></thead><tbody>{requests.map((request) => {
    const priority = request.decisao?.prioridade ?? request.priority
    const status = request.status
    return <tr key={request.id} onClick={() => onOpen(request)} tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && onOpen(request)}><td><span className="table-primary">{request.material ?? 'Material'}</span><small>{request.quantidade ?? request.quantity} {request.decisao?.unidade_medida ?? 'un.'}</small></td><td>{request.unit ?? 'Unidade'}</td><td>{priority !== null && priority !== undefined ? <span className="priority-pill">{priorityText(priority)}</span> : '—'}</td><td><span className={`status-pill ${request.decisao?.revisao_humana || status === 'aguardando_revisao' ? 'status-review' : ''}`}><i />{statusText[status] ?? readable(status)}</span></td><td>{dateText(request.criado_em ?? request.created_at)}</td><td><ChevronRight size={15} /></td></tr>
  })}</tbody></table></div> : <Empty text={empty} icon={<Archive size={21} />} />
}

function RequestDetail({ request, history, units, materials, onClose, onReview, onStatusUpdate, onUpdate, onDelete, busy }: {
  request: LogisticsRequest; history: DecisionHistory[]; units: Entity[]; materials: Entity[]
  onClose: () => void
  onReview: (event: FormEvent<HTMLFormElement>) => void
  onStatusUpdate: (event: FormEvent<HTMLFormElement>) => void
  onUpdate: (event: FormEvent<HTMLFormElement>) => void
  onDelete: () => void
  busy: boolean
}) {
  const [editing, setEditing] = useState(false)
  const decision = request.decisao ?? {}
  const needsReview = decision.revisao_humana || request.status === 'aguardando_revisao'
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title">
    <header className="detail-header"><div><div className="eyebrow">DETALHE DO PEDIDO</div><h2 id="detail-title">{request.material ?? 'Solicitação'}</h2></div><div className="row-actions"><button className="icon-button danger-button" aria-label="Excluir solicitação" title="Excluir solicitação" onClick={onDelete} disabled={busy}><Trash2 size={16} /></button><button className="icon-button" aria-label="Fechar" onClick={onClose}><X size={18} /></button></div></header>
    <div className="detail-body"><div className="detail-chips"><span className="status-pill"><i />{statusText[request.status] ?? readable(request.status)}</span>{decision.prioridade !== null && decision.prioridade !== undefined && <span className="priority-pill">Prioridade {priorityText(decision.prioridade)}</span>}</div>
      {!editing && <div className="request-edit-actions"><button className="button button-quiet" type="button" onClick={() => setEditing(true)}><Pencil size={14} />Editar solicitação</button></div>}
      {editing && <form className="request-edit-form form-stack" onSubmit={onUpdate}>
        <div className="subheading"><h3>Editar dados da solicitação</h3></div>
        <Field label="Unidade"><select name="unidade_id" defaultValue={request.unidade_id} required>{units.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></Field>
        <Field label="Material"><select name="material_id" defaultValue={request.material_id} required>{materials.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></Field>
        <Field label="Quantidade"><input name="quantidade" type="number" min="0.01" step="any" defaultValue={request.quantidade} required /></Field>
        <Field label="Justificativa"><textarea name="justificativa" rows={4} minLength={3} maxLength={4000} defaultValue={request.justificativa} required /></Field>
        <p className="inline-hint"><CircleAlert size={14} />Ao salvar, a classificação será refeita e enviada para revisão humana.</p>
        <div className="row-actions"><button className="button button-primary" type="submit" disabled={busy}><Check size={14} />{busy ? 'Salvando…' : 'Salvar alterações'}</button><button className="button button-quiet" type="button" onClick={() => setEditing(false)} disabled={busy}>Cancelar</button></div>
      </form>}
      <div className="detail-grid"><DetailField label="Unidade" value={request.unit ?? '—'} /><DetailField label="Quantidade" value={`${request.quantidade ?? request.quantity}`} /><DetailField label="Categoria" value={decision.categoria ?? 'Não classificada'} /><DetailField label="Setor sugerido" value={decision.setor ?? 'Não definido'} /><DetailField label="Criada em" value={dateText(request.criado_em ?? request.created_at)} /></div>
      <div className="detail-block"><label>Justificativa</label><p>{request.justificativa || 'Sem justificativa informada.'}</p></div>
      {decision.regra_prioridade_aplicada === 'estoque_zerado_atendimento_hoje' && <div className="inline-hint"><CircleAlert size={14} />Prioridade elevada para alta pela regra de estoque zerado com atendimento agendado para hoje.</div>}
      {decision.erro_provedor && <div className="inline-hint"><CircleAlert size={14} />A triagem automática não ficou disponível. Revise os campos manualmente.</div>}
      {!editing && !needsReview && <form className="status-update form-stack" onSubmit={onStatusUpdate}><div className="subheading"><h3>Atualizar andamento</h3></div><div className="form-pair"><Field label="Status"><select name="status" defaultValue={request.status}><option value="pendente">Pendente</option><option value="em_analise">Em análise</option><option value="encaminhada">Encaminhada</option><option value="atendida">Atendida</option><option value="concluida">Concluída</option><option value="cancelada">Cancelada</option></select></Field><button className="button button-primary status-save" disabled={busy}>Salvar status</button></div></form>}
      {!editing && needsReview && <section className="review-form-section"><div className="subheading"><h3>Registrar revisão</h3><span>Decisão humana</span></div><form className="form-stack" onSubmit={onReview}>
        <div className="form-pair"><Field label="Revisor"><input name="revisor" maxLength={160} placeholder="Nome do responsável" required /></Field><Field label="Prioridade"><select name="prioridade" defaultValue={priorityValue(decision.prioridade)}><option value="">Manter sugestão da triagem</option><option value="baixa">Baixa</option><option value="normal">Normal</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></Field></div>
        <div className="form-pair"><Field label="Categoria"><input name="categoria" defaultValue={decision.categoria ?? ''} placeholder="Ex.: manutenção" /></Field><Field label="Setor"><input name="setor" defaultValue={decision.setor ?? ''} placeholder="Ex.: logística" /></Field></div>
        <Field label="Status após revisão"><select name="status" defaultValue="pendente"><option value="pendente">Pendente</option><option value="em_analise">Em análise</option><option value="atendida">Atendida</option><option value="cancelada">Cancelada</option></select></Field>
        <Field label="Notas da revisão"><textarea name="notas" rows={3} placeholder="Motivo, contexto ou encaminhamento." /></Field>
        <button className="button button-primary full-button" disabled={busy}><CheckCircle2 size={16} />{busy ? 'Salvando…' : 'Salvar decisão'}</button>
      </form></section>}
      <section className="history-section"><div className="subheading"><h3><History size={15} />Histórico de decisões</h3><span>{history.length} eventos</span></div>{history.length ? <ol className="history-list">{history.map((entry) => <li key={entry.id}><span className="history-dot" /><div><b>{entry.tipo === 'revisao_humana' ? 'Revisão humana' : entry.tipo === 'alteracao_status' ? 'Alteração de status' : entry.tipo === 'reclassificacao_por_edicao' ? 'Reclassificação após edição' : 'Triagem inicial'}</b><small>{dateText(entry.criado_em)}{entry.revisor ? ` · ${entry.revisor}` : ''}</small>{entry.tipo === 'alteracao_status' && <p>{statusText[entry.status_anterior ?? ''] ?? readable(entry.status_anterior)} → {statusText[entry.status_novo ?? ''] ?? readable(entry.status_novo)}</p>}{entry.notas && <p>{entry.notas}</p>}</div></li>)}</ol> : <p className="muted-copy">Nenhum evento de decisão registrado.</p>}</section>
    </div>
  </section></div>
}

function DetailField({ label, value }: { label: string; value: string }) { return <div><label>{label}</label><b>{value}</b></div> }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label> }
function Empty({ text, icon = <Archive size={20} /> }: { text: string; icon?: ReactNode }) { return <div className="empty-state"><span>{icon}</span><p>{text}</p></div> }

export default App
