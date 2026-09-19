import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { seed } from './helpers/seed'

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

interface Violation {
  id: string
  impact?: string | null
  help: string
  targets: string[]
}

async function scan(page: Page): Promise<Violation[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  return results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.map((node) => node.target.join(' ')),
  }))
}

/** Key screens must be axe-clean in both themes (contrast is computed per theme). */
async function expectClean(page: Page) {
  expect(await scan(page), 'light theme').toEqual([])
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await scan(page), 'dark theme').toEqual([])
  await page.emulateMedia({ colorScheme: 'light' })
}

test('vendors list — empty state', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /no vendors yet/i })).toBeVisible()
  await expectClean(page)
})

test('vendors list — seeded', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /no vendors yet/i })).toBeVisible()
  await seed(page)
  await page.reload()
  await expect(page.getByRole('link', { name: /Guangzhou Lighting/ })).toBeVisible()
  await expectClean(page)
})

test('vendor detail — every tab', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /no vendors yet/i })).toBeVisible()
  await seed(page)
  await page.goto('/#/vendors/v-cn')
  await expect(page.getByRole('heading', { name: 'Guangzhou Lighting' })).toBeVisible()
  for (const tab of ['Overview', 'People', 'Products', 'Notes', 'Certs', 'Files']) {
    await page.getByRole('tab', { name: tab }).click()
    await expectClean(page)
  }
})

test('new vendor form', async ({ page }) => {
  await page.goto('/#/vendors/new')
  await expect(page.getByRole('heading', { name: 'New vendor' })).toBeVisible()
  await expectClean(page)
})

test('settings', async ({ page }) => {
  await page.goto('/#/me')
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expectClean(page)
})

test('people list', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /no vendors yet/i })).toBeVisible()
  await seed(page)
  await page.reload()
  await page.goto('/#/people')
  await expect(page.getByRole('heading', { name: 'People' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Li Wei at Guangzhou Lighting/ })).toBeVisible()
  await expectClean(page)
})

test('trip summary', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /no vendors yet/i })).toBeVisible()
  await seed(page)
  await page.reload()
  await page.goto('/#/trip')
  await expect(page.getByRole('heading', { name: 'Trip summary' })).toBeVisible()
  await expect(page.getByText('Ask for samples')).toBeVisible()
  await expectClean(page)
})

test('sharing & data', async ({ page }) => {
  await page.goto('/#/share')
  await expect(page.getByRole('heading', { name: 'Sharing & data' })).toBeVisible()
  await expectClean(page)
})

test('vendor share card', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /no vendors yet/i })).toBeVisible()
  await seed(page)
  await page.goto('/#/vendors/v-cn/share')
  await expect(page.getByRole('heading', { name: 'Guangzhou Lighting' })).toBeVisible()
  await expectClean(page)
})

test('print media resets dark tokens to black on white', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /no vendors yet/i })).toBeVisible()
  await seed(page)
  await page.goto('/#/vendors/v-cn/share')
  await expect(page.getByRole('heading', { name: 'Guangzhou Lighting' })).toBeVisible()
  await page.emulateMedia({ colorScheme: 'dark', media: 'print' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const body = page.locator('body')
  await expect(body).toHaveCSS('color', 'rgb(0, 0, 0)')
  await expect(body).toHaveCSS('background-color', 'rgb(255, 255, 255)')
})
