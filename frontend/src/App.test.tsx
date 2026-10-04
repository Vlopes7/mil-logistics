import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const { api } = vi.hoisted(() => ({
  api: {
    getHealth: vi.fn(),
    getDashboard: vi.fn(),
    getRequests: vi.fn(),
    getRequestsForReview: vi.fn(),
    getUnits: vi.fn(),
    getMaterials: vi.fn(),
    getInventory: vi.fn(),
    updateMaterial: vi.fn(),
  },
}))

vi.mock('./services/APIClient', () => ({ apiClient: api }))

describe('App', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    api.getHealth.mockResolvedValue({ status: 'ok', database: 'connected' })
    api.getDashboard.mockResolvedValue({
      metrics: { total: 0, pending: 0, review: 0, completed: 0, high_priority: 0 },
      categories: [],
      recent_requests: [],
    })
    api.getRequests.mockResolvedValue([])
    api.getRequestsForReview.mockResolvedValue([])
    api.getUnits.mockResolvedValue([])
    api.getMaterials.mockResolvedValue([{
      id: 'material-1', nome: 'Papel A4', codigo: 'MAT-001', categoria: 'administrativo',
      unidade_medida: 'resma', descricao: 'Papel para impressão', ativo: true,
    }])
    api.getInventory.mockResolvedValue([])
    api.updateMaterial.mockResolvedValue({})
  })

  it('renders the application dashboard after loading API data', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeInTheDocument()
    expect(await screen.findByText('Conectado')).toBeInTheDocument()
    expect(api.getDashboard).toHaveBeenCalled()
    expect(api.getMaterials).toHaveBeenCalled()
  })

  it('saves edits to a material through the API client', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Materiais' }))
    const materialRow = await screen.findByText('Papel A4')
    const row = materialRow.closest('.entity-row')
    expect(row).not.toBeNull()
    await user.click(within(row as HTMLElement).getByRole('button', { name: 'Editar Papel A4' }))

    const nameFields = screen.getAllByLabelText('Nome')
    await user.clear(nameFields[1])
    await user.type(nameFields[1], 'Papel A4 reciclado')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(api.updateMaterial).toHaveBeenCalledWith('material-1', expect.objectContaining({
      nome: 'Papel A4 reciclado',
      categoria: 'administrativo',
      unidade_medida: 'resma',
    })))
    expect(await screen.findByText('Material atualizado.')).toBeInTheDocument()
  })
})
