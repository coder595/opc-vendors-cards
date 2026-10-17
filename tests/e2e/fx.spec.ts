import { expect, test } from '@playwright/test'

const USD_RATES = { USD: 1, OMR: 0.3845, CNY: 6.6908 }

test('fills live OMR→CNY rates, keeps a hand edit, and auto-refreshes after a day', async ({
  page,
}) => {
  let calls = 0
  await page.route('https://openexchangerates.org/api/latest.json*', (route) => {
    calls += 1
    return route.fulfill({ json: { timestamp: 1_700_000_000, base: 'USD', rates: USD_RATES } })
  })
  await page.goto('/#/rates')

  await page.getByLabel('Base currency').fill('OMR')
  await page.getByLabel('Rates API key').fill('test-key')
  await page.getByRole('button', { name: 'Fetch live rates' }).click()
  await expect(page.getByText(/Live rates filled in/)).toBeVisible()

  // 6.6908 / 0.3845; the base itself (OMR) gets no row.
  await expect(page.getByLabel('Currency 1')).toHaveValue('CNY')
  const rate = page.getByLabel('Units per 1 OMR (1)')
  await expect(rate).toHaveValue('17.4013')
  await expect(page.getByLabel('Currency 2')).toHaveCount(0)

  // The user can still override it.
  await rate.fill('17.5')
  await page.getByRole('button', { name: 'Save rates' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Units per 1 OMR (1)')).toHaveValue('17.5')
  expect(calls).toBe(1)

  // A day later, opening Settings refreshes and saves on its own.
  await page.evaluate(() => localStorage.setItem('opc.fxFetchedAt', 'OMR:1'))
  await page.reload()
  await expect(page.getByText(/Saved rates updated from openexchangerates.org/)).toBeVisible()
  await expect(page.getByLabel('Units per 1 OMR (1)')).toHaveValue('17.4013')
  await page.reload()
  await expect(page.getByLabel('Units per 1 OMR (1)')).toHaveValue('17.4013')
  expect(calls).toBe(2)
})
