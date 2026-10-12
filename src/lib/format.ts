const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

/** Locale medium date, e.g. "Oct 16, 2026". */
export function formatDate(ms: number): string {
  return dateFormatter.format(new Date(ms))
}
