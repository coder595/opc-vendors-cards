import { expect, test } from '@playwright/test'
import { seed } from './helpers/seed'

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

test('lists people and summarizes the trip', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /no vendors yet/i })).toBeVisible()
  await seed(page)
  await page.reload()

  await page.getByRole('link', { name: 'People' }).click()
  await expect(page.getByRole('heading', { name: 'People' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Li Wei at Guangzhou Lighting/ })).toBeVisible()

  await page.getByRole('link', { name: 'Trip' }).click()
  await expect(page.getByRole('heading', { name: 'Trip summary' })).toBeVisible()
  await expect(page.getByText('Ask for samples')).toBeVisible()
  await expect(page.getByText('1.2 A14')).toBeVisible()
})
