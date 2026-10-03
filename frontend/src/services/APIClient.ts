export interface ApiHealth {
  status: 'ok' | 'degraded'
  database: 'connected' | 'unavailable' | 'not_configured'
}

export interface DashboardMetrics {
  total: number
  pending: number
  review: number
  completed: number
  high_priority: number
  average_priority: number | null
}

export interface CategorySummary { name: string; total: number }
export interface DashboardData {
  metrics: DashboardMetrics
  categories: CategorySummary[]
  recent_requests: LogisticsRequest[]
}
export interface Entity {
  id: string
  nome: string
  descricao?: string | null
  ativo?: boolean
  codigo?: string | null
  localizacao?: string | null
  categoria?: string | null
  unidade_medida?: string | null
  criado_em?: string
}
export interface Inventory {
  id: string
  unidade_id: string
  material_id: string
  quantidade: number
  unidade_medida: string
  observacoes?: string | null
}
export interface Decision {
  categoria?: string | null
  setor?: string | null
  prioridade?: number | null
  revisao_humana?: boolean
  revisada_por?: string
  revisada_em?: string
  erro_provedor?: string
  unidade_medida?: string
}
export interface LogisticsRequest {
  id: string
  unidade_id: string
  material_id: string
  quantidade: number
  quantity?: number
  justificativa: string
  unidade_medida?: string
  status: string
  decisao?: Decision | null
  criado_em?: string | null
  atualizado_em?: string | null
  unit?: string
  material?: string
  category?: string
  sector?: string
  priority?: number | null
  needs_review?: boolean
  created_at?: string | null
}
export interface DecisionHistory {
  id: string
  tipo: string
  antes?: Record<string, unknown>
  depois?: Record<string, unknown>
  decisao?: Decision
  revisor?: string
  notas?: string | null
  status?: string
  status_anterior?: string | null
  status_novo?: string
  criado_em?: string
}
export interface RequestPayload {
  unidade_id: string
  material_id: string
  quantidade: number
  justificativa: string
}
export interface ReviewPayload {
  revisor: string
  notas?: string
  categoria?: string
  setor?: string
  prioridade?: number
  status?: string
}

export class APIError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message)
    this.name = 'APIError'
  }
}

const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1'
const apiOrigin = new URL(apiBaseUrl).origin

export class APIClient {
  constructor(private readonly baseUrl = apiBaseUrl, private readonly origin = apiOrigin) {}

  getHealth() { return this.request<ApiHealth>(`${this.origin}/health`) }
  getDashboard() { return this.request<DashboardData>(`${this.baseUrl}/dashboard`) }
  getUnits() { return this.request<Entity[]>(`${this.baseUrl}/unidades`) }
  createUnit(data: Pick<Entity, 'nome'> & Partial<Pick<Entity, 'descricao' | 'ativo' | 'codigo' | 'localizacao'>>) { return this.request<Entity>(`${this.baseUrl}/unidades`, 'POST', data) }
  getMaterials() { return this.request<Entity[]>(`${this.baseUrl}/materiais`) }
  createMaterial(data: Pick<Entity, 'nome'> & Partial<Pick<Entity, 'descricao' | 'ativo' | 'codigo' | 'categoria' | 'unidade_medida'>>) { return this.request<Entity>(`${this.baseUrl}/materiais`, 'POST', data) }
  getInventory() { return this.request<Inventory[]>(`${this.baseUrl}/estoques`) }
  createInventory(data: Omit<Inventory, 'id'>) { return this.request<Inventory>(`${this.baseUrl}/estoques`, 'POST', data) }
  upsertInventory(data: Omit<Inventory, 'id'>) { return this.request<Inventory>(`${this.baseUrl}/estoques`, 'PUT', data) }
  updateInventory(id: string, data: Partial<Pick<Inventory, 'quantidade' | 'unidade_medida' | 'observacoes'>>) { return this.request<Inventory>(`${this.baseUrl}/estoques/${id}`, 'PATCH', data) }
  getRequests(params: { status?: string; precisa_revisao?: boolean } = {}) {
    const query = new URLSearchParams()
    if (params.status) query.set('status', params.status)
    if (params.precisa_revisao !== undefined) query.set('precisa_revisao', String(params.precisa_revisao))
    return this.request<LogisticsRequest[]>(`${this.baseUrl}/solicitacoes${query.size ? `?${query}` : ''}`)
  }
  getRequestsForReview() { return this.request<LogisticsRequest[]>(`${this.baseUrl}/solicitacoes/revisao`) }
  createRequest(data: RequestPayload) { return this.request<LogisticsRequest>(`${this.baseUrl}/solicitacoes`, 'POST', data) }
  updateRequestStatus(id: string, status: string) { return this.request<LogisticsRequest>(`${this.baseUrl}/solicitacoes/${id}`, 'PATCH', { status }) }
  getRequest(id: string) { return this.request<LogisticsRequest>(`${this.baseUrl}/solicitacoes/${id}`) }
  getDecisions(id: string) { return this.request<DecisionHistory[]>(`${this.baseUrl}/solicitacoes/${id}/decisoes`) }
  reviewRequest(id: string, data: ReviewPayload) { return this.request<LogisticsRequest>(`${this.baseUrl}/solicitacoes/${id}/revisao`, 'POST', data) }

  private async request<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
    let response: Response
    try {
      response = await fetch(url, {
        method,
        headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      })
    } catch {
      throw new APIError('Não foi possível conectar à API. Confira se o servidor está iniciado.')
    }
    if (!response.ok) {
      let message = 'A API não conseguiu concluir a operação.'
      try {
        const data = await response.json() as { detail?: string }
        if (data.detail) message = data.detail
      } catch { /* mantém mensagem padrão */ }
      throw new APIError(message, response.status)
    }
    if (response.status === 204) return undefined as T
    return await response.json() as T
  }
}

export const apiClient = new APIClient()
