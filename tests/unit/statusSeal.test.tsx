import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusSeal } from '../../src/components/StatusSeal'

describe('StatusSeal', () => {
  it('exposes an accessible name with status and rating', () => {
    render(<StatusSeal status="quoted" rating={4} />)
    expect(
      screen.getByRole('img', { name: /Status: Quoted\. Rating 4 of 5\./ }),
    ).toBeInTheDocument()
  })

  it('is hidden from assistive tech when decorative', () => {
    const { container } = render(<StatusSeal status="lead" decorative />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('maps status to a tone token', () => {
    const { container } = render(<StatusSeal status="ordered" />)
    expect(container.querySelector('svg')).toHaveAttribute('data-tone', 'jade')
  })
})
