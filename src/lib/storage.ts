/** Requests durable storage once, ignoring unsupported/failed browsers. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
