import type { ExportData, ExportEnvelope, Vendor } from '../../../src/db/models'

export function makeVendor(overrides: Partial<Vendor> & { name: string }): Vendor {
  return {
    id: crypto.randomUUID(),
    type: 'supplier',
    status: 'lead',
    rating: 3,
    socials: [],
    tags: [],
    fair: {},
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

export function makeEnvelope(
  vendors: Vendor[] = [],
  data: Partial<ExportData> = {},
): ExportEnvelope {
  return {
    schemaVersion: 2,
    exportedAt: new Date(0).toISOString(),
    app: { id: 'opc-vendors-cards', version: 'test' },
    data: {
      vendors,
      contacts: [],
      products: [],
      notes: [],
      certs: [],
      attachments: [],
      settings: null,
      ...data,
    },
  }
}
