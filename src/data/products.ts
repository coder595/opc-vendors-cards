import { db } from '../db/schema'
import type { Product, ProductInput } from '../db/models'
import { definedPatch, requireText } from './guards'

export async function addProduct(vendorId: string, input: ProductInput): Promise<string> {
  const product: Product = {
    id: crypto.randomUUID(),
    vendorId,
    name: requireText(input.name, 'Product name'),
    description: input.description,
    unit: input.unit,
    currency: input.currency ?? 'USD',
    price: input.price,
    moq: input.moq,
    tiers: input.tiers ?? [],
    leadTimeDays: input.leadTimeDays,
    paymentTerms: input.paymentTerms,
    photoAttachmentIds: input.photoAttachmentIds ?? [],
    createdAt: Date.now(),
  }
  await db.products.add(product)
  return product.id
}

export async function updateProduct(id: string, patch: Partial<ProductInput>): Promise<void> {
  const existing = await db.products.get(id)
  if (!existing) throw new Error(`Product ${id} not found`)
  const safe = definedPatch(patch)
  if (safe.name !== undefined) requireText(safe.name, 'Product name')
  await db.products.put({ ...existing, ...safe, id, vendorId: existing.vendorId })
}

export async function deleteProduct(id: string): Promise<void> {
  await db.products.delete(id)
}
