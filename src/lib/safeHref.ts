const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])

/**
 * Returns a safe href for user/imported strings, or undefined for schemes that
 * can execute (javascript:, data:, vbscript:, …). architecture.md §9.
 */
export function safeHref(value: string | undefined | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  try {
    const url = new URL(trimmed.includes(':') ? trimmed : `https://${trimmed}`)
    return ALLOWED_PROTOCOLS.has(url.protocol) ? url.href : undefined
  } catch {
    return undefined
  }
}
