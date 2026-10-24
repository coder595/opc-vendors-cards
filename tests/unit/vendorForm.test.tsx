import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VendorBundleDraft } from '../../src/data/bundle'

const { saveVendorBundle, getVendorBundle, saveDraft } = vi.hoisted(() => ({
  saveVendorBundle: vi.fn(),
  getVendorBundle: vi.fn(),
  saveDraft: vi.fn(),
}))

vi.mock('../../src/data/bundle', () => ({ saveVendorBundle, getVendorBundle }))
vi.mock('../../src/data/drafts', () => ({
  saveDraft,
  loadDraft: vi.fn().mockResolvedValue(undefined),
  deleteDraft: vi.fn().mockResolvedValue(undefined),
}))

import { VendorForm } from '../../src/features/vendors/VendorForm'

describe('VendorForm', () => {
  beforeEach(() => {
    saveVendorBundle.mockReset().mockResolvedValue('vendor-1')
    getVendorBundle.mockReset().mockResolvedValue(undefined)
    saveDraft.mockReset().mockResolvedValue(undefined)
    window.location.hash = ''
  })

  it('requires a company name before saving', async () => {
    const user = userEvent.setup()
    render(<VendorForm mode="new" />)
    await user.click(screen.getByRole('button', { name: /save vendor/i }))
    expect(await screen.findByText(/enter a company name/i)).toBeInTheDocument()
    expect(saveVendorBundle).not.toHaveBeenCalled()
  })

  it('saves two people and three products', async () => {
    const user = userEvent.setup()
    render(<VendorForm mode="new" />)

    await user.type(screen.getByLabelText(/company name/i), 'ACME')
    await user.click(screen.getByRole('button', { name: /add person/i }))
    await user.click(screen.getByRole('button', { name: /add person/i }))
    await user.click(screen.getByRole('button', { name: /add product/i }))
    await user.click(screen.getByRole('button', { name: /add product/i }))
    await user.click(screen.getByRole('button', { name: /add product/i }))

    const personNames = screen.getAllByLabelText(/person name/i)
    await user.type(personNames[0]!, 'Li Wei')
    await user.type(personNames[1]!, 'Zhang Min')

    const productNames = screen.getAllByLabelText(/product name/i)
    await user.type(productNames[0]!, 'Drill')
    await user.type(productNames[1]!, 'Saw')
    await user.type(productNames[2]!, 'Laser')

    await user.click(screen.getByRole('button', { name: /save vendor/i }))

    expect(saveVendorBundle).toHaveBeenCalledTimes(1)
    const [bundle] = saveVendorBundle.mock.calls[0] as [VendorBundleDraft]
    expect(bundle.contacts).toHaveLength(2)
    expect(bundle.products).toHaveLength(3)
  })

  it('saves the MOQ price breaks typed into a product', async () => {
    const user = userEvent.setup()
    render(<VendorForm mode="new" />)

    await user.type(screen.getByLabelText(/company name/i), 'ACME')
    await user.click(screen.getByRole('button', { name: /add product/i }))
    await user.type(screen.getByLabelText(/product name/i), 'Drill')
    await user.click(screen.getByRole('button', { name: /add break/i }))
    await user.type(screen.getByLabelText(/from quantity/i), '1000')
    await user.type(screen.getByLabelText(/^unit price$/i), '4.5')

    await user.click(screen.getByRole('button', { name: /save vendor/i }))

    const [bundle] = saveVendorBundle.mock.calls[0] as [VendorBundleDraft]
    expect(bundle.products[0]?.tiers).toEqual([{ minQty: 1000, unitPrice: 4.5 }])
  })

  it('keeps MOQ price breaks in the crash-recovery draft', async () => {
    const user = userEvent.setup()
    render(<VendorForm mode="new" />)

    await user.type(screen.getByLabelText(/company name/i), 'ACME')
    await user.click(screen.getByRole('button', { name: /add product/i }))
    await user.type(screen.getByLabelText(/product name/i), 'Drill')
    await user.click(screen.getByRole('button', { name: /add break/i }))
    await user.type(screen.getByLabelText(/from quantity/i), '1000')
    await user.type(screen.getByLabelText(/^unit price$/i), '4.5')

    await waitFor(
      () => {
        const record = saveDraft.mock.calls.at(-1)?.[0] as VendorBundleDraft | undefined
        expect(record?.products[0]?.tiers).toEqual([{ minQty: 1000, unitPrice: 4.5 }])
      },
      { timeout: 5000 },
    )
  })

  it('shows "Draft saved" in the form bar only once a draft is written', async () => {
    const user = userEvent.setup()
    render(<VendorForm mode="new" />)
    expect(screen.queryByText(/draft saved/i)).not.toBeInTheDocument()

    await user.type(screen.getByLabelText(/company name/i), 'ACME')

    expect(await screen.findByText(/draft saved/i, {}, { timeout: 3000 })).toBeInTheDocument()
    expect(saveDraft).toHaveBeenCalled()
  })

  it('gives every text input an accessible name', () => {
    render(<VendorForm mode="new" />)
    for (const input of screen.getAllByRole('textbox')) {
      expect(input).toHaveAccessibleName()
    }
  })
})
