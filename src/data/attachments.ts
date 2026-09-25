import { db } from '../db/schema'
import type { Attachment, NewAttachment } from '../db/models'

export async function addAttachment(vendorId: string, input: NewAttachment): Promise<string> {
  const attachment: Attachment = {
    id: crypto.randomUUID(),
    vendorId,
    kind: input.kind,
    blob: input.blob,
    thumb: input.thumb,
    width: input.width,
    height: input.height,
    bytes: input.bytes,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  await db.attachments.add(attachment)
  return attachment.id
}

export async function deleteAttachment(id: string): Promise<void> {
  await db.attachments.delete(id)
}
