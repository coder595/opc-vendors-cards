import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const photoBuffer = readFileSync(path.join(process.cwd(), 'tests/e2e/fixtures/photo.jpg'))

async function waitForServiceWorker(page: Page) {
  await page.waitForFunction(async () => Boolean(await navigator.serviceWorker.ready))
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.reload()
  }
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
}

test('captures a vendor with 2 reps, 3 products and 4 photos offline', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await waitForServiceWorker(page)
  await context.setOffline(true)

  await page
    .getByRole('link', { name: /add vendor/i })
    .first()
    .click()
  await expect(page.getByRole('heading', { name: /new vendor/i })).toBeVisible()
  await page.getByLabel('Company name').fill('ACME Tools')

  await page.getByRole('button', { name: 'Add person' }).click()
  await page.getByRole('button', { name: 'Add person' }).click()
  const personNames = page.getByLabel('Person name')
  await personNames.nth(0).fill('Li Wei')
  await personNames.nth(1).fill('Zhang Min')

  await page.getByRole('button', { name: 'Add product' }).click()
  await page.getByRole('button', { name: 'Add product' }).click()
  await page.getByRole('button', { name: 'Add product' }).click()
  const productNames = page.getByLabel('Product name')
  await productNames.nth(0).fill('Drill')
  await productNames.nth(1).fill('Saw')
  await productNames.nth(2).fill('Laser')

  const photoInput = page.getByTestId('vendor-photo-input')
  await expect(photoInput).toHaveAttribute('capture', 'environment')
  const files = Array.from({ length: 4 }, (_, index) => ({
    name: `photo-${index}.jpg`,
    mimeType: 'image/jpeg',
    buffer: photoBuffer,
  }))
  await photoInput.setInputFiles(files)
  await expect(page.locator('.photo-thumb')).toHaveCount(4)

  await page.getByRole('button', { name: 'Save vendor' }).click()
  await expect(page.getByRole('heading', { name: 'Vendors' })).toBeVisible()
  await expect(page.getByRole('link', { name: /ACME Tools/ })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('link', { name: /ACME Tools/ })).toBeVisible()

  const stored = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('opc-vendors-cards')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const getAll = (store: string) =>
      new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const request = database.transaction(store, 'readonly').objectStore(store).getAll()
        request.onsuccess = () => resolve(request.result as Record<string, unknown>[])
        request.onerror = () => reject(request.error)
      })

    const contacts = await getAll('contacts')
    const products = await getAll('products')
    const attachments = await getAll('attachments')

    return {
      contactCount: contacts.length,
      productCount: products.length,
      attachments: attachments.map((attachment) => {
        const blob = attachment.blob as Blob
        const thumb = attachment.thumb as Blob
        return {
          kind: attachment.kind,
          width: attachment.width,
          height: attachment.height,
          bytes: attachment.bytes,
          blobType: blob instanceof Blob ? blob.type : null,
          blobSize: blob instanceof Blob ? blob.size : null,
          thumbSize: thumb instanceof Blob ? thumb.size : null,
        }
      }),
    }
  })

  expect(stored.contactCount).toBe(2)
  expect(stored.productCount).toBe(3)
  expect(stored.attachments).toHaveLength(4)

  for (const attachment of stored.attachments) {
    expect(attachment.kind).toBe('booth')
    expect(attachment.width).toBe(1600)
    expect(attachment.height).toBe(960)
    expect(attachment.blobType).toBe('image/jpeg')
    expect(attachment.blobSize).toBeGreaterThan(0)
    expect(attachment.bytes).toBe(attachment.blobSize)
    expect(attachment.thumbSize).toBeGreaterThan(0)
  }

  await context.setOffline(false)
})
