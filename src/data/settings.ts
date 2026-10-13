import { db } from '../db/schema'
import type { Settings } from '../db/models'
import { definedPatch } from './guards'
import { parseSettings } from '../lib/validate'

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
  // Same rules as an imported file, so the UI cannot store what an import would drop.
  if (safe.landed !== undefined && !parseSettings({ id: 'app', rates: {}, landed: safe.landed })?.landed) {
    throw new Error('Landed-cost values must be non-negative numbers')
  }
  // Rates are expressed per base; changing the base alone invalidates them.
  if (
    safe.baseCurrency !== undefined &&
    safe.baseCurrency !== current.baseCurrency &&
    safe.rates === undefined
  ) {
    safe.rates = {}
  }
  const next: Settings = { ...current, ...safe, id: 'app' }
  // An explicit `landed: undefined` turns the estimate off (definedPatch would keep the old value).
  if ('landed' in patch && patch.landed === undefined) delete next.landed
  await db.settings.put(next)
}
