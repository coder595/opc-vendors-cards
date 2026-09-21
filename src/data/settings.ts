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
  if (safe.theme !== undefined && !['light', 'dark', 'system', 'gruvbox', 'oled', 'sepia'].includes(safe.theme)) {
    throw new Error('Unknown theme')
  }
  if (safe.rates !== undefined) {
    for (const [code, rate] of Object.entries(safe.rates)) {
      if (
        !/^[A-Z]{3}$/.test(code) ||
        typeof rate !== 'number' ||
        !Number.isFinite(rate) ||
        rate <= 0
      ) {
        throw new Error('Rates must be positive numbers keyed by 3-letter currency codes')
      }
    }
  }
  // Rates are expressed per base; changing the base alone invalidates them.
  if (
    safe.baseCurrency !== undefined &&
    safe.baseCurrency !== current.baseCurrency &&
    safe.rates === undefined
  ) {
    safe.rates = {}
  }
  await db.settings.put({ ...current, ...safe, id: 'app' })
}
