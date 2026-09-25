// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, SCHEMA_VERSION } from '../../src/db/schema'
import { resetDb } from './helpers/db'

describe('dexie schema', () => {
  beforeEach(resetDb)
  afterEach(resetDb)

  it('declares all eight stores', () => {
    const names = db.tables.map((table) => table.name).sort()
    expect(names).toEqual([
      'attachments',
      'certs',
      'contacts',
      'drafts',
      'notes',
      'products',
      'settings',
      'vendors',
    ])
  })

  it('keeps the payload schema version in lockstep with the Dexie version', () => {
    expect(SCHEMA_VERSION).toBe(db.verno)
  })

  it('exposes the vendor indexes from architecture §5', () => {
    const indexes = db
      .table('vendors')
      .schema.indexes.map((index) => index.name)
      .sort()
    expect(indexes).toEqual(['country', 'name', 'status', 'tags', 'updatedAt'])
    const tags = db.table('vendors').schema.indexes.find((index) => index.name === 'tags')
    expect(tags?.multi).toBe(true)
  })
})
