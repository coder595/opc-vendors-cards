// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/db/schema'
import { getVendorBundle, saveVendorBundle, type VendorBundleDraft } from '../../src/data/bundle'
import { resetDb } from './helpers/db'

function image() {
  return {
    blob: new Blob(['full'], { type: 'image/jpeg' }),
    thumb: new Blob(['thumb'], { type: 'image/jpeg' }),
    width: 1600,
    height: 1200,
    bytes: 4,
  }
}

function draft(): VendorBundleDraft {
  return {
    vendor: { name: 'ACME', type: 'factory' },
    contacts: [
      { key: 'c1', name: 'Li Wei', isPrimary: true, cardPhotoKey: 'ph1' },
      { key: 'c2', name: 'Zhang Min' },
    ],
    products: [
      { key: 'p1', name: 'Drill', currency: 'CNY', price: 12.5, photoKeys: ['ph2'] },
      { key: 'p2', name: 'Saw' },
      { key: 'p3', name: 'Laser' },
    ],
    photos: [
      { key: 'ph1', kind: 'business_card', image: image() },
      { key: 'ph2', kind: 'product', image: image() },
      { key: 'ph3', kind: 'booth', image: image() },
      { key: 'ph4', kind: 'other', image: image() },
    ],
  }
}

describe('saveVendorBundle', () => {
  beforeEach(resetDb)
  afterEach(resetDb)

  it('writes the vendor, children and photos with resolved references', async () => {
    const vendorId = await saveVendorBundle(draft())
    const bundle = await getVendorBundle(vendorId)

    expect(bundle?.vendor.name).toBe('ACME')
    expect(bundle?.contacts).toHaveLength(2)
    expect(bundle?.products).toHaveLength(3)
    expect(bundle?.attachments).toHaveLength(4)
    expect(bundle?.contacts.every((contact) => contact.vendorId === vendorId)).toBe(true)

    const primary = bundle?.contacts.find((contact) => contact.isPrimary)
    const card = bundle?.attachments.find((item) => item.id === primary?.cardAttachmentId)
    expect(card?.kind).toBe('business_card')

    const drill = bundle?.products.find((item) => item.name === 'Drill')
    const productPhoto = bundle?.attachments.find(
      (item) => item.id === drill?.photoAttachmentIds[0],
    )
    expect(productPhoto?.kind).toBe('product')
  })

  it('replaces children on edit without touching other vendors', async () => {
    const keepId = await saveVendorBundle({ ...draft(), vendor: { name: 'Keep' } })
    const editId = await saveVendorBundle(draft())

    await saveVendorBundle(
      { vendor: { name: 'ACME v2' }, contacts: [], products: [], photos: [] },
      editId,
    )

    const edited = await getVendorBundle(editId)
    expect(edited?.vendor.name).toBe('ACME v2')
    expect(edited?.contacts).toHaveLength(0)
    expect(edited?.attachments).toHaveLength(0)
    expect((await getVendorBundle(keepId))?.contacts).toHaveLength(2)
  })

  it('rolls back the whole transaction when a write fails', async () => {
    const spy = vi.spyOn(db.products, 'bulkPut').mockRejectedValueOnce(new Error('boom'))
    await expect(saveVendorBundle(draft())).rejects.toThrow('boom')
    spy.mockRestore()

    expect(await db.vendors.count()).toBe(0)
    expect(await db.contacts.count()).toBe(0)
    expect(await db.attachments.count()).toBe(0)
  })

  it('A1 keeps child ids stable across a no-op re-save', async () => {
    const vendorId = await saveVendorBundle(draft())
    const before = await getVendorBundle(vendorId)
    const contactIdsBefore = before!.contacts.map((c) => c.id).sort()
    const productIdsBefore = before!.products.map((p) => p.id).sort()
    const attachmentIdsBefore = before!.attachments.map((a) => a.id).sort()

    const reDraft = draft()
    reDraft.contacts = reDraft.contacts.map((c, i) => ({
      ...c,
      id: before!.contacts[i]?.id,
    }))
    reDraft.products = reDraft.products.map((p, i) => ({
      ...p,
      id: before!.products[i]?.id,
    }))
    reDraft.photos = reDraft.photos.map((ph, i) => ({
      ...ph,
      key: before!.attachments[i]?.id ?? ph.key,
    }))
    await saveVendorBundle(reDraft, vendorId)

    const after = await getVendorBundle(vendorId)
    const contactIdsAfter = after!.contacts.map((c) => c.id).sort()
    const productIdsAfter = after!.products.map((p) => p.id).sort()
    const attachmentIdsAfter = after!.attachments.map((a) => a.id).sort()

    expect(contactIdsAfter).toEqual(contactIdsBefore)
    expect(productIdsAfter).toEqual(productIdsBefore)
    expect(attachmentIdsAfter).toEqual(attachmentIdsBefore)
  })
})
