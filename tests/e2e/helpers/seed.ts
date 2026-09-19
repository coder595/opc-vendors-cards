import type { Page } from '@playwright/test'

/** Writes a small, realistic dataset straight into the app's IndexedDB. */
export async function seed(page: Page) {
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('opc-vendors-cards')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const put = (store: string, record: unknown) =>
      new Promise<void>((resolve, reject) => {
        const tx = database.transaction(store, 'readwrite')
        tx.objectStore(store).put(record)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    const base = {
      type: 'factory',
      rating: 4,
      socials: [],
      tags: [],
      fair: {},
      createdAt: 1,
      updatedAt: 1,
    }
    await put('vendors', {
      ...base,
      id: 'v-cn',
      name: 'Guangzhou Lighting',
      status: 'quoted',
      country: 'China',
    })
    await put('vendors', {
      ...base,
      id: 'v-de',
      name: 'Berlin Metal',
      status: 'lead',
      country: 'Germany',
    })
    await put('contacts', { id: 'c1', vendorId: 'v-cn', name: 'Li Wei', isPrimary: true })
    await put('products', {
      id: 'p1',
      vendorId: 'v-cn',
      name: 'LED panel',
      currency: 'CNY',
      tiers: [],
      photoAttachmentIds: ['a1'],
      createdAt: 1,
    })
    await put('notes', {
      id: 'n1',
      vendorId: 'v-cn',
      text: 'Ask for samples',
      isTask: true,
      done: false,
      createdAt: 1,
    })
    await put('certs', { id: 'x1', vendorId: 'v-cn', name: 'CE' })
    const pngBytes = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQAY3Y2wAAAAAElFTkSuQmCC',
      ),
      (char) => char.charCodeAt(0),
    )
    const blob = new Blob([pngBytes], { type: 'image/png' })
    await put('attachments', {
      id: 'a1',
      vendorId: 'v-cn',
      kind: 'product',
      blob,
      thumb: blob,
      width: 1,
      height: 1,
      bytes: pngBytes.length,
      createdAt: 1,
    })
  })
}
