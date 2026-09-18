import { expect, test } from '@playwright/test'

test('renders the shell and empty state', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /no vendors yet/i })).toBeVisible()
  await expect(page.getByRole('navigation', { name: /primary/i })).toBeVisible()
})

test('ships the strict Content-Security-Policy in the built shell', async ({ page }) => {
  await page.goto('/')
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content')
  expect(csp).toContain("default-src 'self'")
  expect(csp).toContain("object-src 'none'")
})

test('serves the cached shell from the service worker with the network offline', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await page.waitForFunction(async () => Boolean(await navigator.serviceWorker.ready))

  // A freshly installed worker claims the page on the next navigation.
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.reload()
  }
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))

  await context.setOffline(true)
  const response = await page.reload()

  expect(response?.fromServiceWorker()).toBeTruthy()
  await expect(page.getByRole('heading', { name: /no vendors yet/i })).toBeVisible()
  await context.setOffline(false)
})
