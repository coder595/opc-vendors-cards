import { db } from '../db/schema'
import type { Settings } from '../db/models'
import { definedPatch } from './guards'

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  baseCurrency: 'USD',
  rates: {},
  theme: 'system',
}

export async function getSettings(): Promise<Settings> {
  const existing = await db.settings.get('app')
  return existing ?? { ...DEFAULT_SETTINGS, rates: {} }
}

export async function updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
  const current = await getSettings()
  const safe = definedPatch(patch)
  if (safe.baseCurrency !== undefined && !/^[A-Z]{3}$/.test(safe.baseCurrency)) {
    throw new Error('Base currency must be a 3-letter ISO code')
  }
  if (safe.theme !== undefined && !['light', 'dark', 'system'].includes(safe.theme)) {
    throw new Error('Unknown theme')
  }
  await db.settings.put({ ...current, ...safe, id: 'app' })
}
