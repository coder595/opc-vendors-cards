import { db } from '../db/schema'
import type { Note, NoteInput } from '../db/models'
import { definedPatch, requireText } from './guards'

export async function addNote(vendorId: string, input: NoteInput): Promise<string> {
  const note: Note = {
    id: crypto.randomUUID(),
    vendorId,
    text: requireText(input.text, 'Note text', true),
    isTask: input.isTask ?? false,
    done: input.done ?? false,
    dueDate: input.dueDate,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  await db.transaction('rw', [db.notes, db.vendors], async () => {
    await db.notes.add(note)
    await db.vendors.update(vendorId, { updatedAt: Date.now() })
  })
  return note.id
}

export async function updateNote(id: string, patch: Partial<NoteInput>): Promise<void> {
  const safe = definedPatch(patch)
  if (safe.text !== undefined) requireText(safe.text, 'Note text', true)
  const note = await db.notes.get(id)
  if (!note) throw new Error(`Note ${id} not found`)
  await db.transaction('rw', [db.notes, db.vendors], async () => {
    const count = await db.notes.update(id, safe)
    if (count === 0) throw new Error(`Note ${id} not found`)
    await db.vendors.update(note.vendorId, { updatedAt: Date.now() })
  })
}

export async function deleteNote(id: string): Promise<void> {
  const note = await db.notes.get(id)
  if (!note) return
  await db.transaction('rw', [db.notes, db.vendors], async () => {
    await db.notes.delete(id)
    await db.vendors.update(note.vendorId, { updatedAt: Date.now() })
  })
}
