// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../src/db/schema'
import { addAttachment } from '../../src/data/attachments'
import { addCert } from '../../src/data/certs'
import { addContact } from '../../src/data/contacts'
import { addNote } from '../../src/data/notes'
import { addProduct } from '../../src/data/products'
import { updateSettings } from '../../src/data/settings'
import { createVendor } from '../../src/data/vendors'
import {
  buildExportBlob,
  exportFilename,
  importData,
  isGzip,
  parseImport,
  serializeDb,
} from '../../src/lib/exportImport'
import { resetDb } from './helpers/db'

describe('export / import round-trip', () => {
  beforeEach(resetDb)
  afterEach(resetDb)

  it('reproduces every record, relation and photo', async () => {
    const vendorId = await createVendor({
      name: 'ACME Tools',
      type: 'factory',
      country: 'CN',
      website: 'https://acme.example',
      tags: ['tools', 'metal'],
      socials: [{ platform: 'wechat', value: 'acme_wx' }],
      fair: { edition: '140th Canton Fair', hall: 'A', booth: '12' },
    })
    await addContact(vendorId, { name: 'Li Wei', isPrimary: true, email: 'li@acme.example' })
    const attachmentId = await addAttachment(vendorId, {
      kind: 'product',
      blob: new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'image/jpeg' }),
      thumb: new Blob([new Uint8Array([9, 9])], { type: 'image/jpeg' }),
      width: 10,
      height: 10,
      bytes: 5,
    })
    const productId = await addProduct(vendorId, {
      name: 'Drill',
      currency: 'CNY',
      price: 12.5,
      tiers: [{ minQty: 10, unitPrice: 11 }],
      photoAttachmentIds: [attachmentId],
    })
    await addNote(vendorId, { text: 'Call back', isTask: true, dueDate: 123 })
    await addCert(vendorId, { name: 'CE', number: 'X1' })
    await updateSettings({ baseCurrency: 'CNY', rates: { CNY: 7.2 } })

    const envelope = await serializeDb()
    expect(envelope.schemaVersion).toBe(1)
    expect(envelope.data.vendors).toHaveLength(1)

    const exportBlob = await buildExportBlob(envelope)
    const buffer = await exportBlob.arrayBuffer()
    expect(isGzip(buffer)).toBe(true)

    const parsed = await parseImport(buffer)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    await resetDb()
    const summary = await importData(parsed.envelope, 'replace', { importSettings: true })
    expect(summary.insertedVendors).toBe(1)
    expect(summary.importedAttachments).toBe(1)

    const vendors = await db.vendors.toArray()
    expect(vendors).toHaveLength(1)
    expect(vendors[0]?.name).toBe('ACME Tools')
    expect(vendors[0]?.country).toBe('CN')
    expect(vendors[0]?.tags).toEqual(['tools', 'metal'])
    expect(vendors[0]?.socials).toEqual([{ platform: 'wechat', value: 'acme_wx' }])
    expect(vendors[0]?.fair).toEqual({ edition: '140th Canton Fair', hall: 'A', booth: '12' })

    const contacts = await db.contacts.where('vendorId').equals(vendorId).toArray()
    expect(contacts).toHaveLength(1)
    expect(contacts[0]?.email).toBe('li@acme.example')

    const products = await db.products.where('vendorId').equals(vendorId).toArray()
    expect(products).toHaveLength(1)
    expect(products[0]?.id).toBe(productId)
    expect(products[0]?.currency).toBe('CNY')
    expect(products[0]?.price).toBe(12.5)
    expect(products[0]?.tiers).toEqual([{ minQty: 10, unitPrice: 11 }])
    expect(products[0]?.photoAttachmentIds).toEqual([attachmentId])

    const notes = await db.notes.where('vendorId').equals(vendorId).toArray()
    expect(notes).toHaveLength(1)
    expect(notes[0]?.text).toBe('Call back')
    expect(notes[0]?.isTask).toBe(true)
    expect(notes[0]?.dueDate).toBe(123)

    const certs = await db.certs.where('vendorId').equals(vendorId).toArray()
    expect(certs).toHaveLength(1)
    expect(certs[0]?.number).toBe('X1')

    const attachments = await db.attachments.where('vendorId').equals(vendorId).toArray()
    expect(attachments).toHaveLength(1)
    expect(attachments[0]?.id).toBe(attachmentId)
    expect(attachments[0]?.blob.type).toBe('image/jpeg')
    const bytes = new Uint8Array(await attachments[0]!.blob.arrayBuffer())
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4, 5])

    const settings = await db.settings.get('app')
    expect(settings?.baseCurrency).toBe('CNY')
    expect(settings?.rates).toEqual({ CNY: 7.2 })
  })

  it('imports plain (uncompressed) JSON as well as gzip', async () => {
    const vendorId = await createVendor({ name: 'Plain Co' })
    const envelope = await serializeDb()
    const text = JSON.stringify(envelope)

    const parsed = await parseImport(new TextEncoder().encode(text).buffer)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    await resetDb()
    await importData(parsed.envelope, 'merge')
    expect((await db.vendors.get(vendorId))?.name).toBe('Plain Co')
  })

  it('rejects a file that is not JSON', async () => {
    const parsed = await parseImport(new TextEncoder().encode('not json at all').buffer)
    expect(parsed).toMatchObject({ ok: false, error: { code: 'bad_json' } })
  })

  it('returns a bad_gzip result for corrupt gzip data instead of throwing', async () => {
    const corrupt = new Uint8Array([
      0x1f, 0x8b, 0x08, 0x00, 0xff, 0xff, 0xff, 0xff, 0x00, 0x01, 0x02,
    ])
    const parsed = await parseImport(corrupt.buffer)
    expect(parsed).toMatchObject({ ok: false, error: { code: 'bad_gzip' } })
  })

  it('round-trips a typeless attachment as application/octet-stream', async () => {
    const vendorId = await createVendor({ name: 'Typeless Co' })
    await addAttachment(vendorId, {
      kind: 'other',
      blob: new Blob([new Uint8Array([7, 7, 7])]),
      thumb: new Blob([new Uint8Array([8])]),
      width: 1,
      height: 1,
      bytes: 3,
    })

    const envelope = await serializeDb()
    expect(envelope.data.attachments[0]?.mime).toBe('application/octet-stream')

    const parsed = await parseImport(await (await buildExportBlob(envelope)).arrayBuffer())
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.envelope.data.attachments).toHaveLength(1)
  })

  it('uses a local date for the export filename', () => {
    expect(exportFilename(new Date(2026, 9, 5))).toBe('opc-vendors-2026-10-05.ocv.json.gz')
  })
})
