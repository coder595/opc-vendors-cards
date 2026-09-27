import type { Contact, Vendor } from '../db/models'

// RFC 6350 §3.4 text escaping: backslash, comma and semicolon are structural
// delimiters; newlines are not allowed literally inside a value.
function esc(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\r\n|\r|\n/g, '\\n')
}

export function buildVcard(contact: Contact, vendor?: Vendor): string {
  const lines: string[] = ['BEGIN:VCARD', 'VERSION:3.0']

  lines.push(`FN:${esc(contact.name)}`)

  const spaceIndex = contact.name.indexOf(' ')
  if (spaceIndex === -1) {
    lines.push(`N:${esc(contact.name)};;;;`)
  } else {
    const first = contact.name.slice(0, spaceIndex)
    const last = contact.name.slice(spaceIndex + 1)
    lines.push(`N:${esc(last)};${esc(first)};;;`)
  }

  if (vendor?.name) lines.push(`ORG:${esc(vendor.name)}`)
  if (contact.position) lines.push(`TITLE:${esc(contact.position)}`)
  if (contact.phone) lines.push(`TEL:${esc(contact.phone)}`)
  if (contact.email) lines.push(`EMAIL:${esc(contact.email)}`)

  const noteParts: string[] = []
  const booth = [vendor?.fair?.hall, vendor?.fair?.booth].filter(Boolean).join('/')
  if (booth) noteParts.push(`Booth: ${esc(booth)}`)
  if (contact.wechat) noteParts.push(`WeChat: ${esc(contact.wechat)}`)
  if (noteParts.length > 0) lines.push(`NOTE:${noteParts.join(', ')}`)

  lines.push('END:VCARD')
  return lines.join('\r\n')
}