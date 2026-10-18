import { expect, test } from '@playwright/test'
import { seed } from './helpers/seed'

test('offers saved tags and reuses their spelling', async ({ page }) => {
  await page.goto('/')
  await seed(page)
  await page.reload()

  await page.goto('/#/vendors/new')
  const saved = page.getByRole('group', { name: 'Saved tags' })
  await expect(saved.getByRole('button', { name: 'Add tag led-panel' })).toBeVisible()

  // Typing a near-duplicate stores the existing spelling and drops it from suggestions.
  await page.getByLabel('Add a tag').fill('LED Panel')
  await page.getByLabel('Add a tag').press('Enter')
  await expect(page.getByRole('button', { name: 'Remove tag led-panel' })).toBeVisible()
  await expect(saved.getByRole('button', { name: 'Add tag led-panel' })).toHaveCount(0)

  // One click adds a saved tag.
  await page.getByRole('button', { name: 'Remove tag led-panel' }).click()
  await saved.getByRole('button', { name: 'Add tag led-panel' }).click()
  await expect(page.getByRole('button', { name: 'Remove tag led-panel' })).toBeVisible()
})
