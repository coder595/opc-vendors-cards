import type { RateMap } from './currency'

/** Device-local, never in IndexedDB, so exports cannot carry the key. */
export const FX_KEY_STORAGE = 'opc.fxKey'
export const FX_FETCHED_STORAGE = 'opc.fxFetchedAt'
export const FX_MAX_AGE_MS = 24 * 60 * 60 * 1000
/** Always filled by a fetch, on top of the currencies already listed. */
export const FX_DEFAULT_CODES = ['OMR', 'CNY'] as const

const ENDPOINT = 'https://openexchangerates.org/api/latest.json'
const CODE_RE = /^[A-Z]{3}$/

export interface LiveRates {
  /** Units of each currency per 1 `base`. */
  rates: Record<string, number>
  /** Provider timestamp, ms. */
  asOf: number
}

/** Rebases USD-quoted rates (free plan) onto `base`, rounded to 6 significant digits. */
export function rebase(usdRates: unknown, base: string): Record<string, number> | null {
  if (typeof usdRates !== 'object' || usdRates === null) return null
  const valid: Record<string, number> = {}
  for (const [code, rate] of Object.entries(usdRates)) {
    if (CODE_RE.test(code) && typeof rate === 'number' && Number.isFinite(rate) && rate > 0) {
      valid[code] = rate
    }
  }
  const perUsd = valid[base]
  if (perUsd === undefined) return null
  const out: Record<string, number> = {}
  for (const [code, rate] of Object.entries(valid)) {
    if (code !== base) out[code] = Number((rate / perUsd).toPrecision(6))
  }
  return out
}

export async function fetchLiveRates(appId: string, base: string): Promise<LiveRates> {
  let response: Response
  try {
    response = await fetch(`${ENDPOINT}?app_id=${encodeURIComponent(appId)}`, {
      referrerPolicy: 'no-referrer',
    })
  } catch {
    throw new Error('Could not reach openexchangerates.org. Check your connection.')
  }
  const body: unknown = await response.json().catch(() => null)
  const data = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  if (!response.ok || data.error) {
    const message = typeof data.message === 'string' ? data.message : `HTTP ${response.status}`
    throw new Error(
      message === 'invalid_app_id'
        ? 'The rates API key was rejected.'
        : `Rates fetch failed: ${message}`,
    )
  }
  const rates = rebase(data.rates, base)
  if (!rates) throw new Error(`No rate for ${base} from openexchangerates.org.`)
  const asOf = typeof data.timestamp === 'number' ? data.timestamp * 1000 : Date.now()
  return { rates, asOf }
}

/** The codes to update: those already listed plus OMR and CNY, never the base. */
export function mergeLiveRates(
  current: RateMap,
  live: Record<string, number>,
  base: string,
): Record<string, number> {
  const next: Record<string, number> = { ...current }
  for (const code of [...Object.keys(current), ...FX_DEFAULT_CODES]) {
    const rate = live[code]
    if (code !== base && rate !== undefined) next[code] = rate
  }
  return next
}

export function readFxStorage(): { key: string; fetchedAt: number; fetchedBase: string } {
  try {
    // Stored as "<base>:<ms>" so a base change makes the last fetch stale.
    const [fetchedBase = '', at = ''] = (localStorage.getItem(FX_FETCHED_STORAGE) ?? '').split(':')
    return {
      key: localStorage.getItem(FX_KEY_STORAGE) ?? '',
      fetchedAt: Number(at) || 0,
      fetchedBase,
    }
  } catch {
    return { key: '', fetchedAt: 0, fetchedBase: '' }
  }
}

/** True when an auto-refresh is due for `base` (a clock that ran ahead counts as stale). */
export function fxIsStale(base: string, now = Date.now()): boolean {
  const { fetchedAt, fetchedBase } = readFxStorage()
  return fetchedBase !== base || fetchedAt > now || now - fetchedAt >= FX_MAX_AGE_MS
}

export function writeFxStorage(patch: {
  key?: string
  fetched?: { base: string; at: number }
}): void {
  try {
    if (patch.key !== undefined) {
      if (patch.key) localStorage.setItem(FX_KEY_STORAGE, patch.key)
      else localStorage.removeItem(FX_KEY_STORAGE)
    }
    if (patch.fetched) {
      localStorage.setItem(FX_FETCHED_STORAGE, `${patch.fetched.base}:${patch.fetched.at}`)
    }
  } catch {
    // localStorage unavailable (private mode): the key just isn't remembered.
  }
}
