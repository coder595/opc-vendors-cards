import type { Contact, Vendor } from '../db/models'
import { safeHref } from './safeHref'

/** Prefilled follow-up message (N7); the user edits it in WhatsApp/mail before sending. */
export function followUpText(
  contact: Contact,
  vendor: Vendor,
  productNames: string[],
  sender: string | undefined,
): string {
  const firstName = contact.name.trim().split(/\s+/)[0] ?? ''
  const booth = [vendor.fair.hall, vendor.fair.booth].filter(Boolean).join(' ')
  const where = vendor.fair.edition
    ? ` at ${vendor.fair.edition}${booth ? ` (booth ${booth})` : ''}`
    : ''
  const products = productNames.length > 0 ? ` for ${productNames.join(', ')}` : ''
  const signOff = sender ? `Best regards,\n${sender}` : 'Best regards'
  return `Hello ${firstName}, it was good to meet you${where}. Could you please send your quotation${products}?\n\n${signOff}`
}

export function followUpLinks(
  contact: Contact,
  vendor: Vendor,
  text: string,
): { whatsapp: string | null; email: string | null } {
  const digits = (contact.whatsapp ?? contact.phone ?? '').replace(/\D/g, '')
  const body = encodeURIComponent(text)
  const subject = encodeURIComponent(`Quotation request — ${vendor.name}`)
  // An address carrying ?, & or # could smuggle extra mailto headers.
  const email =
    contact.email && !/[?&#\s]/.test(contact.email)
      ? safeHref(`mailto:${contact.email}?subject=${subject}&body=${body}`)
      : undefined
  return {
    whatsapp: (digits && safeHref(`https://wa.me/${digits}?text=${body}`)) || null,
    email: email ?? null,
  }
}
