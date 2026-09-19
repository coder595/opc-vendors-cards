import { safeHref } from '../lib/safeHref'

export function EmailLink({ email }: { email: string }) {
  const href = safeHref(`mailto:${email}`)
  if (!href) return <span className="mono">{email}</span>
  return <a href={href}>{email}</a>
}

export function PhoneLink({ phone, whatsapp = false }: { phone: string; whatsapp?: boolean }) {
  const digits = phone.replace(/[^\d+]/g, '')
  if (!digits) return <span className="mono">{phone}</span>
  const href = whatsapp
    ? safeHref(`https://wa.me/${digits.replace(/\+/g, '')}`)
    : safeHref(`tel:${digits}`)
  if (!href) return <span className="mono">{phone}</span>
  return (
    <a
      href={href}
      rel={whatsapp ? 'noreferrer noopener' : undefined}
      target={whatsapp ? '_blank' : undefined}
    >
      {whatsapp ? <span className="sr-only">WhatsApp </span> : null}
      {phone}
    </a>
  )
}
