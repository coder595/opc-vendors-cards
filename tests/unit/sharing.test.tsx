import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../src/db/schema'
import { ShareScreen } from '../../src/features/sharing/ShareScreen'
import { makeEnvelope, makeVendor } from './helpers/fixtures'
import { resetDb } from './helpers/db'

describe('ShareScreen', () => {
  beforeEach(resetDb)
  afterEach(resetDb)

  it('previews and imports a plain JSON export', async () => {
    const user = userEvent.setup()
    render(<ShareScreen />)

    const envelope = makeEnvelope([makeVendor({ name: 'Imported Co' })])
    const file = new File([JSON.stringify(envelope)], 'export.json', { type: 'application/json' })
    await user.upload(screen.getByLabelText('Import file'), file)

    expect(await screen.findByText(/1 vendors, 0 people/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /merge into this device/i }))

    await waitFor(async () => {
      expect(await db.vendors.count()).toBe(1)
    })
    expect(await screen.findByText(/Imported 1 vendors/i)).toBeInTheDocument()
  })

  it('shows an error for an unreadable file', async () => {
    const user = userEvent.setup()
    render(<ShareScreen />)

    const file = new File(['not json'], 'bad.json', { type: 'application/json' })
    await user.upload(screen.getByLabelText('Import file'), file)

    expect(await screen.findByText(/not valid JSON/i)).toBeInTheDocument()
  })
})
