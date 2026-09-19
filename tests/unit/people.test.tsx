import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addContact } from '../../src/data/contacts'
import { createVendor } from '../../src/data/vendors'
import { db } from '../../src/db/schema'
import { PeopleScreen } from '../../src/features/people/PeopleScreen'
import { resetDb } from './helpers/db'

describe('PeopleScreen', () => {
  beforeEach(resetDb)
  afterEach(resetDb)

  it('lists people across vendors with channel links, sorted by name', async () => {
    const acme = await createVendor({ name: 'ACME' })
    const globex = await createVendor({ name: 'Globex' })
    await addContact(acme, { name: 'Li Wei', position: 'Sales', phone: '+86 123', isPrimary: true })
    await addContact(globex, { name: 'Ana Cruz', email: 'ana@example.com' })

    render(<PeopleScreen />)
    expect(await screen.findByRole('heading', { name: 'People' })).toBeInTheDocument()
    expect(screen.getByText('Li Wei')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /ACME/ })).toHaveAttribute('href', `#/vendors/${acme}`)
    expect(screen.getByRole('link', { name: 'ana@example.com' })).toHaveAttribute(
      'href',
      'mailto:ana@example.com',
    )
    expect(screen.getByRole('link', { name: '+86 123' })).toHaveAttribute('href', 'tel:+86123')
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Ana Cruz')
  })

  it('filters by person, role or company', async () => {
    const user = userEvent.setup()
    const acme = await createVendor({ name: 'ACME' })
    await addContact(acme, { name: 'Li Wei' })
    const globex = await createVendor({ name: 'Globex' })
    await addContact(globex, { name: 'Ana Cruz' })

    render(<PeopleScreen />)
    await screen.findByText('Li Wei')
    await user.type(screen.getByLabelText('Search'), 'globex')
    await waitFor(() => expect(screen.queryByText('Li Wei')).toBeNull())
    expect(screen.getByText('Ana Cruz')).toBeInTheDocument()
  })

  it('excludes people whose vendor is deleted', async () => {
    const acme = await createVendor({ name: 'ACME' })
    await addContact(acme, { name: 'Li Wei' })
    await db.vendors.update(acme, { deletedAt: Date.now() })

    render(<PeopleScreen />)
    expect(await screen.findByText(/no people yet/i)).toBeInTheDocument()
    expect(screen.queryByText('Li Wei')).toBeNull()
  })

  it('shows an empty state', async () => {
    render(<PeopleScreen />)
    expect(await screen.findByText(/no people yet/i)).toBeInTheDocument()
  })
})
