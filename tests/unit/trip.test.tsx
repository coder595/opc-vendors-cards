import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addNote } from '../../src/data/notes'
import { createVendor } from '../../src/data/vendors'
import { db } from '../../src/db/schema'
import { TripScreen } from '../../src/features/trip/TripScreen'
import { resetDb } from './helpers/db'

describe('TripScreen', () => {
  beforeEach(resetDb)
  afterEach(resetDb)

  it('shows an empty state without vendors', async () => {
    render(<TripScreen />)
    expect(await screen.findByText(/no vendors yet/i)).toBeInTheDocument()
  })

  it('summarizes pipeline, open tasks and booths', async () => {
    const acme = await createVendor({
      name: 'ACME',
      status: 'quoted',
      country: 'China',
      fair: { hall: '1.2', booth: 'A14' },
    })
    await createVendor({ name: 'Globex', status: 'lead', country: 'Germany' })
    await addNote(acme, { text: 'Ask for samples', isTask: true })

    render(<TripScreen />)
    expect(await screen.findByRole('heading', { name: 'Trip summary' })).toBeInTheDocument()
    expect(screen.getByText('Quoted')).toBeInTheDocument()
    expect(screen.getByText('Ask for samples')).toBeInTheDocument()
    expect(screen.getByText('1.2 A14')).toBeInTheDocument()
    const acmeLinks = screen.getAllByRole('link', { name: /ACME/ })
    expect(acmeLinks.length).toBeGreaterThan(0)
    expect(acmeLinks[0]).toHaveAttribute('href', `#/vendors/${acme}`)
    expect(screen.getByRole('button', { name: /print summary/i })).toBeInTheDocument()
  })

  it('omits tasks whose vendor is missing', async () => {
    const acme = await createVendor({ name: 'ACME' })
    const noteId = await addNote(acme, { text: 'Orphan task', isTask: true })
    await db.notes.update(noteId, { vendorId: 'missing' })

    render(<TripScreen />)
    await screen.findByRole('heading', { name: 'Trip summary' })
    expect(screen.queryByText('Orphan task')).toBeNull()
    expect(screen.getByText(/no open tasks/i)).toBeInTheDocument()
  })
})
