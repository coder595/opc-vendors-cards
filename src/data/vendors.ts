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
    revisit: input.revisit,
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
