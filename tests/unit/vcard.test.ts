import { describe, expect, it } from 'vitest'
import { buildVcard } from '../../src/lib/vcard'
import type { Contact } from '../../src/db/models'
import { makeVendor } from './helpers/fixtures'

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'c1',
    vendorId: 'v1',
    name: 'Jane Doe',
    isPrimary: true,
    updatedAt: 1,
    ...overrides,
  }
}

describe('buildVcard', () => {
  it('produces expected basic lines for a plain contact', () => {
    const vcard = buildVcard(
      makeContact({ name: 'Jane Doe', position: 'Manager', phone: '+1 555', email: 'jane@x.com' }),
      makeVendor({ name: 'ACME Corp' }),
    )
    const lines = vcard.split('\r\n')
    expect(lines).toContain('FN:Jane Doe')
    expect(lines).toContain('N:Doe;Jane;;;')
    expect(lines).toContain('ORG:ACME Corp')
    expect(lines).toContain('TITLE:Manager')
    expect(lines).toContain('TEL:+1 555')
    expect(lines).toContain('EMAIL:jane@x.com')
  })

  it('escapes a hostile contact name and does not inject a new property line', () => {
    const vcard = buildVcard(
      makeContact({ name: 'Evil\r\nEMAIL:x@y.z;foo,bar' }),
      makeVendor({ name: 'ACME' }),
    )
    const lines = vcard.split('\r\n')
    expect(lines.some((line) => line.startsWith('EMAIL:x@y'))).toBe(false)
    expect(vcard).toContain('Evil\\nEMAIL:x@y.z\\;foo\\,bar')
  })

  it('escapes commas, semicolons and backslashes in ORG/TITLE/NOTE fields', () => {
    const vcard = buildVcard(
      makeContact({ name: 'Bob', wechat: 'a,b;c\\d' }),
      makeVendor({ name: 'Co; Ltd, Inc\\' }),
    )
    expect(vcard).toContain('ORG:Co\\; Ltd\\, Inc\\\\')
    expect(vcard).toContain('WeChat: a\\,b\\;c\\\\d')
  })
})
