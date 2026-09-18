import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getSettings } from '../../src/data/settings'
import { SettingsScreen } from '../../src/features/settings/SettingsScreen'
import { resetDb } from './helpers/db'

describe('SettingsScreen', () => {
  beforeEach(resetDb)
  afterEach(resetDb)

  it('saves a base currency and a rate', async () => {
    const user = userEvent.setup()
    render(<SettingsScreen />)
    await screen.findByRole('heading', { name: /settings/i })

    await user.click(screen.getByRole('button', { name: /add rate/i }))
    await user.type(screen.getByLabelText('Currency 1'), 'CNY')
    await user.type(screen.getByLabelText(/units per 1/i), '7.2')
    await user.click(screen.getByRole('button', { name: /save settings/i }))

    await waitFor(async () => {
      const settings = await getSettings()
      expect(settings.baseCurrency).toBe('USD')
      expect(settings.rates).toEqual({ CNY: 7.2 })
    })
  })

  it('rejects a zero rate without saving', async () => {
    const user = userEvent.setup()
    render(<SettingsScreen />)
    await screen.findByRole('heading', { name: /settings/i })

    await user.click(screen.getByRole('button', { name: /add rate/i }))
    await user.type(screen.getByLabelText('Currency 1'), 'CNY')
    await user.type(screen.getByLabelText(/units per 1/i), '0')
    await user.click(screen.getByRole('button', { name: /save settings/i }))

    expect(await screen.findByText(/positive number/i)).toBeInTheDocument()
    expect((await getSettings()).rates).toEqual({})
  })
})
