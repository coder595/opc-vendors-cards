import { STATUS_LABEL, TYPE_LABEL } from '../db/labels'
import type { Contact, LandedCostSettings, Product, Vendor } from '../db/models'
import { convertToBase, currencyDecimals, type RateMap } from './currency'
import { cartonCbm, landedUnitCost } from './landedCost'

const DANGEROUS_PREFIX = /^[=+\-@\t\r\n]/
const PHONE_SHAPE = /^\+?[\d\s().-]{6,}$/

/** Quotes and formula-guards a single CSV cell (architecture.md §9). */
export function csvCell(value: string | number | undefined | null): string {
  const raw = value === undefined || value === null ? '' : String(value)
  const guarded = DANGEROUS_PREFIX.test(raw) && !PHONE_SHAPE.test(raw) ? `'${raw}` : raw
  if (/[",\r\n]/.test(guarded)) return `"${guarded.replace(/"/g, '""')}"`
  return guarded
}

export function toCsv(rows: (string | number | undefined)[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
}

const HEADER = [
  'Name',
  'Type',
  'Status',
  'Rating',
  'Country',
  'City',
  'Address',
  'Website',
  'Primary contact',
  'Phone',
  'Email',
  'WeChat',
  'WhatsApp',
  'Reps',
  'Products',
  'Tags',
  'Fair edition',
  'Hall',
  'Booth',
  'Description',
  'Created',
  'Updated',
]

export function buildVendorCsv(
  vendors: Vendor[],
  contacts: Contact[],
  products: Product[],
): string {
  const contactsByVendor = new Map<string, Contact[]>()
  for (const contact of contacts) {
    const list = contactsByVendor.get(contact.vendorId)
    if (list) list.push(contact)
    else contactsByVendor.set(contact.vendorId, [contact])
  }
  const productCounts = new Map<string, number>()
  for (const product of products) {
    productCounts.set(product.vendorId, (productCounts.get(product.vendorId) ?? 0) + 1)
  }

  const rows: (string | number | undefined)[][] = [HEADER]
  for (const vendor of vendors) {
    const vendorContacts = contactsByVendor.get(vendor.id) ?? []
    const primary = vendorContacts.find((contact) => contact.isPrimary) ?? vendorContacts[0]
    const productCount = productCounts.get(vendor.id) ?? 0
    rows.push([
      vendor.name,
      TYPE_LABEL[vendor.type],
      STATUS_LABEL[vendor.status],
      vendor.rating,
      vendor.country,
      vendor.city,
      vendor.address,
      vendor.website,
      primary?.name,
      primary?.phone,
      primary?.email,
      primary?.wechat,
      primary?.whatsapp,
      vendorContacts.length,
      productCount,
      vendor.tags.join('; '),
      vendor.fair.edition,
      vendor.fair.hall,
      vendor.fair.booth,
      vendor.description,
      new Date(vendor.createdAt).toISOString(),
      new Date(vendor.updatedAt).toISOString(),
    ])
  }
  // UTF-8 BOM so Excel detects the encoding for CJK text.
  return `\uFEFF${toCsv(rows)}`
}

/** One row per product, for supplier price-comparison sheets (D6). */
export function buildProductCsv(
  vendors: Vendor[],
  products: Product[],
  base: string,
  rates: RateMap,
  landed?: LandedCostSettings,
): string {
  const decimals = currencyDecimals(base)
  const vendorById = new Map(vendors.map((vendor) => [vendor.id, vendor]))
  const rows: (string | number | undefined)[][] = [
    [
      'Vendor',
      'Hall',
      'Booth',
      'Product',
      'Unit',
      'Currency',
      'Price',
      `Price (${base})`,
      'MOQ',
      'Order qty',
      'Tier breaks',
      'Lead time (days)',
      'Payment terms',
      'Vendor rating',
      'Tags',
      'Incoterm',
      'Pcs per carton',
      'Carton (cm)',
      'CBM',
      'Gross kg',
      `Landed (${base})`,
    ],
  ]
  for (const product of products) {
    const vendor = vendorById.get(product.vendorId)
    if (!vendor) continue
    const basePrice =
      product.price === undefined
        ? null
        : convertToBase(product.price, product.currency, base, rates)
    const cbm = cartonCbm(product)
    const landedCost = landedUnitCost(product, { baseCurrency: base, rates, landed }) ?? undefined
    rows.push([
      vendor.name,
      vendor.fair.hall,
      vendor.fair.booth,
      product.name,
      product.unit,
      product.currency,
      product.price,
      basePrice === null ? undefined : basePrice.toFixed(decimals),
      product.moq,
      product.orderQty,
      product.tiers.map((tier) => `${tier.minQty}: ${tier.unitPrice}`).join('; '),
      product.leadTimeDays,
      product.paymentTerms,
      vendor.rating,
      vendor.tags.join('; '),
      product.incoterm,
      product.pcsPerCarton,
      cbm === null
        ? undefined
        : `${product.cartonLengthCm}x${product.cartonWidthCm}x${product.cartonHeightCm}`,
      cbm?.toFixed(3),
      product.cartonGrossKg,
      landedCost?.toFixed(decimals),
    ])
  }
  return `\uFEFF${toCsv(rows)}`
}

export function csvFilename(date = new Date(), kind: 'vendors' | 'products' = 'vendors'): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `opc-${kind}-${year}-${month}-${day}.csv`
}
