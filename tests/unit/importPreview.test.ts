// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createVendor } from '../../src/data/vendors'
import { previewImport } from '../../src/lib/exportImport'
import { makeEnvelope, makeVendor } from './helpers/fixtures'
import { resetDb } from './helpers/db'

describe('previewImport', () => {
  beforeEach(resetDb)
  afterEach(resetDb)

  it('counts records and matches existing vendors by id and key', async () => {
    const existingId = await createVendor({ name: 'Acme Tools', website: 'acme.com' })
    const envelope = makeEnvelope([
      makeVendor({ id: existingId, name: 'Acme Tools' }),
      makeVendor({ id: 'new-1', name: 'Acme Tools', website: 'acme.com' }),
      makeVendor({ id: 'new-2', name: 'Other Co' }),
    ])

    const preview = await previewImport(envelope)

    expect(preview.counts.vendors).toBe(3)
    expect(preview.matchedVendors).toBe(2)
    expect(preview.newVendors).toBe(1)
  })

  it('does not overstate new vendors for intra-file duplicates', async () => {
    const envelope = makeEnvelope([
      makeVendor({ id: 'a', name: 'Acme', website: 'acme.com' }),
      makeVendor({ id: 'b', name: 'Acme', website: 'acme.com' }),
    ])

    const preview = await previewImport(envelope)

    expect(preview.matchedVendors).toBe(1)
    expect(preview.newVendors).toBe(1)
  })
})
