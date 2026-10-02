import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the project shell', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Base do sistema pronta.' })).toBeInTheDocument()
    expect(screen.getByText('Ambiente de desenvolvimento')).toBeInTheDocument()
  })
})
