import { db } from '../db/schema'
import type {
  Attachment,
  AttachmentKind,
  Contact,
  ContactInput,
  ProcessedImage,
  Product,
  ProductInput,
  Vendor,
  VendorInput,
} from '../db/models'
import { requireText } from './guards'

export interface BundlePhotoInput {
  key: string
  kind: AttachmentKind
  image: ProcessedImage
}

export interface BundleContactInput extends ContactInput {
  key: string
  cardPhotoKey?: string
}

export interface BundleProductInput extends ProductInput {
  key: string
  photoKeys?: string[]
}

export interface VendorBundleDraft {
  vendor: VendorInput
  contacts: BundleContactInput[]
  products: BundleProductInput[]
  photos: BundlePhotoInput[]
}

export interface VendorBundle {
  vendor: Vendor
  contacts: Contact[]
  products: Product[]
  attachments: Attachment[]
}

/**
 * Writes a vendor and its children in a single transaction. All ids and blob
 * references are resolved synchronously before the write, so nothing non-Dexie
 * is awaited inside the transaction (which would auto-commit it).
 */
export async function saveVendorBundle(
  draft: VendorBundleDraft,
  existingVendorId?: string,
): Promise<string> {
  const vendorId = existingVendorId ?? crypto.randomUUID()
  const now = Date.now()

  const attachmentIdByKey = new Map<string, string>()
  const attachments: Attachment[] = draft.photos.map((photo) => {
    const id = crypto.randomUUID()
    attachmentIdByKey.set(photo.key, id)
    return {
      id,
      vendorId,
      kind: photo.kind,
      blob: photo.image.blob,
      thumb: photo.image.thumb,
      width: photo.image.width,
      height: photo.image.height,
      bytes: photo.image.bytes,
      createdAt: now,
    }
  })

  const contacts: Contact[] = draft.contacts.map((contact) => ({
    id: crypto.randomUUID(),
    vendorId,
    name: requireText(contact.name, 'Contact name'),
    position: contact.position,
    phone: contact.phone,
    email: contact.email,
    wechat: contact.wechat,
    whatsapp: contact.whatsapp,
    isPrimary: contact.isPrimary ?? false,
    cardAttachmentId: contact.cardPhotoKey
      ? attachmentIdByKey.get(contact.cardPhotoKey)
      : undefined,
  }))

  const products: Product[] = draft.products.map((product) => ({
    id: crypto.randomUUID(),
    vendorId,
    name: requireText(product.name, 'Product name'),
    description: product.description,
    unit: product.unit,
    currency: product.currency ?? 'USD',
    price: product.price,
    moq: product.moq,
    tiers: product.tiers ?? [],
    leadTimeDays: product.leadTimeDays,
    paymentTerms: product.paymentTerms,
    photoAttachmentIds: (product.photoKeys ?? [])
      .map((key) => attachmentIdByKey.get(key))
      .filter((id): id is string => id !== undefined),
    createdAt: now,
  }))

  const vendor: Vendor = {
    id: vendorId,
    name: requireText(draft.vendor.name, 'Vendor name'),
    type: draft.vendor.type ?? 'other',
    status: draft.vendor.status ?? 'lead',
    rating: draft.vendor.rating ?? 3,
    country: draft.vendor.country,
    city: draft.vendor.city,
    address: draft.vendor.address,
    website: draft.vendor.website,
    description: draft.vendor.description,
    socials: draft.vendor.socials ?? [],
    tags: draft.vendor.tags ?? [],
    fair: draft.vendor.fair ?? {},
    createdAt: now,
    updatedAt: now,
  }

  await db.transaction('rw', [db.vendors, db.contacts, db.products, db.attachments], async () => {
    if (existingVendorId) {
      const existing = await db.vendors.get(existingVendorId)
      if (existing) vendor.createdAt = existing.createdAt
      // ponytail: replace-children strategy — revisit if children gain refs.
      await db.contacts.where('vendorId').equals(vendorId).delete()
      await db.products.where('vendorId').equals(vendorId).delete()
      await db.attachments.where('vendorId').equals(vendorId).delete()
    }
    await db.vendors.put(vendor)
    if (contacts.length > 0) await db.contacts.bulkPut(contacts)
    if (products.length > 0) await db.products.bulkPut(products)
    if (attachments.length > 0) await db.attachments.bulkPut(attachments)
  })

  return vendorId
}

export async function getVendorBundle(id: string): Promise<VendorBundle | undefined> {
  const [vendor, contacts, products, attachments] = await Promise.all([
    db.vendors.get(id),
    db.contacts.where('vendorId').equals(id).toArray(),
    db.products.where('vendorId').equals(id).toArray(),
    db.attachments.where('vendorId').equals(id).toArray(),
  ])
  if (!vendor) return undefined
  return { vendor, contacts, products, attachments }
}
