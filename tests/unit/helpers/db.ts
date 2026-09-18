import { db } from '../../../src/db/schema'

/** Drops and reopens the singleton database so each test starts clean. */
export async function resetDb(): Promise<void> {
  await db.delete()
  await db.open()
}
