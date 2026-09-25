// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { ExportedAttachment } from '../../src/db/models'
import { LIMITS, validateEnvelope } from '../../src/lib/validate'
import { makeEnvelope, makeVendor } from './helpers/fixtures'

function attachment(overrides: Partial<ExportedAttachment> = {}): ExportedAttachment {
  return {
    id: crypto.randomUUID(),
    vendorId: 'vendor-1',
    kind: 'product',
    width: 10,
    height: 10,
    bytes: 5,
    createdAt: 1,
    updatedAt: 1,
    mime: 'image/jpeg',
    blobB64: 'AQIDBAU=',
    thumbMime: 'image/jpeg',
    thumbB64: 'CQk=',
    ...overrides,
  }
}

describe('validateEnvelope', () => {
  it('accepts a well-formed envelope', () => {
    const result = validateEnvelope(makeEnvelope([makeVendor({ name: 'ACME' })]))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.envelope.data.vendors).toHaveLength(1)
    expect(result.rejected).toHaveLength(0)
  })

  it('warns (but does not reject) when another app id is present', () => {
    const envelope = makeEnvelope([makeVendor({ name: 'ACME' })])
    envelope.app.id = 'some-fork'
    const result = validateEnvelope(envelope)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.warnings.join(' ')).toContain('some-fork')
  })

  it('rejects unknown top-level fields', () => {
    const result = validateEnvelope({ ...makeEnvelope(), evil: true })
    expect(result).toMatchObject({ ok: false, error: { code: 'bad_envelope' } })
  })

  it('rejects unknown data fields', () => {
    const envelope = makeEnvelope()
    const result = validateEnvelope({
      ...envelope,
      data: { ...envelope.data, mystery: [] },
    })
    expect(result).toMatchObject({ ok: false, error: { code: 'bad_envelope' } })
  })

  it('rejects a file made by a newer schema version', () => {
    const result = validateEnvelope({ ...makeEnvelope(), schemaVersion: 4 })
    expect(result).toMatchObject({ ok: false, error: { code: 'unsupported_schema' } })
  })

  it('rejects a non-integer schema version', () => {
    const result = validateEnvelope({ ...makeEnvelope(), schemaVersion: 1.5 })
    expect(result).toMatchObject({ ok: false, error: { code: 'bad_envelope' } })
  })

  it('rejects a payload that exceeds the record cap', () => {
    const vendors = new Array(LIMITS.maxVendors + 1).fill({})
    const result = validateEnvelope(makeEnvelope(vendors as never))
    expect(result).toMatchObject({ ok: false, error: { code: 'too_many_records' } })
  })

  it('quarantines malformed records but keeps the valid ones', () => {
    const good = makeVendor({ name: 'Good Co' })
    const result = validateEnvelope(makeEnvelope([good, { id: 'x' } as never]))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.envelope.data.vendors).toHaveLength(1)
    expect(result.rejected).toHaveLength(1)
    expect(result.rejected[0]?.table).toBe('vendors')
  })

  it('drops unknown record fields instead of persisting them', () => {
    const vendor = { ...makeVendor({ name: 'ACME' }), evil: '<script>alert(1)</script>' }
    const result = validateEnvelope(makeEnvelope([vendor]))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect('evil' in (result.envelope.data.vendors[0] ?? {})).toBe(false)
  })

  it('rejects attachments with a non-raster MIME type', () => {
    const result = validateEnvelope(
      makeEnvelope([], {
        attachments: [attachment({ mime: 'image/svg+xml' })],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rejected.some((item) => item.table === 'attachments')).toBe(true)
  })

  it('accepts a valid attachment', () => {
    const result = validateEnvelope(makeEnvelope([], { attachments: [attachment()] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.envelope.data.attachments).toHaveLength(1)
  })

  it('rejects base64 whose length is not a multiple of four', () => {
    const result = validateEnvelope(
      makeEnvelope([], { attachments: [attachment({ blobB64: 'AAAAA' })] }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rejected.some((item) => item.table === 'attachments')).toBe(true)
  })

  it('rejects an attachment whose declared size exceeds the per-file cap', () => {
    const result = validateEnvelope(
      makeEnvelope([], {
        attachments: [attachment({ bytes: LIMITS.maxAttachmentBytes + 1 })],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rejected.some((item) => item.table === 'attachments')).toBe(true)
  })

  it('accepts application/octet-stream attachments (typeless blobs)', () => {
    const result = validateEnvelope(
      makeEnvelope([], { attachments: [attachment({ mime: 'application/octet-stream' })] }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.envelope.data.attachments).toHaveLength(1)
  })

  it('quarantines records with oversized nested arrays', () => {
    const tags = new Array(LIMITS.maxNestedItems + 1).fill('t')
    const result = validateEnvelope(makeEnvelope([makeVendor({ name: 'ACME', tags })]))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rejected).toHaveLength(1)
  })

  it('drops negative product prices rather than persisting them', () => {
    const product = {
      id: 'p1',
      vendorId: 'v1',
      name: 'Drill',
      currency: 'USD',
      price: -5,
      tiers: [],
      photoAttachmentIds: [],
      createdAt: 1,
      updatedAt: 1,
    }
    const result = validateEnvelope(makeEnvelope([], { products: [product] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.envelope.data.products[0]?.price).toBeUndefined()
  })

  it('rejects non-object input', () => {
    expect(validateEnvelope(null)).toMatchObject({ ok: false, error: { code: 'bad_envelope' } })
    expect(validateEnvelope([])).toMatchObject({ ok: false, error: { code: 'bad_envelope' } })
    expect(validateEnvelope('nope')).toMatchObject({ ok: false, error: { code: 'bad_envelope' } })
  })

  it('rejects a missing app or data object', () => {
    const base = makeEnvelope()
    expect(validateEnvelope({ ...base, app: undefined })).toMatchObject({
      ok: false,
      error: { code: 'bad_envelope' },
    })
    expect(validateEnvelope({ ...base, data: undefined })).toMatchObject({
      ok: false,
      error: { code: 'bad_envelope' },
    })
  })

  it('rejects a data table that is not an array', () => {
    const base = makeEnvelope()
    expect(validateEnvelope({ ...base, data: { ...base.data, vendors: {} } })).toMatchObject({
      ok: false,
      error: { code: 'bad_envelope' },
    })
  })

  it('rejects an invalid exportedAt', () => {
    expect(validateEnvelope({ ...makeEnvelope(), exportedAt: 42 })).toMatchObject({
      ok: false,
      error: { code: 'bad_envelope' },
    })
  })

  it('quarantines an invalid settings object rather than silently accepting it', () => {
    const result = validateEnvelope(
      makeEnvelope([], { settings: { id: 'app', rates: 5 } as never }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.envelope.data.settings).toBeNull()
    expect(result.rejected.some((item) => item.table === 'settings')).toBe(true)
  })
})
