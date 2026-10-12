import { describe, expect, it } from 'vitest'
import type { Attachment, Contact, Product, Vendor } from '../../src/db/models'
import {
  applyVendorQuery,
  buildSearchIndex,
  defaultVendorQuery,
  foldText,
  pickRowThumbs,
  type VendorQuery,
} from '../../src/features/vendors/vendorQuery'

function vendor(overrides: Partial<Vendor> & { id: string; name: string }): Vendor {
  return {
    type: 'supplier',
    status: 'lead',
    rating: 3,
    socials: [],
    tags: [],
    fair: {},
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function contact(vendorId: string, name: string, position?: string): Contact {
  return { id: `c-${name}`, vendorId, name, position, isPrimary: false, updatedAt: 1 }
}

function product(vendorId: string, name: string): Product {
  return {
    id: `p-${name}`,
    vendorId,
    name,
    currency: 'USD',
    tiers: [],
    photoAttachmentIds: [],
    createdAt: 1,
    updatedAt: 1,
  }
}

const vendors = [
  vendor({
    id: 'v1',
    name: 'Café Tools',
    country: 'China',
    status: 'quoted',
    rating: 5,
    tags: ['led'],
    fair: { edition: '140th Canton Fair', hall: 'A', booth: '11.2' },
  }),
  vendor({ id: 'v2', name: '柏林金属', country: 'Germany', status: 'lead', rating: 3 }),
  vendor({ id: 'v3', name: 'Acme', country: 'China', status: 'ordered', rating: 4 }),
]
const contacts = [
  contact('v2', 'Li Wei', 'Sales'),
  contact('v1', 'Zhang Min', 'Sales'),
]
const products = [product('v3', 'Laser Cutter')]
// Add phone/wechat to v1's contact — use direct db models
const contactsExtended = contacts.map((c) => {
  if (c.vendorId === 'v1' && c.name === 'Zhang Min') {
    return { ...c, phone: '+86 138-0013 8000', wechat: 'zhangmin_wx', email: 'zm@cafe.example' }
  }
  return c
})
const index = buildSearchIndex(vendors, contactsExtended, products)

function query(overrides: Partial<VendorQuery> = {}): VendorQuery {
  return { ...defaultVendorQuery, ...overrides }
}

function ids(result: Vendor[]): string[] {
  return result.map((item) => item.id)
}

describe('foldText', () => {
  it('strips diacritics and lowercases', () => {
    expect(foldText('Café')).toBe('cafe')
    expect(foldText('  Ünïcode  ')).toBe('unicode')
  })
})

describe('buildSearchIndex + applyVendorQuery', () => {
  it('matches a vendor name diacritic-insensitively', () => {
    expect(ids(applyVendorQuery(vendors, index, query({ text: 'cafe' })))).toEqual(['v1'])
  })

  it('matches a representative name', () => {
    expect(ids(applyVendorQuery(vendors, index, query({ text: 'li wei' })))).toEqual(['v2'])
  })

  it('matches a product name', () => {
    expect(ids(applyVendorQuery(vendors, index, query({ text: 'laser' })))).toEqual(['v3'])
  })

  it('matches a tag', () => {
    expect(ids(applyVendorQuery(vendors, index, query({ text: 'led' })))).toEqual(['v1'])
  })

  it('filters by status AND country together', () => {
    const result = applyVendorQuery(
      vendors,
      index,
      query({ filters: { status: 'quoted', country: 'China', type: 'all', minRating: 0, fair: 'all', tag: 'all' } }),
    )
    expect(ids(result)).toEqual(['v1'])
  })

  it('filters by country', () => {
    const result = applyVendorQuery(
      vendors,
      index,
      query({ filters: { status: 'all', country: 'Germany', type: 'all', minRating: 0, fair: 'all', tag: 'all' } }),
    )
    expect(ids(result)).toEqual(['v2'])
  })

  it('filters by minimum rating', () => {
    const result = applyVendorQuery(
      vendors,
      index,
      query({ filters: { status: 'all', country: 'all', type: 'all', minRating: 5, fair: 'all', tag: 'all' } }),
    )
    expect(ids(result)).toEqual(['v1'])
  })

  it('sorts by rating then name', () => {
    expect(ids(applyVendorQuery(vendors, index, query({ sort: 'rating' })))).toEqual([
      'v1',
      'v3',
      'v2',
    ])
  })

  it('sorts by name', () => {
    const result = ids(applyVendorQuery(vendors, index, query({ sort: 'name' })))
    expect(result).toHaveLength(3)
    expect(result[0]).toBe('v3')
  })

  it('returns every non-deleted vendor for an empty query', () => {
    expect(applyVendorQuery(vendors, index, defaultVendorQuery)).toHaveLength(3)
  })

  it('excludes soft-deleted vendors', () => {
    const withDeleted = [...vendors, vendor({ id: 'v4', name: 'Gone', deletedAt: 5 })]
    const built = buildSearchIndex(withDeleted, [], [])
    expect(ids(applyVendorQuery(withDeleted, built, defaultVendorQuery))).toEqual([
      'v3',
      'v1',
      'v2',
    ])
  })

  it('C1: matches a booth number', () => {
    expect(ids(applyVendorQuery(vendors, index, query({ text: '11.2' })))).toEqual(['v1'])
  })

  it('C1: matches a phone number by digits-only', () => {
    expect(ids(applyVendorQuery(vendors, index, query({ text: '8613800138000' })))).toEqual(['v1'])
  })

  it('C1: matches a WeChat ID', () => {
    expect(ids(applyVendorQuery(vendors, index, query({ text: 'zhangmin_wx' })))).toEqual(['v1'])
  })

  it('C1: matches a fair edition', () => {
    expect(ids(applyVendorQuery(vendors, index, query({ text: '140th' })))).toEqual(['v1'])
  })

  it('C1: matches an email', () => {
    expect(ids(applyVendorQuery(vendors, index, query({ text: 'zm@cafe.example' })))).toEqual(['v1'])
  })

  it('scans 500 vendors in under 100 ms', () => {
    const many = Array.from({ length: 500 }, (_, i) =>
      vendor({ id: `v${i}`, name: `Vendor ${i}`, country: i % 2 ? 'China' : 'Germany' }),
    )
    const built = buildSearchIndex(many, [], [])
    const start = performance.now()
    applyVendorQuery(many, built, query({ text: 'vendor 42' }))
    expect(performance.now() - start).toBeLessThan(100)
  })
})

describe('pickRowThumbs (C6)', () => {
  function att(id: string, vendorId: string, kind: Attachment['kind'], createdAt: number): Attachment {
    const thumb = new Blob([id], { type: 'image/jpeg' })
    return { id, vendorId, kind, blob: thumb, thumb, width: 1, height: 1, bytes: 1, createdAt, updatedAt: createdAt }
  }

  it('prefers the business card, then a booth photo, then the earliest photo', async () => {
    const thumbs = pickRowThumbs([
      att('p1', 'v1', 'product', 1),
      att('c1', 'v1', 'business_card', 5),
      att('p2', 'v2', 'product', 3),
      att('b2', 'v2', 'booth', 4),
      att('p3', 'v3', 'product', 9),
      att('o3', 'v3', 'other', 2),
    ])
    expect([...thumbs.keys()].sort()).toEqual(['v1', 'v2', 'v3'])
    const ids = await Promise.all(['v1', 'v2', 'v3'].map((id) => thumbs.get(id)!.text()))
    expect(ids).toEqual(['c1', 'b2', 'o3'])
  })

  it('returns no entry for a vendor without photos', () => {
    expect(pickRowThumbs([]).size).toBe(0)
  })
})
