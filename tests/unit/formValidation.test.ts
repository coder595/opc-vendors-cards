import { describe, expect, it } from 'vitest'
import { validateVendorDraft } from '../../src/lib/formValidation'
import {
  createEmptyDraft,
  type PhotoDraft,
  type ProductDraft,
} from '../../src/features/vendors/formState'

function product(overrides: Partial<ProductDraft> = {}): ProductDraft {
  return {
    key: 'p1',
    name: '',
    description: '',
    unit: '',
    currency: '',
    price: '',
    moq: '',
    leadTimeDays: '',
    paymentTerms: '',
    tiers: [],
    photoKeys: [],
    ...overrides,
  }
}

function photo(key: string, kind: PhotoDraft['kind']): PhotoDraft {
  return {
    key,
    kind,
    image: { blob: new Blob(['x']), thumb: new Blob(['y']), width: 1, height: 1, bytes: 1 },
    previewUrl: `blob:mock-${key}`,
  }
}

describe('validateVendorDraft', () => {
  it('requires a vendor name', () => {
    const result = validateVendorDraft(createEmptyDraft())
    expect(result.errors['vendor.name']).toBeDefined()
    expect(result.bundle).toBeNull()
  })

  it('builds a bundle for a minimal vendor and trims the name', () => {
    const draft = { ...createEmptyDraft(), name: '  ACME  ' }
    const result = validateVendorDraft(draft)
    expect(result.bundle?.vendor.name).toBe('ACME')
    expect(result.errors).toEqual({})
  })

  it('drops fully blank contact rows', () => {
    const draft = createEmptyDraft()
    draft.name = 'ACME'
    draft.contacts = [
      {
        key: 'c1',
        name: '',
        position: '',
        phone: '',
        email: '',
        wechat: '',
        whatsapp: '',
        isPrimary: false,
      },
    ]
    expect(validateVendorDraft(draft).bundle?.contacts).toHaveLength(0)
  })

  it('requires a name on a partially filled contact', () => {
    const draft = createEmptyDraft()
    draft.name = 'ACME'
    draft.contacts = [
      {
        key: 'c1',
        name: '',
        position: '',
        phone: '123',
        email: '',
        wechat: '',
        whatsapp: '',
        isPrimary: false,
      },
    ]
    const result = validateVendorDraft(draft)
    expect(result.errors['contacts.c1.name']).toBeDefined()
    expect(result.bundle).toBeNull()
  })

  it('rejects a negative price', () => {
    const draft = createEmptyDraft()
    draft.name = 'ACME'
    draft.products = [product({ name: 'Drill', price: '-1' })]
    expect(validateVendorDraft(draft).errors['products.p1.price']).toBeDefined()
  })

  it('parses numbers and uppercases the currency', () => {
    const draft = createEmptyDraft()
    draft.name = 'ACME'
    draft.products = [
      product({ name: 'Drill', currency: 'cny', price: '12.5', moq: '100', leadTimeDays: '30' }),
    ]
    const result = validateVendorDraft(draft)
    expect(result.bundle?.products[0]).toMatchObject({
      currency: 'CNY',
      price: 12.5,
      moq: 100,
      leadTimeDays: 30,
    })
  })

  it('rejects a malformed currency code', () => {
    const draft = createEmptyDraft()
    draft.name = 'ACME'
    draft.products = [product({ name: 'Drill', currency: 'RMBX' })]
    expect(validateVendorDraft(draft).errors['products.p1.currency']).toBeDefined()
  })

  it('carries socials, tags and product tiers untouched', () => {
    const draft = createEmptyDraft()
    draft.name = 'ACME'
    draft.socials = [{ platform: 'wechat', value: 'acme_wx' }]
    draft.tags = ['tools']
    draft.products = [
      product({
        name: 'Drill',
        tiers: [{ key: 't1', minQty: '10', unitPrice: '9' }],
      }),
    ]
    const result = validateVendorDraft(draft)
    expect(result.bundle?.vendor.socials).toEqual([{ platform: 'wechat', value: 'acme_wx' }])
    expect(result.bundle?.vendor.tags).toEqual(['tools'])
    expect(result.bundle?.products[0]?.tiers).toEqual([{ minQty: 10, unitPrice: 9 }])
  })

  it('sorts tiers by quantity and drops blank rows', () => {
    const draft = createEmptyDraft()
    draft.name = 'ACME'
    draft.products = [
      product({
        name: 'Drill',
        tiers: [
          { key: 't2', minQty: '100', unitPrice: '8' },
          { key: 'blank', minQty: '', unitPrice: '' },
          { key: 't1', minQty: '10', unitPrice: '9' },
        ],
      }),
    ]
    const result = validateVendorDraft(draft)
    expect(result.bundle?.products[0]?.tiers).toEqual([
      { minQty: 10, unitPrice: 9 },
      { minQty: 100, unitPrice: 8 },
    ])
  })

  it('rejects invalid or duplicate tier quantities', () => {
    const draft = createEmptyDraft()
    draft.name = 'ACME'
    draft.products = [
      product({
        name: 'Drill',
        tiers: [
          { key: 't1', minQty: '0', unitPrice: '9' },
          { key: 't2', minQty: '10', unitPrice: '5' },
          { key: 't3', minQty: '10', unitPrice: '5' },
          { key: 't4', minQty: '20', unitPrice: '-1' },
        ],
      }),
    ]
    const result = validateVendorDraft(draft)
    expect(result.errors['products.p1.tiers.t1.minQty']).toBeDefined()
    expect(result.errors['products.p1.tiers.t3.minQty']).toBeDefined()
    expect(result.errors['products.p1.tiers.t4.unitPrice']).toBeDefined()
    expect(result.bundle).toBeNull()
  })

  it('rejects a tier with a quantity but no price', () => {
    const draft = createEmptyDraft()
    draft.name = 'ACME'
    draft.products = [
      product({ name: 'Drill', tiers: [{ key: 't1', minQty: '10', unitPrice: '' }] }),
    ]
    const result = validateVendorDraft(draft)
    expect(result.errors['products.p1.tiers.t1.unitPrice']).toBeDefined()
    expect(result.bundle).toBeNull()
  })

  it('excludes photos that are no longer referenced by a contact or product', () => {
    const draft = createEmptyDraft()
    draft.name = 'ACME'
    draft.photos = [photo('orphan', 'product'), photo('booth', 'booth')]
    const result = validateVendorDraft(draft)
    expect(result.bundle?.photos.map((item) => item.key)).toEqual(['booth'])
  })
})
