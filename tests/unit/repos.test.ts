// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../src/db/schema'
import { addAttachment, deleteAttachment } from '../../src/data/attachments'
import { addCert, deleteCert } from '../../src/data/certs'
import { addContact, deleteContact } from '../../src/data/contacts'
import { addNote, deleteNote } from '../../src/data/notes'
import { addProduct, deleteProduct } from '../../src/data/products'
import { DEFAULT_SETTINGS, getSettings, updateSettings } from '../../src/data/settings'
import { createVendor, deleteVendor, updateVendor } from '../../src/data/vendors'
import { resetDb } from './helpers/db'

describe('repositories', () => {
  beforeEach(resetDb)
  afterEach(resetDb)

  it('cascade-deletes all children but leaves other vendors intact', async () => {
    const keep = await createVendor({ name: 'Keep' })
    await addContact(keep, { name: 'A' })

    const doomed = await createVendor({ name: 'Doomed' })
    await addContact(doomed, { name: 'B' })
    await addProduct(doomed, { name: 'P' })
    await addNote(doomed, { text: 'N' })
    await addCert(doomed, { name: 'C' })
    await addAttachment(doomed, {
      kind: 'product',
      blob: new Blob(['x']),
      thumb: new Blob(['y']),
      width: 1,
      height: 1,
      bytes: 1,
    })

    await deleteVendor(doomed)

    expect(await db.vendors.get(doomed)).toBeUndefined()
    expect(await db.contacts.where('vendorId').equals(doomed).count()).toBe(0)
    expect(await db.products.where('vendorId').equals(doomed).count()).toBe(0)
    expect(await db.notes.where('vendorId').equals(doomed).count()).toBe(0)
    expect(await db.certs.where('vendorId').equals(doomed).count()).toBe(0)
    expect(await db.attachments.where('vendorId').equals(doomed).count()).toBe(0)
    expect(await db.contacts.where('vendorId').equals(keep).count()).toBe(1)
  })

  it('ignores undefined patch values instead of clobbering required fields', async () => {
    const id = await createVendor({ name: 'ACME', tags: ['x'] })
    await updateVendor(id, { city: 'Guangzhou', tags: undefined })
    const vendor = await db.vendors.get(id)
    expect(vendor?.tags).toEqual(['x'])
    expect(vendor?.city).toBe('Guangzhou')
  })

  it('rejects an empty vendor name at write time', async () => {
    await expect(createVendor({ name: '   ' })).rejects.toThrow()
  })

  it('does not alias the default settings rates object', async () => {
    const first = await getSettings()
    first.rates.CNY = 7.2
    const second = await getSettings()
    expect(second.rates).toEqual({})
    expect(DEFAULT_SETTINGS.rates).toEqual({})
  })

  it('rejects an invalid base currency', async () => {
    await expect(updateSettings({ baseCurrency: 'usd' })).rejects.toThrow()
  })

  it('rejects an unknown theme', async () => {
    await expect(updateSettings({ theme: 'neon' as never })).rejects.toThrow()
  })

  it('rejects invalid rates but stores valid ones', async () => {
    await expect(updateSettings({ rates: { CNY: 0 } })).rejects.toThrow()
    await expect(updateSettings({ rates: { cny: 7.2 } })).rejects.toThrow()
    await updateSettings({ rates: { CNY: 7.2 } })
    expect((await getSettings()).rates).toEqual({ CNY: 7.2 })
  })

  it('clears rates when the base currency changes without new rates', async () => {
    await updateSettings({ rates: { CNY: 7.2 } })
    await updateSettings({ baseCurrency: 'CNY' })
    expect((await getSettings()).rates).toEqual({})
  })

  it('throws when updating a missing vendor', async () => {
    await expect(updateVendor('missing', { name: 'X' })).rejects.toThrow()
  })

  it('removes child rows through the delete functions', async () => {
    const vendorId = await createVendor({ name: 'ACME' })
    const contactId = await addContact(vendorId, { name: 'A' })
    const productId = await addProduct(vendorId, { name: 'P' })
    const noteId = await addNote(vendorId, { text: 'N' })
    const certId = await addCert(vendorId, { name: 'C' })
    const attachmentId = await addAttachment(vendorId, {
      kind: 'other',
      blob: new Blob(['x']),
      thumb: new Blob(['y']),
      width: 1,
      height: 1,
      bytes: 1,
    })

    await deleteContact(contactId)
    await deleteProduct(productId)
    await deleteNote(noteId)
    await deleteCert(certId)
    await deleteAttachment(attachmentId)

    expect(await db.contacts.count()).toBe(0)
    expect(await db.products.count()).toBe(0)
    expect(await db.notes.count()).toBe(0)
    expect(await db.certs.count()).toBe(0)
    expect(await db.attachments.count()).toBe(0)
  })

  it('allows an empty note body', async () => {
    const vendorId = await createVendor({ name: 'ACME' })
    await expect(addNote(vendorId, { text: '' })).resolves.toBeTruthy()
  })
})
