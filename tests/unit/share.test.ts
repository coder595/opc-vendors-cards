// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  buildVendorCard,
  cardToEnvelope,
  decodeVendorCard,
  encodeVendorCard,
  encodeVendorCardUrl,
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
  it('round-trips a card with CJK and special characters', async () => {
    const card = buildVendorCard(
      makeVendor({ name: '柏林金属 "Co"', country: 'China' }),
      [{ id: 'c1', vendorId: 'v', name: '李伟', isPrimary: true, phone: '+86 138' }],
      [],
    )
    const decoded = await decodeVendorCard(encodeVendorCard(card))
    expect(decoded?.name).toBe('柏林金属 "Co"')
    expect(decoded?.contacts[0]?.name).toBe('李伟')
    expect(decoded?.contacts[0]?.phone).toBe('+86 138')
  })

  it('rejects malformed codes', async () => {
    await expect(decodeVendorCard('nope')).resolves.toBeNull()
    await expect(decodeVendorCard('OCV1.@@@')).resolves.toBeNull()
  })

  it('rejects a decodable card missing contacts/products arrays', async () => {
    await expect(decodeVendorCard(rawCard({ name: 'x' }))).resolves.toBeNull()
    await expect(decodeVendorCard(rawCard({ name: '' }))).resolves.toBeNull()
  })

  it('produces an envelope that passes validation', () => {
    const card = buildVendorCard(makeVendor({ name: 'ACME' }), [], [])
    expect(validateEnvelope(cardToEnvelope(card))).toMatchObject({ ok: true })
  })

  it('enforces the QR byte budget', () => {
    expect(payloadFitsQr('OCV1.abc')).toBe(true)
    expect(payloadFitsQr('x'.repeat(2000))).toBe(false)
  })

  it('round-trips OCV2 via encodeVendorCardUrl', async () => {
    const card = buildVendorCard(
      makeVendor({ name: 'ACME OCV2', country: 'DE' }),
      [{ id: 'c1', vendorId: 'v', name: 'Hans', isPrimary: true }],
      [],
    )
    const url = await encodeVendorCardUrl(card, 'https://example.com')
    expect(url).toMatch(/^https:\/\/example\.com\/#\/import\?c=OCV2\./)
    const decoded = await decodeVendorCard(url)
    expect(decoded?.name).toBe('ACME OCV2')
    expect(decoded?.contacts[0]?.name).toBe('Hans')
  })

  it('decodes OCV2 payload without URL wrapper', async () => {
    const card = buildVendorCard(
      makeVendor({ name: 'Plain Payload' }),
      [],
      [],
    )
    const url = await encodeVendorCardUrl(card, 'https://x.com')
    const payload = url.split('c=')[1] ?? ''
    const decoded = await decodeVendorCard(payload)
    expect(decoded?.name).toBe('Plain Payload')
  })
})