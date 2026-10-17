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
  // Measure settled colours: a panel fade or colour transition mid-flight blends values.
  // allSettled: a transition interrupted by a newer one rejects with AbortError.
  await page.evaluate(async () => {
    for (let i = 0; i < 3 && document.getAnimations().length > 0; i += 1) {
      await Promise.allSettled(document.getAnimations().map((a) => a.finished))
    }
  })
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  return results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.map((node) => node.target.join(' ')),
  }))
}

const THEMES = ['light', 'dark', 'gruvbox', 'oled', 'sepia'] as const

/** Set the data-theme attribute directly and clear any OS color-scheme emulation. */
async function setTheme(page: Page, theme: string) {
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t
  }, theme)
  await page.emulateMedia({
    colorScheme: theme === 'dark' || theme === 'gruvbox' || theme === 'oled' ? 'dark' : 'light',
  })
}

async function expectCleanInAllThemes(page: Page, label: string) {
  for (const theme of THEMES) {
    await setTheme(page, theme)
    expect(await scan(page), `${label} — ${theme}`).toEqual([])
  }
}

/** Key screens must be axe-clean in both themes (contrast is computed per theme). */
async function expectClean(page: Page) {
  await expectCleanInAllThemes(page, '')
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

test('quick add', async ({ page }) => {
  await page.goto('/#/vendors/quick')
  await expect(page.getByRole('heading', { name: 'Quick add vendor' })).toBeVisible()
  await expectClean(page)
})

test('import vendor card from a QR link', async ({ page }) => {
  const card = {
    name: 'Shenzhen Panels',
    type: 'factory',
    status: 'met',
    rating: 4,
    tags: ['led-panel'],
    fair: { edition: 'Canton 138', hall: '9.1', booth: 'B12' },
    contacts: [{ name: 'Chen Jing', phone: '+86 138 0000 0000', isPrimary: true }],
    products: [{ name: 'LED panel 60x60', currency: 'CNY', price: 85, moq: 500 }],
  }
  const code = 'OCV1.' + Buffer.from(JSON.stringify(card)).toString('base64url')
  await page.goto(`/#/import?c=${code}`)
  await expect(page.getByRole('heading', { name: 'Shenzhen Panels' })).toBeVisible()
  await expectClean(page)
})

test('photo viewer dialog', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /no vendors yet/i })).toBeVisible()
  await seed(page)
  await page.goto('/#/vendors/v-cn')
  await page.getByRole('tab', { name: 'Files' }).click()
  await page.locator('.file-grid .btn-blob').first().click()
  await expect(page.getByRole('dialog', { name: /Photo 1 of/ })).toBeVisible()
  await expectClean(page)
})

test('settings', async ({ page }) => {
  await page.goto('/#/me')
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expectClean(page)
})

test('exchange rates', async ({ page }) => {
  await page.goto('/#/rates')
  await expect(page.getByRole('heading', { name: 'Exchange rates' })).toBeVisible()
  await page.getByLabel('Base currency').fill('OMR')
  await page.getByRole('button', { name: 'Add rate' }).click()
  await page.getByLabel('Currency 1').fill('CNY')
  await page.getByLabel(/units per 1/i).fill('17.4')
  await page.getByRole('button', { name: 'Save rates' }).click()
  await expect(page.getByTestId('convert-result')).toContainText('17.40')
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
  await expect(page.getByRole('table', { name: 'Compare products' })).toBeVisible()
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
