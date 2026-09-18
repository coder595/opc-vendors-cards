import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addProduct } from '../../src/data/products'
import { updateSettings } from '../../src/data/settings'
import { createVendor } from '../../src/data/vendors'
import { VendorDetail } from '../../src/features/vendors/VendorDetail'
import { resetDb } from './helpers/db'

describe('VendorDetail', () => {
  beforeEach(resetDb)
  afterEach(resetDb)

  it('renders a not-found state for an unknown id', async () => {
    render(<VendorDetail vendorId="missing" />)
    expect(await screen.findByRole('heading', { name: /vendor not found/i })).toBeInTheDocument()
  })

  it('renders an unsafe website as text, never a link', async () => {
    const id = await createVendor({ name: 'ACME', website: 'javascript:alert(1)' })
    render(<VendorDetail vendorId={id} />)
    expect(await screen.findByRole('heading', { name: 'ACME' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'javascript:alert(1)' })).toBeNull()
    expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument()
  })

  it('links a safe website', async () => {
    const id = await createVendor({ name: 'ACME', website: 'https://acme.example' })
    render(<VendorDetail vendorId={id} />)
    expect(await screen.findByRole('heading', { name: 'ACME' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'https://acme.example' })).toHaveAttribute(
      'href',
      'https://acme.example/',
    )
  })

  it('updates status inline', async () => {
    const user = userEvent.setup()
    const id = await createVendor({ name: 'ACME' })
    render(<VendorDetail vendorId={id} />)
    await screen.findByRole('heading', { name: 'ACME' })
    await user.selectOptions(screen.getByLabelText('Status'), 'quoted')
    await waitFor(() => expect(screen.getByLabelText('Status')).toHaveValue('quoted'))
  })

  it('shows the base-currency equivalent once a rate exists', async () => {
    const user = userEvent.setup()
    const id = await createVendor({ name: 'ACME' })
    await addProduct(id, { name: 'Drill', currency: 'CNY', price: 720 })

    render(<VendorDetail vendorId={id} />)
    await screen.findByRole('heading', { name: 'ACME' })
    await user.click(screen.getByRole('tab', { name: 'Products' }))
    expect(await screen.findByText(/no USD rate/i)).toBeInTheDocument()
    expect(screen.queryByTestId('base-price')).toBeNull()

    await updateSettings({ rates: { CNY: 7.2 } })

    await waitFor(() => expect(screen.getByTestId('base-price')).toHaveTextContent('100.00'))
  })
})
