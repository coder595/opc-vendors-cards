import type { LandedCostSettings, Product, Vendor } from '../../db/models'
import { convertToBase, type RateMap } from '../../lib/currency'
import { landedUnitCost } from '../../lib/landedCost'

export type CompareSort = 'price' | 'landed' | 'moq' | 'lead' | 'rating'

export interface CompareRow {
  product: Product
  vendor: Vendor
  basePrice: number | null
  /** Null when landed cost is off in Settings or can't be computed for this product (N2). */
  landedCost: number | null
}

/** Nulls sort last whatever the direction. */
function byValue(a: number | null | undefined, b: number | null | undefined, dir: 1 | -1): number {
  if (a == null) return b == null ? 0 : 1
  if (b == null) return -1
  return (a - b) * dir
}

/** Products of every vendor carrying `tag`, priced in the base currency (N3). */
export function compareRows(
  vendors: Vendor[],
  products: Product[],
  tag: string,
  base: string,
  rates: RateMap,
  sort: CompareSort,
  landed?: LandedCostSettings,
): CompareRow[] {
  const tagged = new Map(
    vendors.filter((vendor) => vendor.tags.includes(tag)).map((vendor) => [vendor.id, vendor]),
  )
  const rows: CompareRow[] = []
  for (const product of products) {
    const vendor = tagged.get(product.vendorId)
    if (!vendor) continue
    const basePrice =
      product.price === undefined
        ? null
        : convertToBase(product.price, product.currency, base, rates)
    const landedCost = landedUnitCost(product, { baseCurrency: base, rates, landed })
    rows.push({ product, vendor, basePrice, landedCost })
  }
  return rows.sort((a, b) => {
    switch (sort) {
      case 'price':
        return byValue(a.basePrice, b.basePrice, 1)
      case 'landed':
        return byValue(a.landedCost, b.landedCost, 1)
      case 'moq':
        return byValue(a.product.moq, b.product.moq, 1)
      case 'lead':
        return byValue(a.product.leadTimeDays, b.product.leadTimeDays, 1)
      case 'rating':
        return byValue(a.vendor.rating, b.vendor.rating, -1)
    }
  })
}
