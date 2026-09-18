import Dexie, { type Table } from 'dexie'
import type { Attachment, Certification, Contact, Note, Product, Settings, Vendor } from './models'

/**
 * Payload schema version. Kept equal to the Dexie schema version on purpose —
 * `SCHEMA_VERSION === db.verno` is asserted in the unit tests.
 */
export const SCHEMA_VERSION = 1 as const

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
  }
}

export const db = new OpcDb()

export const TRIP_TABLES = [
  'vendors',
  'contacts',
  'products',
  'notes',
  'certs',
  'attachments',
] as const
