import type { Contact, Vendor } from '../db/models'

export function buildVcard(contact: Contact, vendor?: Vendor): string {
  const lines: string[] = ['BEGIN:VCARD', 'VERSION:3.0']

  lines.push(`FN:${contact.name}`)

  const spaceIndex = contact.name.indexOf(' ')
  if (spaceIndex === -1) {
    lines.push(`N:${contact.name};;;;`)
  } else {
    const first = contact.name.slice(0, spaceIndex)
    const last = contact.name.slice(spaceIndex + 1)
    lines.push(`N:${last};${first};;;`)
  }

  if (vendor?.name) lines.push(`ORG:${vendor.name}`)
  if (contact.position) lines.push(`TITLE:${contact.position}`)
  if (contact.phone) lines.push(`TEL:${contact.phone}`)
  if (contact.email) lines.push(`EMAIL:${contact.email}`)

  const noteParts: string[] = []
  const booth = [vendor?.fair?.hall, vendor?.fair?.booth].filter(Boolean).join('/')
  if (booth) noteParts.push(`Booth: ${booth}`)
  if (contact.wechat) noteParts.push(`WeChat: ${contact.wechat}`)
  if (noteParts.length > 0) lines.push(`NOTE:${noteParts.join(', ')}`)

  lines.push('END:VCARD')
  return lines.join('\r\n')
}