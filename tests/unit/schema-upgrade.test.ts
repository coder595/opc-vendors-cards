// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { Vendor } from '../../src/db/models'
import { OpcDb } from '../../src/db/schema'
import { validateEnvelope } from '../../src/lib/validate'
import { makeEnvelope } from './helpers/fixtures'

/**
 * A version-2 probe built on the real production schema, not a parallel
 * test-local one — so this fails if the app's store definitions regress.
 */
class UpgradeProbeDb extends OpcDb {
  constructor(name: string) {
    super(name)
    this.version(2)
      .stores({
        vendors: 'id, name, status, country, *tags, updatedAt, city',
        contacts: 'id, vendorId',
        products: 'id, vendorId, name',
        notes: 'id, vendorId, done, dueDate',
        certs: 'id, vendorId, expiry',
        attachments: 'id, vendorId, kind',
        settings: 'id',
      })
      .upgrade((tx) =>
        tx
          .table('vendors')
          .toCollection()
          .modify((vendor: Vendor) => {
            if (vendor.city === undefined) vendor.city = ''
          }),
      )
  }
}

describe('version upgrade', () => {
  it('upgrades the production schema and backfills existing rows', async () => {
    const name = `upgrade-${crypto.randomUUID()}`

    const v1 = new OpcDb(name)
    await v1.vendors.add({
      id: 'a',
      name: 'ACME',
      type: 'supplier',
      status: 'lead',
      rating: 3,
      socials: [],
      tags: [],
      fair: {},
      createdAt: 1,
      updatedAt: 1,
    })
    v1.close()

    const v2 = new UpgradeProbeDb(name)
    const row = await v2.vendors.get('a')
    expect(v2.verno).toBe(2)
    expect(row?.name).toBe('ACME')
    expect(row?.city).toBe('')
    expect(await v2.vendors.where('city').equals('').count()).toBe(1)
    await v2.delete()
  })

  it('rejects a payload from an older schema version instead of importing it', () => {
    const result = validateEnvelope({ ...makeEnvelope(), schemaVersion: 0 })
    expect(result).toMatchObject({ ok: false, error: { code: 'unsupported_schema' } })
  })
})
