import Dexie, { type Table } from 'dexie'
import type { Attachment, Certification, Contact, Note, Product, Settings, Vendor } from './models'

/**
 * Payload schema version. Kept equal to the Dexie schema version on purpose —
 * `SCHEMA_VERSION === db.verno` is asserted in the unit tests.
 */
export const SCHEMA_VERSION = 2 as const

export class OpcDb extends Dexie {
  vendors!: Table<Vendor, string>
  contacts!: Table<Contact, string>
  products!: Table<Product, string>
  notes!: Table<Note, string>
  certs!: Table<Certification, string>
  attachments!: Table<Attachment, string>
  settings!: Table<Settings, string>

  constructor(name = 'opc-vendors-cards') {
    super(name)
    this.version(1).stores({
      vendors: 'id, name, status, country, *tags, updatedAt',
      contacts: 'id, vendorId',
      products: 'id, vendorId, name',
      notes: 'id, vendorId, done, dueDate',
      certs: 'id, vendorId, expiry',
      attachments: 'id, vendorId, kind',
      settings: 'id',
    })

    this.version(2).stores({
      vendors: 'id, name, status, country, *tags, updatedAt',
      contacts: 'id, vendorId',
      products: 'id, vendorId, name',
      notes: 'id, vendorId, done, dueDate',
      certs: 'id, vendorId, expiry',
      attachments: 'id, vendorId, kind',
      settings: 'id',
    }).upgrade(async (tx) => {
      const now = Date.now()
      await tx.table('contacts').toCollection().modify((contact: Record<string, unknown>) => {
        if (contact.updatedAt === undefined) contact.updatedAt = (contact.createdAt as number) || now
      })
      await tx.table('products').toCollection().modify((product: Record<string, unknown>) => {
        if (product.updatedAt === undefined) product.updatedAt = (product.createdAt as number) || now
      })
      await tx.table('notes').toCollection().modify((note: Record<string, unknown>) => {
        if (note.updatedAt === undefined) note.updatedAt = (note.createdAt as number) || now
      })
      await tx.table('certs').toCollection().modify((cert: Record<string, unknown>) => {
        if (cert.updatedAt === undefined) cert.updatedAt = (cert.createdAt as number) || now
      })
      await tx.table('attachments').toCollection().modify((att: Record<string, unknown>) => {
        if (att.updatedAt === undefined) att.updatedAt = (att.createdAt as number) || now
      })
    })
  }
}

export const db = new OpcDb()
