import { expect, test } from '@playwright/test'

test('is installable: manifest, icons and service worker', async ({ page, request }) => {
  await page.goto('/')

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(manifestHref).toBeTruthy()

  const manifestUrl = new URL(manifestHref as string, page.url()).href
  const response = await request.get(manifestUrl)
  expect(response.ok(), manifestUrl).toBeTruthy()
  const manifest = await response.json()

  expect(manifest.name).toBeTruthy()
  expect(manifest.short_name).toBeTruthy()
  expect(manifest.display).toBe('standalone')
  expect(manifest.start_url).toBeTruthy()
  expect(manifest.scope).toBeTruthy()

  const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes)
  expect(sizes).toContain('192x192')
  expect(sizes).toContain('512x512')
  expect(
    manifest.icons.some((icon: { purpose?: string }) => icon.purpose === 'maskable'),
  ).toBeTruthy()

  // Every declared icon must actually resolve.
  for (const icon of manifest.icons as { src: string }[]) {
    const iconUrl = new URL(icon.src, page.url()).href
    const iconResponse = await request.get(iconUrl)
    expect(iconResponse.ok(), icon.src).toBeTruthy()
  }

  // A controlling service worker is what makes the app installable/offline.
  await page.waitForFunction(async () => Boolean(await navigator.serviceWorker.ready))
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.reload()
  }
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
})

test('declares a theme color and a language', async ({ page }) => {
  await page.goto('/')
  const themeColor = await page.locator('meta[name="theme-color"]').getAttribute('content')
  expect(themeColor).toMatch(/^#[0-9A-Fa-f]{6}$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})
