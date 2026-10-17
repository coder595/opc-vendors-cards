import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from '../../src/App'

describe('app shell', () => {
  it('renders the empty state', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: /no vendors yet/i })).toBeInTheDocument()
  })

  it('renders the five primary destinations', () => {
    render(<App />)
    const nav = screen.getByRole('navigation', { name: /primary/i })
    expect(nav).toBeInTheDocument()
    expect(within(nav).getAllByRole('link')).toHaveLength(5)
  })

  it('moves aria-current to the active hash route', () => {
    window.location.hash = '#/people'
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    render(<App />)
    expect(screen.getByRole('link', { name: /people/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /vendors/i })).not.toHaveAttribute('aria-current')
  })

  it('renders the capture form at #/vendors/new', () => {
    window.location.hash = '#/vendors/new'
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    render(<App />)
    expect(screen.getByRole('heading', { name: /new vendor/i })).toBeInTheDocument()
  })
})
