import { describe, expect, it } from 'vitest'
import { convertToBase, formatMoney, normalizeCurrencyCode, rateFor } from '../../src/lib/currency'

describe('currency', () => {
  const rates = { CNY: 7.2, JPY: 150 }

  it('converts foreign to base by dividing', () => {
    expect(convertToBase(720, 'CNY', 'USD', rates)).toBe(100)
  })

  it('treats the base currency as rate 1', () => {
    expect(rateFor({}, 'USD', 'USD')).toBe(1)
    expect(convertToBase(50, 'USD', 'USD', {})).toBe(50)
  })

  it('returns null for missing or invalid rates', () => {
    expect(convertToBase(10, 'CNY', 'USD', {})).toBeNull()
    expect(convertToBase(10, 'CNY', 'USD', { CNY: 0 })).toBeNull()
    expect(convertToBase(10, 'CNY', 'USD', { CNY: -1 })).toBeNull()
    expect(convertToBase(10, 'CNY', 'USD', { CNY: Number.NaN })).toBeNull()
    expect(convertToBase(Number.NaN, 'CNY', 'USD', rates)).toBeNull()
  })

  it('converts zero to zero', () => {
    expect(convertToBase(0, 'CNY', 'USD', rates)).toBe(0)
  })

  it('normalizes codes', () => {
    expect(normalizeCurrencyCode('cny')).toBe('CNY')
    expect(normalizeCurrencyCode('US')).toBeNull()
  })

  it('formats money deterministically', () => {
    expect(formatMoney(100, 'USD', 'en-US')).toBe('$\u00a0100.00')
    expect(formatMoney(17401.3, 'CNY', 'en-US')).toBe('CN¥\u00a017,401.30')
    // Codes already come with a space, and a trailing symbol gets none added.
    expect(formatMoney(57.467, 'OMR', 'en-US')).toBe('OMR\u00a057.467')
    expect(formatMoney(5, 'EUR', 'de-DE')).toBe('5,00\u00a0€')
    expect(formatMoney(720, 'CNY', 'en-US')).toContain('720.00')
  })

  it('never throws on malformed currency codes', () => {
    expect(() => formatMoney(1, 'USDX', 'en-US')).not.toThrow()
    expect(formatMoney(1, 'USDX', 'en-US')).toContain('USDX')
    expect(() => formatMoney(1, 'US', 'en-US')).not.toThrow()
  })
})
