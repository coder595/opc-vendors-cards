import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

const photoBuffer = readFileSync(path.join(process.cwd(), 'tests/e2e/fixtures/photo.jpg'))

test('exports on one device and imports on another with photos intact', async ({
  page,
  browser,
}) => {
  await page.goto('/')
  await page
    .getByRole('link', { name: /add vendor/i })
    .first()
    .click()
  await page.getByLabel('Company name').fill('Export Co')
  await page.getByRole('button', { name: 'Add person' }).click()
  await page.getByLabel('Person name').fill('Li Wei')
  await page.getByRole('button', { name: 'Add product' }).click()
  await page.getByLabel('Product name').fill('Drill')
  await page.getByLabel('Currency', { exact: true }).fill('CNY')
  await page.getByLabel('Price', { exact: true }).fill('720')
  await page
    .getByTestId('vendor-photo-input')
    .setInputFiles([{ name: 'p.jpg', mimeType: 'image/jpeg', buffer: photoBuffer }])
  await expect(page.locator('.photo-thumb')).toHaveCount(1)
  await page.getByRole('button', { name: 'Save vendor' }).click()
  await expect(page.getByRole('heading', { name: 'Vendors' })).toBeVisible()

  await page.getByRole('link', { name: 'Me' }).click()
  await page.getByRole('link', { name: /open sharing/i }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download export' }).click()
  const download = await downloadPromise
  const filePath = await download.path()
  expect(filePath).toBeTruthy()

  const context = await browser.newContext()
  const page2 = await context.newPage()
  await page2.goto('/')
  await page2.getByRole('link', { name: 'Me' }).click()
  await page2.getByRole('link', { name: /open sharing/i }).click()
  await page2.getByLabel('Import file').setInputFiles(filePath!)
  await expect(page2.getByText(/1 vendors, 1 people, 1 products, 1 photos/i)).toBeVisible()
  await page2.getByLabel('Replace everything').check()
  await page2.getByRole('button', { name: 'Replace all data' }).click()
  await expect(page2.getByText(/Imported 1 vendors/i)).toBeVisible()
  await page2.getByRole('link', { name: 'Vendors' }).click()
  await expect(page2.getByRole('link', { name: /Export Co/ })).toBeVisible()

  const stored = await page2.evaluate(async () => {
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
    const attachments = await getAll('attachments')
    return {
      contacts: (await getAll('contacts')).length,
      products: (await getAll('products')).length,
      attachments: attachments.map((attachment) => {
        const blob = attachment.blob as Blob
        return {
          type: blob instanceof Blob ? blob.type : null,
          size: blob instanceof Blob ? blob.size : 0,
        }
      }),
    }
  })

  expect(stored.contacts).toBe(1)
  expect(stored.products).toBe(1)
  expect(stored.attachments).toHaveLength(1)
  expect(stored.attachments[0]?.type).toBe('image/jpeg')
  expect(stored.attachments[0]?.size).toBeGreaterThan(0)

  await context.close()
})
