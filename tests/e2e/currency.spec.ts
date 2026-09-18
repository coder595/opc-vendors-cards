import { expect, test } from '@playwright/test'

test('renders a CNY quote in the base currency and updates when the rate changes', async ({
  page,
}) => {
  await page.goto('/')

  await page
    .getByRole('link', { name: /add vendor/i })
    .first()
    .click()
  await page.getByLabel('Company name').fill('Guangzhou Tools')
  await page.getByRole('button', { name: 'Add product' }).click()
  await page.getByLabel('Product name').fill('Cordless drill')
  await page.getByLabel('Currency', { exact: true }).fill('CNY')
  await page.getByLabel('Price', { exact: true }).fill('720')
  await page.getByRole('button', { name: 'Save vendor' }).click()
  await expect(page.getByRole('heading', { name: 'Vendors' })).toBeVisible()

  // With no rate set, no fabricated number is shown.
  await page.getByRole('link', { name: /Guangzhou Tools/ }).click()
  await page.getByRole('tab', { name: 'Products' }).click()
  await expect(page.getByText(/no USD rate/i)).toBeVisible()

  // Enter the rate in Settings.
  await page.getByRole('link', { name: 'Me' }).click()
  await page.getByRole('button', { name: 'Add rate' }).click()
  await page.getByLabel('Currency 1').fill('CNY')
  await page.getByLabel(/units per 1/i).fill('7.2')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()

  // The quote now renders in the base currency (720 / 7.2 = 100).
  await page.getByRole('link', { name: 'Vendors' }).click()
  await page.getByRole('link', { name: /Guangzhou Tools/ }).click()
  await page.getByRole('tab', { name: 'Products' }).click()
  await expect(page.getByTestId('base-price')).toContainText('100.00')

  // Changing the rate updates the display without a reload (720 / 7.5 = 96).
  await page.getByRole('link', { name: 'Me' }).click()
  await page.getByLabel(/units per 1/i).fill('7.5')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await page.getByRole('link', { name: 'Vendors' }).click()
  await page.getByRole('link', { name: /Guangzhou Tools/ }).click()
  await page.getByRole('tab', { name: 'Products' }).click()
  await expect(page.getByTestId('base-price')).toContainText('96.00')
})
