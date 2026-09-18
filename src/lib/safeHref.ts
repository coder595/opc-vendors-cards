const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])
const SCHEME_RE = /^([a-z][a-z0-9+.-]*):(\/\/)?/i
const NON_HTTP_SCHEMES = new Set([
  'mailto',
  'tel',
  'javascript',
  'data',
  'vbscript',
  'file',
  'blob',
])

function normalize(value: string): string {
  const match = SCHEME_RE.exec(value)
  if (!match) return `https://${value}`
  const scheme = match[1]?.toLowerCase() ?? ''
  const hasSlashes = match[2] === '//'
  // Bare `host:port` is not a scheme; unknown bare schemes are treated as hosts.
  if (hasSlashes || NON_HTTP_SCHEMES.has(scheme)) return value
  return `https://${value}`
}

/**
 * Returns a safe href for user/imported strings, or undefined for schemes that
 * can execute (javascript:, data:, vbscript:, …). architecture.md §9.
 */
export function safeHref(value: string | undefined | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  try {
    const url = new URL(normalize(trimmed))
    if (url.username || url.password) return undefined
    return ALLOWED_PROTOCOLS.has(url.protocol) ? url.href : undefined
  } catch {
    return undefined
  }
}
