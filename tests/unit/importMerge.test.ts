// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact } from '../../src/db/models'
import { db } from '../../src/db/schema'
import { addContact } from '../../src/data/contacts'
import { createVendor } from '../../src/data/vendors'
import { importData } from '../../src/lib/exportImport'
import { makeEnvelope, makeVendor } from './helpers/fixtures'
import { resetDb } from './helpers/db'

function makeContact(overrides: Partial<Contact> & { vendorId: string; name: string }): Contact {
  return { id: crypto.randomUUID(), isPrimary: false, ...overrides, updatedAt: overrides.updatedAt ?? Date.now() }
}

describe('merge import', () => {
  beforeEach(resetDb)
  afterEach(resetDb)

  it('matches a duplicate by normalized name + website and inserts no new vendor', async () => {
    await createVendor({ name: 'Acme Tools Co.', website: 'https://www.Acme.com/' })
    const duplicate = makeVendor({
      id: 'imported-1',
      name: '  acme  tools co. ',
      website: 'acme.com',
    })

    const summary = await importData(makeEnvelope([duplicate]), 'merge')

    expect(summary.matchedVendors).toBe(1)
    expect(summary.insertedVendors).toBe(0)
    expect(await db.vendors.count()).toBe(1)
  })

  it('reparents imported children onto the surviving vendor', async () => {
    const existingId = await createVendor({
      name: 'Acme Tools Co.',
      website: 'https://www.acme.com',
    })
    const duplicate = makeVendor({ id: 'imported-1', name: 'Acme Tools Co.', website: 'acme.com' })
    const contact = makeContact({ vendorId: 'imported-1', name: 'Li Wei', isPrimary: true })

    const summary = await importData(makeEnvelope([duplicate], { contacts: [contact] }), 'merge')

    expect(summary.matchedVendors).toBe(1)
    expect(summary.insertedChildren).toBe(1)
    const contacts = await db.contacts.toArray()
    expect(contacts).toHaveLength(1)
    expect(contacts[0]?.vendorId).toBe(existingId)
  })

  it('matches by identical id', async () => {
    const id = await createVendor({ name: 'ACME' })
    const sameId = makeVendor({ id, name: 'ACME Renamed' })

    const summary = await importData(makeEnvelope([sameId]), 'merge')

    expect(summary.matchedVendors).toBe(1)
    expect(await db.vendors.count()).toBe(1)
  })

  it('updates fields when the policy is imported-wins', async () => {
    const id = await createVendor({ name: 'ACME', city: 'Guangzhou' })
    const imported = makeVendor({ id, name: 'ACME', city: 'Shenzhen' })

    await importData(makeEnvelope([imported]), 'merge', { policy: 'imported-wins' })

    expect((await db.vendors.get(id))?.city).toBe('Shenzhen')
  })

  it('keeps the existing vendor by default', async () => {
    const id = await createVendor({ name: 'ACME', city: 'Guangzhou' })
    const imported = makeVendor({ id, name: 'ACME', city: 'Shenzhen' })

    await importData(makeEnvelope([imported]), 'merge')

    expect((await db.vendors.get(id))?.city).toBe('Guangzhou')
  })

  it('replace wipes the trip data and reproduces the payload', async () => {
    await createVendor({ name: 'Old Vendor' })
    const incoming = makeVendor({ id: 'new-1', name: 'New Vendor' })

    const summary = await importData(makeEnvelope([incoming]), 'replace')

    expect(summary.insertedVendors).toBe(1)
    const vendors = await db.vendors.toArray()
    expect(vendors).toHaveLength(1)
    expect(vendors[0]?.name).toBe('New Vendor')
  })

  it('leaves the database unchanged when a write fails mid-transaction', async () => {
    const id = await createVendor({ name: 'Keep Me' })
    const incoming = makeVendor({ id: 'new-1', name: 'New Vendor' })

    const spy = vi.spyOn(db.vendors, 'bulkPut').mockRejectedValueOnce(new Error('boom'))
    await expect(importData(makeEnvelope([incoming]), 'replace')).rejects.toThrow('boom')
    spy.mockRestore()

    const vendors = await db.vendors.toArray()
    expect(vendors).toHaveLength(1)
    expect(vendors[0]?.id).toBe(id)
  })

  it('dedupes two duplicate vendors inside a single import file', async () => {
    const first = makeVendor({ id: 'a1', name: 'Acme Tools', website: 'acme.com' })
    const second = makeVendor({ id: 'b1', name: 'acme  tools', website: 'https://www.acme.com/' })

    const summary = await importData(makeEnvelope([first, second]), 'merge')

    expect(summary.insertedVendors).toBe(1)
    expect(summary.matchedVendors).toBe(1)
    expect(await db.vendors.count()).toBe(1)
  })

  it('rejects orphan children whose vendor is not present', async () => {
    const orphan = makeContact({ vendorId: 'missing', name: 'Ghost' })

    const summary = await importData(makeEnvelope([], { contacts: [orphan] }), 'merge')

    expect(summary.insertedChildren).toBe(0)
    expect(summary.rejected.some((item) => item.table === 'contacts')).toBe(true)
  })

  it('imports settings on merge only when opted in', async () => {
    const settings = {
      id: 'app' as const,
      baseCurrency: 'CNY',
      rates: { CNY: 7.2 },
      theme: 'dark' as const,
    }

    await importData(makeEnvelope([], { settings }), 'merge', { importSettings: true })

    expect((await db.settings.get('app'))?.baseCurrency).toBe('CNY')
    expect((await db.settings.get('app'))?.theme).toBe('dark')
  })

  it('does not merge onto a soft-deleted vendor', async () => {
    const id = await createVendor({ name: 'Acme Tools', website: 'acme.com' })
    await db.vendors.update(id, { deletedAt: 123 })
    const incoming = makeVendor({ id: 'fresh', name: 'Acme Tools', website: 'acme.com' })

    const summary = await importData(makeEnvelope([incoming]), 'merge')

    expect(summary.insertedVendors).toBe(1)
    expect(await db.vendors.count()).toBe(2)
  })

  it('skips an existing child by id under the default policy', async () => {
    const vendorId = await createVendor({ name: 'ACME' })
    const contactId = await addContact(vendorId, { name: 'Existing' })
    const imported = { id: contactId, vendorId, name: 'Imported', isPrimary: true, updatedAt: 1 }

    const summary = await importData(makeEnvelope([], { contacts: [imported] }), 'merge')

    expect(summary.skippedChildren).toBe(1)
    expect((await db.contacts.get(contactId))?.name).toBe('Existing')
  })

  it('preserves the existing createdAt under imported-wins', async () => {
    const id = await createVendor({ name: 'ACME' })
    const original = await db.vendors.get(id)
    const imported = makeVendor({ id, name: 'ACME', createdAt: 999, updatedAt: 999 })

    await importData(makeEnvelope([imported]), 'merge', { policy: 'imported-wins' })

    expect((await db.vendors.get(id))?.createdAt).toBe(original?.createdAt)
  })

  it('rejects orphan children in replace mode too', async () => {
    const orphan = makeContact({ vendorId: 'missing', name: 'Ghost' })

    const summary = await importData(makeEnvelope([], { contacts: [orphan] }), 'replace')

    expect(summary.insertedChildren).toBe(0)
    expect(summary.rejected.some((item) => item.table === 'contacts')).toBe(true)
    expect(await db.contacts.count()).toBe(0)
  })
it('A1: stable child ids prevent duplicates on re-import', async () => {
    await importData(makeEnvelope([makeVendor({ id: 'v1', name: 'ACME', updatedAt: 100 })], {
      contacts: [makeContact({ id: 'c1', vendorId: 'v1', name: 'Li Wei' })],
      products: [{ id: 'p1', vendorId: 'v1', name: 'Drill', currency: 'USD', tiers: [], photoAttachmentIds: [], createdAt: 1, updatedAt: 1 }],
    }), 'merge')

    await importData(makeEnvelope([makeVendor({ id: 'v1', name: 'ACME', updatedAt: 200 })], {
      contacts: [makeContact({ id: 'c1', vendorId: 'v1', name: 'Li Wei' })],
      products: [{ id: 'p1', vendorId: 'v1', name: 'Drill', currency: 'USD', tiers: [], photoAttachmentIds: [], createdAt: 1, updatedAt: 1 }],
    }), 'merge')

    const contacts = await db.contacts.toArray()
    const products = await db.products.toArray()
    expect(contacts).toHaveLength(1)
    expect(products).toHaveLength(1)
  })

  it('A2: a newer imported vendor with ordered status wins under newest-wins', async () => {
    await db.vendors.add(makeVendor({ id: 'v1', name: 'ACME', status: 'lead', updatedAt: 100 }))

    const imported = makeVendor({ id: 'v1', name: 'ACME', status: 'ordered', updatedAt: 200 })

    await importData(makeEnvelope([imported]), 'merge', { policy: 'newest-wins' })

    expect((await db.vendors.get('v1'))?.status).toBe('ordered')
  })

  it('A2: an older imported vendor loses under newest-wins', async () => {
    await db.vendors.add(makeVendor({ id: 'v1', name: 'ACME', status: 'ordered', updatedAt: 200 }))

    const imported = makeVendor({ id: 'v1', name: 'ACME', status: 'lead', updatedAt: 100 })

    await importData(makeEnvelope([imported]), 'merge', { policy: 'newest-wins' })

    expect((await db.vendors.get('v1'))?.status).toBe('ordered')
  })
})
