import { db } from '../db/schema'
import type { Contact, ContactInput } from '../db/models'
import { definedPatch, requireText } from './guards'

export async function addContact(vendorId: string, input: ContactInput): Promise<string> {
  const contact: Contact = {
    id: crypto.randomUUID(),
    vendorId,
    name: requireText(input.name, 'Contact name'),
    position: input.position,
    phone: input.phone,
    email: input.email,
    wechat: input.wechat,
    whatsapp: input.whatsapp,
    isPrimary: input.isPrimary ?? false,
    cardAttachmentId: input.cardAttachmentId,
  }
  await db.contacts.add(contact)
  return contact.id
}

export async function updateContact(id: string, patch: Partial<ContactInput>): Promise<void> {
  const existing = await db.contacts.get(id)
  if (!existing) throw new Error(`Contact ${id} not found`)
  const safe = definedPatch(patch)
  if (safe.name !== undefined) requireText(safe.name, 'Contact name')
  await db.contacts.put({ ...existing, ...safe, id, vendorId: existing.vendorId })
}

export async function deleteContact(id: string): Promise<void> {
  await db.contacts.delete(id)
}
