import { db } from '../db/schema'
import type { DraftRecord } from '../db/models'

export async function saveDraft(record: DraftRecord): Promise<void> {
  await db.drafts.put(record)
}

export async function loadDraft(id: string): Promise<DraftRecord | undefined> {
  return db.drafts.get(id)
}

export async function deleteDraft(id: string): Promise<void> {
  await db.drafts.delete(id)
}

export async function listDrafts(): Promise<DraftRecord[]> {
  return db.drafts.toArray()
}