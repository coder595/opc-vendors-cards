import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('estimates a landed cost from packing and Settings (N2)', async ({ page }) => {
  await page.goto('/')

  // Settings: 1 USD = 7.2 CNY; freight 10 %, duty 5 %, VAT 5 %.
  await page.getByRole('link', { name: 'Me' }).click()
  await page.getByRole('button', { name: 'Add rate' }).click()
  await page.getByLabel('Currency 1').fill('CNY')
  await page.getByLabel(/units per 1/i).fill('7.2')
  await page.getByLabel('Freight %').fill('10')
  await page.getByLabel('Import duty %').fill('5')
  await page.getByLabel('VAT %').fill('5')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()

  // A FOB quote of 720 CNY with packing.
  await page.getByRole('link', { name: 'Vendors' }).click()
  await page.getByRole('link', { name: /add vendor/i }).first().click()
  await page.getByLabel('Company name').fill('Ningbo Panels')
  await page.getByLabel('Add a tag').fill('panel')
  await page.getByLabel('Add a tag').press('Enter')
  await page.getByRole('button', { name: 'Add product' }).click()
  await page.getByLabel('Product name').fill('Panel 60x60')
  await page.getByLabel('Currency', { exact: true }).fill('CNY')
  await page.getByLabel('Price', { exact: true }).fill('720')
  await page.getByLabel('MOQ', { exact: true }).fill('5')
  await page.getByLabel('Order quantity').fill('10')
  await page.getByText('Packing and incoterm').click()
  await page.getByLabel('Incoterm').selectOption('FOB')
  await page.getByLabel('Pieces per carton').fill('20')
  await page.getByLabel('Carton length (cm)').fill('50')
  await page.getByLabel('Carton width (cm)').fill('40')
  await page.getByLabel('Carton height (cm)').fill('30')
  await page.getByRole('button', { name: 'Save vendor' }).click()
  await expect(page.getByRole('heading', { name: 'Vendors' })).toBeVisible()

  // 100 USD → +10 % 110 → +5 % 115.50 → +5 % 121.275
  await page.getByRole('link', { name: /Ningbo Panels/ }).click()
  await page.getByRole('tab', { name: 'Products' }).click()
  await expect(page.getByTestId('landed-cost')).toContainText('121.28')
  // Order quantity 10 (MOQ 5): ¥7,200 ≈ $1,000; landed $1,212.75 ≈ ¥8,731.80 (× 7.2).
  await expect(page.getByTestId('order-total')).toContainText('Order of 10 pcs')
  await expect(page.getByTestId('order-total')).toContainText('7,200.00')
  await expect(page.getByTestId('order-total')).toContainText('1,000.00')
  await expect(page.getByTestId('order-landed')).toContainText('8,731.80')
  await expect(page.getByTestId('order-landed')).toContainText('1,212.75')
  await expect(page.getByText('FOB · 20 pcs/ctn · 50×40×30 cm · 0.060 m³')).toBeVisible()

  // Editing keeps the packing (the disclosure opens because it has data).
  await page.getByRole('link', { name: 'Edit' }).click()
  await expect(page.getByLabel('Pieces per carton')).toHaveValue('20')
  await expect(page.getByLabel('Incoterm')).toHaveValue('FOB')

  // Trip compare shows the landed column and is axe-clean.
  await page.goto('/#/trip')
  const table = page.getByRole('table', { name: 'Compare products' })
  await expect(table.getByRole('columnheader', { name: 'Landed (USD)' })).toBeVisible()
  await expect(table).toContainText('121.28')
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(results.violations.map((violation) => violation.id)).toEqual([])
})
