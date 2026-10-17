import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  FX_MAX_AGE_MS,
  fetchLiveRates,
  fxIsStale,
  mergeLiveRates,
  readFxStorage,
  rebase,
  writeFxStorage,
} from '../../src/lib/fx'

const USD_RATES = { USD: 1, OMR: 0.3845, CNY: 6.6908, EUR: 0.92, BAD: -1, xx: 3 }

const stubFetch = (status: number, body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  )

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('rebase', () => {
  it('turns USD quotes into units per 1 OMR and drops invalid entries', () => {
    const rates = rebase(USD_RATES, 'OMR')!
    expect(rates.CNY).toBe(17.4013) // 6.6908 / 0.3845
    expect(rates.USD).toBe(2.60078)
    expect(rates.OMR).toBeUndefined()
    expect(rates.BAD).toBeUndefined()
    expect(rates.xx).toBeUndefined()
  })

  it('returns null when the base has no quote', () => {
    expect(rebase(USD_RATES, 'XYZ')).toBeNull()
    expect(rebase(null, 'USD')).toBeNull()
  })
})

describe('fetchLiveRates', () => {
  it('returns rebased rates and the provider time', async () => {
    stubFetch(200, { timestamp: 1_700_000_000, base: 'USD', rates: USD_RATES })
    const live = await fetchLiveRates('key', 'OMR')
    expect(live.rates.CNY).toBe(17.4013)
    expect(live.asOf).toBe(1_700_000_000_000)
  })

  it('explains a rejected key', async () => {
    stubFetch(401, { error: true, status: 401, message: 'invalid_app_id' })
    await expect(fetchLiveRates('bad', 'USD')).rejects.toThrow('API key was rejected')
  })

  it('reports a network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline'))),
    )
    await expect(fetchLiveRates('key', 'USD')).rejects.toThrow('Could not reach')
  })
})

describe('mergeLiveRates', () => {
  it('updates listed codes, adds OMR and CNY, keeps unknown ones, skips the base', () => {
    const live = rebase(USD_RATES, 'USD')!
    const merged = mergeLiveRates({ EUR: 0.5, TWD: 31 }, live, 'USD')
    expect(merged).toEqual({ EUR: 0.92, TWD: 31, OMR: 0.3845, CNY: 6.6908 })
    expect(mergeLiveRates({}, rebase(USD_RATES, 'OMR')!, 'OMR')).toEqual({ CNY: 17.4013 })
  })
})

describe('fx storage', () => {
  it('round-trips the key and clears it when blank', () => {
    writeFxStorage({ key: 'abc', fetched: { base: 'OMR', at: 42 } })
    expect(readFxStorage()).toEqual({ key: 'abc', fetchedAt: 42, fetchedBase: 'OMR' })
    writeFxStorage({ key: '' })
    expect(readFxStorage().key).toBe('')
  })

  it('is stale after a day, for another base, or when the clock ran ahead', () => {
    const now = 10 * FX_MAX_AGE_MS
    expect(fxIsStale('OMR', now)).toBe(true)
    writeFxStorage({ fetched: { base: 'OMR', at: now - 1000 } })
    expect(fxIsStale('OMR', now)).toBe(false)
    expect(fxIsStale('USD', now)).toBe(true)
    expect(fxIsStale('OMR', now + FX_MAX_AGE_MS)).toBe(true)
    writeFxStorage({ fetched: { base: 'OMR', at: now + 5000 } })
    expect(fxIsStale('OMR', now)).toBe(true)
  })
})
