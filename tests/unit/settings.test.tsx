import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getSettings } from '../../src/data/settings'
import { SettingsScreen } from '../../src/features/settings/SettingsScreen'
import { resetDb } from './helpers/db'

describe('SettingsScreen', () => {
  beforeEach(resetDb)
  afterEach(resetDb)

  it('persists the theme preference', async () => {
    const user = userEvent.setup()
    render(<SettingsScreen />)
    await screen.findByRole('heading', { name: /settings/i })

    await user.selectOptions(screen.getByLabelText('Theme'), 'dark')

    await waitFor(async () => {
      expect((await getSettings()).theme).toBe('dark')
    })
  })
})
