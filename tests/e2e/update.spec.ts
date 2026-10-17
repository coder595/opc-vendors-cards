import { createServer, type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { seed } from './helpers/seed'

const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}

// A tiny no-cache server for dist/, so the test can publish a "next build" of sw.js
// (Playwright routing cannot intercept the browser's own service-worker update check).
let server: Server
let origin = ''
let nextBuild = false

test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/'))
    const file = join('dist', path === '/' ? 'index.html' : path)
    try {
      let body: string | Buffer = await readFile(file)
      if (path === '/sw.js' && nextBuild) body = `${body.toString()}\n// next build`
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
      res.end(body)
    } catch {
      res.writeHead(404).end()
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  origin = typeof address === 'object' && address ? `http://127.0.0.1:${address.port}` : ''
})

test.afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

async function controlled(page: Page) {
  await page.waitForFunction(async () => Boolean(await navigator.serviceWorker.ready))
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) await page.reload()
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
}

test.describe.configure({ mode: 'serial' })

test('Update app says when the installed copy is already the latest', async ({ page }) => {
  nextBuild = false
  await page.goto(`${origin}/#/me`)
  await controlled(page)
  await page.getByRole('button', { name: 'Update app' }).click()
  await expect(page.getByText(/already on the latest version/)).toBeVisible()
})

test('Update app installs a new version and keeps every vendor', async ({ page }) => {
  nextBuild = false
  await page.goto(`${origin}/`)
  await seed(page)
  await page.reload()
  await controlled(page)
  const vendors = page.locator('main a[href^="#/vendors/v-"]')
  await expect(vendors.first()).toBeVisible()
  const names = await vendors.allTextContents()

  nextBuild = true
  await page.goto(`${origin}/#/me`)
  await page.evaluate(() => ((window as unknown as { beforeUpdate: boolean }).beforeUpdate = true))
  await page.getByRole('button', { name: 'Update app' }).click()
  // The page reloads onto the new version, which clears the marker.
  await page.waitForFunction(() => !(window as unknown as { beforeUpdate?: boolean }).beforeUpdate, null, {
    timeout: 15_000,
  })
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))

  await page.goto(`${origin}/#/vendors`)
  await expect(vendors).toHaveText(names)
})
