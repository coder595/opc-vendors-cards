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
  id?: string
  cardPhotoKey?: string
}

export interface BundleProductInput extends ProductInput {
  key: string
  id?: string
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
  let existingAttachmentCount = 0
  if (existingVendorId) {
    const existingAttachments = await db.attachments.where('vendorId').equals(vendorId).toArray()
    existingAttachmentCount = existingAttachments.length
    for (const a of existingAttachments) {
      attachmentIdByKey.set(a.id, a.id)
    }
  }
  for (const photo of draft.photos) {
    if (!attachmentIdByKey.has(photo.key)) {
      attachmentIdByKey.set(photo.key, crypto.randomUUID())
    }
  }

  const attachments: Attachment[] = draft.photos.map((photo) => {
    const id = attachmentIdByKey.get(photo.key)!
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
      updatedAt: now,
    }
  })

  const contacts: Contact[] = draft.contacts.map((contact) => ({
    id: contact.id ?? crypto.randomUUID(),
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
    updatedAt: now,
  }))

  const products: Product[] = draft.products.map((product) => ({
    id: product.id ?? crypto.randomUUID(),
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
    incoterm: product.incoterm,
    orderQty: product.orderQty,
    pcsPerCarton: product.pcsPerCarton,
    cartonLengthCm: product.cartonLengthCm,
    cartonWidthCm: product.cartonWidthCm,
    cartonHeightCm: product.cartonHeightCm,
    cartonGrossKg: product.cartonGrossKg,
    photoAttachmentIds: (product.photoKeys ?? [])
      .map((key) => attachmentIdByKey.get(key))
      .filter((id): id is string => id !== undefined),
    createdAt: now,
    updatedAt: now,
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
    revisit: draft.vendor.revisit,
    createdAt: now,
    updatedAt: now,
  }

  await db.transaction('rw', [db.vendors, db.contacts, db.products, db.attachments], async () => {
    if (existingVendorId) {
      const existing = await db.vendors.get(existingVendorId)
      if (existing) {
        vendor.createdAt = existing.createdAt
        vendor.updatedAt = now
      }

      const incomingContactIds = new Set(contacts.map((c) => c.id))
      const existingContactIds = new Set(
        (await db.contacts.where('vendorId').equals(vendorId).toArray()).map((c) => c.id),
      )
      const removedContactIds = [...existingContactIds].filter((id) => !incomingContactIds.has(id))
      if (removedContactIds.length > 0) await db.contacts.bulkDelete(removedContactIds)

      const incomingProductIds = new Set(products.map((p) => p.id))
      const existingProductIds = new Set(
        (await db.products.where('vendorId').equals(vendorId).toArray()).map((p) => p.id),
      )
      const removedProductIds = [...existingProductIds].filter((id) => !incomingProductIds.has(id))
      if (removedProductIds.length > 0) await db.products.bulkDelete(removedProductIds)
    }

    if (attachments.length > 0 && existingVendorId) {
      const keptIds = new Set(attachments.map((a) => a.id))
      const existingIds = new Set(
        (await db.attachments.where('vendorId').equals(vendorId).toArray()).map((a) => a.id),
      )
      const removedAttachmentIds = [...existingIds].filter((id) => !keptIds.has(id))
      if (removedAttachmentIds.length > 0) await db.attachments.bulkDelete(removedAttachmentIds)
    } else if (existingVendorId && attachments.length === 0 && existingAttachmentCount > 0) {
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
  if (!vendor || vendor.deletedAt !== undefined) return undefined
  return { vendor, contacts, products, attachments }
}
