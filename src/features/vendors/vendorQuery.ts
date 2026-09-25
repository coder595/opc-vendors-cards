import type { Contact, PipelineStatus, Product, Vendor, VendorType } from '../../db/models'

export interface VendorFilters {
  status: PipelineStatus | 'all'
  country: string | 'all'
  type: VendorType | 'all'
  minRating: number
}

export type VendorSort = 'name' | 'updated' | 'rating'

export interface VendorQuery {
  text: string
  filters: VendorFilters
  sort: VendorSort
}

export const defaultVendorQuery: VendorQuery = {
  text: '',
  filters: { status: 'all', country: 'all', type: 'all', minRating: 0 },
  sort: 'name',
}

export interface VendorSearchIndex {
  byVendor: Map<string, string>
  countries: string[]
  digitsByVendor: Map<string, string>
}

/** Case- and diacritic-insensitive fold; CJK passes through unchanged. */
export function foldText(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base' })

export function buildSearchIndex(
  vendors: Vendor[],
  contacts: Contact[],
  products: Product[],
): VendorSearchIndex {
  const childrenByVendor = new Map<string, string[]>()
  const push = (vendorId: string, text: string) => {
    const list = childrenByVendor.get(vendorId)
    if (list) list.push(text)
    else childrenByVendor.set(vendorId, [text])
  }
  for (const contact of contacts) {
    push(contact.vendorId, `${contact.name} ${contact.position ?? ''} ${contact.phone ?? ''} ${contact.email ?? ''} ${contact.wechat ?? ''} ${contact.whatsapp ?? ''}`)
  }
  for (const product of products) push(product.vendorId, `${product.name} ${product.description ?? ''}`)

  const byVendor = new Map<string, string>()
  const digitsByVendor = new Map<string, string>()
  const countries = new Set<string>()
  for (const vendor of vendors) {
    if (vendor.deletedAt !== undefined) continue
    const fair = vendor.fair
    const haystack = [
      vendor.name,
      vendor.type,
      vendor.status,
      vendor.country ?? '',
      vendor.city ?? '',
      vendor.website ?? '',
      vendor.description ?? '',
      fair.edition ?? '',
      fair.hall ?? '',
      fair.booth ?? '',
      fair.note ?? '',
      ...vendor.tags,
      ...(childrenByVendor.get(vendor.id) ?? []),
    ].join(' ')
    byVendor.set(vendor.id, foldText(haystack))
    const digitsHaystack = [
      ...(childrenByVendor.get(vendor.id) ?? []).map((t) => digitsOnly(t)),
    ].join(' ')
    digitsByVendor.set(vendor.id, digitsHaystack)
    if (vendor.country) countries.add(vendor.country)
  }
  return { byVendor, countries: [...countries].sort(collator.compare), digitsByVendor }
}

export function applyVendorQuery(
  vendors: Vendor[],
  index: VendorSearchIndex,
  query: VendorQuery,
): Vendor[] {
  const needle = foldText(query.text)
  const digitsNeedle = digitsOnly(query.text)
  const { status, country, type, minRating } = query.filters

  const filtered = vendors.filter((vendor) => {
    if (vendor.deletedAt !== undefined) return false
    if (status !== 'all' && vendor.status !== status) return false
    if (country !== 'all' && (vendor.country ?? '') !== country) return false
    if (type !== 'all' && vendor.type !== type) return false
    if (vendor.rating < minRating) return false
    if (needle !== '') {
      const textMatch = (index.byVendor.get(vendor.id) ?? '').includes(needle)
      const digitsMatch = digitsNeedle !== '' && (index.digitsByVendor?.get(vendor.id) ?? '').includes(digitsNeedle)
      if (!textMatch && !digitsMatch) return false
    }
    return true
  })

  return filtered.sort((a, b) => {
    if (query.sort === 'rating') return b.rating - a.rating || collator.compare(a.name, b.name)
    if (query.sort === 'updated')
      return b.updatedAt - a.updatedAt || collator.compare(a.name, b.name)
    return collator.compare(a.name, b.name)
  })
}
