import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function seed(page: Page) {
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
  })
}

test('searches, filters by status and country, and opens a detail', async ({ page }) => {
  await page.goto('/')
  // Wait for the app to open the database (empty state renders) before seeding.
  await expect(page.getByRole('heading', { name: /no vendors yet/i })).toBeVisible()
  await seed(page)
  await page.reload()

  await expect(page.getByRole('link', { name: /Guangzhou Lighting/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Berlin Metal/ })).toBeVisible()

  await page.getByLabel('Search').fill('Li Wei')
  await expect(page.getByRole('link', { name: /Guangzhou Lighting/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Berlin Metal/ })).toHaveCount(0)

  await page.getByLabel('Search').fill('')
  await page.getByLabel('Status').selectOption('quoted')
  await page.getByLabel('Country').selectOption('China')
  await expect(page.getByRole('link', { name: /Guangzhou Lighting/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Berlin Metal/ })).toHaveCount(0)

  await page.getByRole('link', { name: /Guangzhou Lighting/ }).click()
  await expect(page.getByRole('heading', { name: 'Guangzhou Lighting' })).toBeVisible()
  await page.getByRole('tab', { name: 'People' }).click()
  await expect(page.getByText('Li Wei')).toBeVisible()
  await page.getByRole('tab', { name: 'Overview' }).click()
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('quoted')
})
