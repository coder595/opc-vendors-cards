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
  await db.notes.add(note)
  return note.id
}

export async function updateNote(id: string, patch: Partial<NoteInput>): Promise<void> {
  const safe = definedPatch(patch)
  if (safe.text !== undefined) requireText(safe.text, 'Note text', true)
  const count = await db.notes.update(id, safe)
  if (count === 0) throw new Error(`Note ${id} not found`)
}

export async function deleteNote(id: string): Promise<void> {
  await db.notes.delete(id)
}
