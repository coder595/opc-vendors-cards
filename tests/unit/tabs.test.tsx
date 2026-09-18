import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Tabs } from '../../src/components/Tabs'

const items = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Beta' },
  { id: 'c', label: 'Gamma' },
]

function Harness() {
  const [active, setActive] = useState('a')
  return (
    <Tabs items={items} active={active} onChange={setActive} label="Sections">
      <p>{active} panel</p>
    </Tabs>
  )
}

describe('Tabs', () => {
  it('marks the active tab selected and labels the panel', () => {
    render(<Harness />)
    expect(screen.getByRole('tab', { name: 'Alpha' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Alpha')
  })

  it('moves selection with arrow keys, Home and End', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    screen.getByRole('tab', { name: 'Alpha' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Beta' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Gamma' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Alpha' })).toHaveAttribute('aria-selected', 'true')
  })

  it('roves the tabindex so only the active tab is tabbable', () => {
    render(<Harness />)
    expect(screen.getByRole('tab', { name: 'Alpha' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'Beta' })).toHaveAttribute('tabindex', '-1')
  })
})
