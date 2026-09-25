import { describe, expect, it } from 'vitest'
import type { Contact, Product, Vendor } from '../../src/db/models'
import {
  applyVendorQuery,
  buildSearchIndex,
  defaultVendorQuery,
  foldText,
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
  return { id: `c-${name}`, vendorId, name, position, isPrimary: false }
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
  }),
  vendor({ id: 'v2', name: '柏林金属', country: 'Germany', status: 'lead', rating: 3 }),
  vendor({ id: 'v3', name: 'Acme', country: 'China', status: 'ordered', rating: 4 }),
]
const contacts = [contact('v2', 'Li Wei', 'Sales')]
const products = [product('v3', 'Laser Cutter')]
const index = buildSearchIndex(vendors, contacts, products)

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
