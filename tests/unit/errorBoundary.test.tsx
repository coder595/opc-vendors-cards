import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary, isIdbConnectionLost } from '../../src/components/ErrorBoundary'

function Boom(): never {
  throw new Error('kaboom')
}

describe('ErrorBoundary', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('All good')).toBeInTheDocument()
  })

  it('shows a recovery fallback when a child throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument()
    expect(screen.getByText('kaboom')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /export a backup/i })).toBeInTheDocument()
  })

  it('recognises the iOS IndexedDB connection-lost errors', () => {
    const unknown = new Error('Unable to open cursor UnknownError: Unable to open cursor')
    unknown.name = 'UnknownError'
    expect(isIdbConnectionLost(unknown)).toBe(true)
    expect(
      isIdbConnectionLost(
        new Error('Connection to Indexed Database server lost. Refresh the page'),
      ),
    ).toBe(true)
    expect(isIdbConnectionLost(new Error('kaboom'))).toBe(false)
  })

  it('normalizes non-Error throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    function ThrowsString(): never {
      throw 'plain string'
    }
    render(
      <ErrorBoundary>
        <ThrowsString />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument()
    expect(screen.getByText('plain string')).toBeInTheDocument()
  })
})
