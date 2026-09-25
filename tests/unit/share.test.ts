import { describe, expect, it } from 'vitest'
import {
  buildVendorCard,
  cardToEnvelope,
  decodeVendorCard,
  encodeVendorCard,
  payloadFitsQr,
} from '../../src/lib/share'
import { validateEnvelope } from '../../src/lib/validate'
import { makeVendor } from './helpers/fixtures'

function rawCard(json: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(json))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `OCV1.${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
}

describe('vendor card codec', () => {
  it('round-trips a card with CJK and special characters', () => {
    const card = buildVendorCard(
      makeVendor({ name: '柏林金属 "Co"', country: 'China' }),
      [{ id: 'c1', vendorId: 'v', name: '李伟', isPrimary: true, phone: '+86 138', updatedAt: 1 }],
      [],
    )
    const decoded = decodeVendorCard(encodeVendorCard(card))
    expect(decoded?.name).toBe('柏林金属 "Co"')
    expect(decoded?.contacts[0]?.name).toBe('李伟')
    expect(decoded?.contacts[0]?.phone).toBe('+86 138')
  })

  it('rejects malformed codes', () => {
    expect(decodeVendorCard('nope')).toBeNull()
    expect(decodeVendorCard('OCV1.@@@')).toBeNull()
  })

  it('rejects a decodable card missing contacts/products arrays', () => {
    expect(decodeVendorCard(rawCard({ name: 'x' }))).toBeNull()
    expect(decodeVendorCard(rawCard({ name: '' }))).toBeNull()
  })

  it('produces an envelope that passes validation', () => {
    const card = buildVendorCard(makeVendor({ name: 'ACME' }), [], [])
    expect(validateEnvelope(cardToEnvelope(card))).toMatchObject({ ok: true })
  })

  it('enforces the QR byte budget', () => {
    expect(payloadFitsQr('OCV1.abc')).toBe(true)
    expect(payloadFitsQr('x'.repeat(2000))).toBe(false)
  })
})
