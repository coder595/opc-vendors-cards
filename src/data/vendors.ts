import { db } from '../db/schema'
import type { Vendor, VendorInput } from '../db/models'
import { definedPatch, requireText } from './guards'

export async function createVendor(input: VendorInput): Promise<string> {
  const now = Date.now()
  const vendor: Vendor = {
    id: crypto.randomUUID(),
    name: requireText(input.name, 'Vendor name'),
    type: input.type ?? 'other',
    status: input.status ?? 'lead',
    rating: input.rating ?? 3,
    country: input.country,
    city: input.city,
    address: input.address,
    website: input.website,
    description: input.description,
    socials: input.socials ?? [],
    tags: input.tags ?? [],
    fair: input.fair ?? {},
    createdAt: now,
    updatedAt: now,
  }
  await db.vendors.add(vendor)
  return vendor.id
}

export async function updateVendor(id: string, patch: Partial<VendorInput>): Promise<void> {
  const safe = definedPatch(patch)
  if (safe.name !== undefined) requireText(safe.name, 'Vendor name')
  const count = await db.vendors.update(id, { ...safe, updatedAt: Date.now() })
  if (count === 0) throw new Error(`Vendor ${id} not found`)
}

export async function getVendor(id: string): Promise<Vendor | undefined> {
  return db.vendors.get(id)
}

export async function softDeleteVendor(id: string): Promise<void> {
  const now = Date.now()
  await db.vendors.update(id, { deletedAt: now, updatedAt: now })
}

export async function restoreVendor(id: string): Promise<void> {
  await db.vendors.update(id, { deletedAt: undefined, updatedAt: Date.now() })
}

export async function getDeletedVendors(): Promise<Vendor[]> {
  return db.vendors
    .filter((vendor) => vendor.deletedAt !== undefined)
    .reverse()
    .sortBy('deletedAt')
}

export async function purgeTombstonesOlderThan(ageMs: number): Promise<void> {
  const cutoff = Date.now() - ageMs
  const tombstones = await db.vendors
    .filter((vendor) => vendor.deletedAt !== undefined && vendor.deletedAt < cutoff)
    .toArray()

  if (tombstones.length === 0) return

  const ids = tombstones.map((v) => v.id)
  await db.transaction(
    'rw',
    [db.vendors, db.contacts, db.products, db.notes, db.certs, db.attachments],
    async () => {
      await Promise.all([
        db.contacts.where('vendorId').anyOf(ids).delete(),
        db.products.where('vendorId').anyOf(ids).delete(),
        db.notes.where('vendorId').anyOf(ids).delete(),
        db.certs.where('vendorId').anyOf(ids).delete(),
        db.attachments.where('vendorId').anyOf(ids).delete(),
      ])
      await db.vendors.bulkDelete(ids)
    },
  )
}

export async function touchVendor(vendorId: string): Promise<void> {
  await db.vendors.update(vendorId, { updatedAt: Date.now() })
}

/** Deletes a vendor and every child row referencing it, in one transaction. */
export async function deleteVendor(id: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.vendors, db.contacts, db.products, db.notes, db.certs, db.attachments],
    async () => {
      await Promise.all([
        db.contacts.where('vendorId').equals(id).delete(),
        db.products.where('vendorId').equals(id).delete(),
        db.notes.where('vendorId').equals(id).delete(),
        db.certs.where('vendorId').equals(id).delete(),
        db.attachments.where('vendorId').equals(id).delete(),
      ])
      await db.vendors.delete(id)
    },
  )
}
