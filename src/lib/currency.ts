export type RateMap = Readonly<Record<string, number>>

export const COMMON_CURRENCIES = [
  'USD',
  'EUR',
  'CNY',
  'GBP',
  'JPY',
  'HKD',
  'SGD',
  'AUD',
  'CAD',
  'KRW',
  'TWD',
  'INR',
  'AED',
  'CHF',
  'MXN',
  'BRL',
  'VND',
  'THB',
  'MYR',
  'IDR',
] as const

const ISO_CODE_RE = /^[A-Z]{3}$/
const formatterCache = new Map<string, Intl.NumberFormat | null>()

export function normalizeCurrencyCode(input: string): string | null {
  const code = input.trim().toUpperCase()
  return ISO_CODE_RE.test(code) ? code : null
}

/** Units of `currency` per 1 `base`; 1 when equal; null when absent/invalid. */
export function rateFor(rates: RateMap, base: string, currency: string): number | null {
  if (currency === base) return 1
  if (!Object.prototype.hasOwnProperty.call(rates, currency)) return null
  const rate = rates[currency]
  return typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : null
}

/** Converts an amount in `from` into the base currency, or null when no rate exists. */
export function convertToBase(
  amount: number,
  from: string,
  base: string,
  rates: RateMap,
): number | null {
  if (!Number.isFinite(amount) || amount < 0) return null
  const rate = rateFor(rates, base, from)
  if (rate === null) return null
  const result = amount / rate
  return Number.isFinite(result) ? result : null
}

function getFormatter(locale: string | undefined, currency: string): Intl.NumberFormat | null {
  const key = `${locale ?? ''}|${currency}`
  if (formatterCache.has(key)) return formatterCache.get(key) ?? null
  let formatter: Intl.NumberFormat | null = null
  try {
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'symbol',
    })
  } catch {
    formatter = null
  }
  formatterCache.set(key, formatter)
  return formatter
}

/** Formats an amount; never throws. Malformed codes fall back to "CODE 1,234.56". */
export function formatMoney(amount: number, currency: string, locale?: string): string {
  if (!Number.isFinite(amount)) return '—'
  const code = normalizeCurrencyCode(currency) ?? currency.trim().toUpperCase()
  const formatter = getFormatter(locale, code)
  if (formatter) return formatter.format(amount)
  try {
    const fallback = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    return `${code} ${fallback.format(amount)}`
  } catch {
    return `${code} ${amount}`
  }
}

/** Minor-unit digits for a currency (OMR 3, JPY 0), defaulting to 2. */
export function currencyDecimals(currency: string): number {
  return getFormatter('en', currency)?.resolvedOptions().maximumFractionDigits ?? 2
}
