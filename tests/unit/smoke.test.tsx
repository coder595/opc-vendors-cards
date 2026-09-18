import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from '../../src/App'

describe('app shell', () => {
  it('renders the empty state', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /no vendors yet/i })).toBeInTheDocument()
  })

  it('renders the four primary destinations', () => {
    render(<App />)
    const nav = screen.getByRole('navigation', { name: /primary/i })
    expect(nav).toBeInTheDocument()
    expect(within(nav).getAllByRole('link')).toHaveLength(4)
  })

  it('moves aria-current to the active hash route', () => {
    window.location.hash = '#/people'
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    render(<App />)
    expect(screen.getByRole('link', { name: /people/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /vendors/i })).not.toHaveAttribute('aria-current')
  })

  it('announces the placeholder when capture is requested', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getAllByRole('button', { name: /add vendor/i })[0]!)
    expect(screen.getByRole('status')).toHaveTextContent(/next phase/i)
  })
})
