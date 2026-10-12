import { describe, expect, it } from 'vitest'
import { compareRows } from '../../src/features/trip/compare'
import type { Product } from '../../src/db/models'
import { makeVendor } from './helpers/fixtures'

function product(id: string, vendorId: string, patch: Partial<Product>): Product {
  return {
    id,
    vendorId,
    name: id,
    currency: 'USD',
    tiers: [],
    photoAttachmentIds: [],
    createdAt: 1,
    updatedAt: 1,
    ...patch,
  }
}

describe('compareRows', () => {
  const a = makeVendor({ name: 'A', tags: ['led'], rating: 3 })
  const b = makeVendor({ name: 'B', tags: ['led', 'cable'], rating: 5 })
  const c = makeVendor({ name: 'C', tags: ['cable'], rating: 4 })
  const products = [
    product('a1', a.id, { price: 10 }),
    product('b1', b.id, { price: 50, currency: 'CNY', moq: 100 }),
    product('b2', b.id, {}),
    product('c1', c.id, { price: 1 }),
  ]
  const rates = { CNY: 10 }

  it('keeps only products of vendors carrying the tag', () => {
    const rows = compareRows([a, b, c], products, 'led', 'USD', rates, 'price')
    expect(rows.map((row) => row.product.id)).toEqual(['b1', 'a1', 'b2'])
  })

  it('sorts by base price ascending with unknown prices last', () => {
    const rows = compareRows([a, b, c], products, 'led', 'USD', rates, 'price')
    expect(rows.map((row) => row.basePrice)).toEqual([5, 10, null])
  })

  it('sorts by rating descending', () => {
    const rows = compareRows([a, b, c], products, 'led', 'USD', rates, 'rating')
    expect(rows[0]?.vendor.name).toBe('B')
    expect(rows.at(-1)?.vendor.name).toBe('A')
  })

  it('sorts by MOQ with missing values last', () => {
    const rows = compareRows([a, b, c], products, 'led', 'USD', rates, 'moq')
    expect(rows[0]?.product.id).toBe('b1')
  })

  it('adds a landed cost per row and sorts by it (N2)', () => {
    const landed = { freightMode: 'percent' as const, freight: 10, dutyPercent: 0, vatPercent: 0 }
    const priced = [
      product('x', a.id, { price: 10, incoterm: 'FOB' }), // 10 + 10 % = 11
      product('y', b.id, { price: 105, currency: 'CNY', incoterm: 'CIF' }), // 10.5, no freight
    ]
    const rows = compareRows([a, b], priced, 'led', 'USD', rates, 'landed', landed)
    expect(rows.map((row) => row.product.id)).toEqual(['y', 'x'])
    expect(rows[0]?.landedCost).toBeCloseTo(10.5, 9)
    expect(rows[1]?.landedCost).toBeCloseTo(11, 9)
    expect(compareRows([a], priced, 'led', 'USD', rates, 'price')[0]?.landedCost).toBeNull()
  })
})
