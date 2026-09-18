import { describe, expect, it } from 'vitest'
import {
  createEmptyDraft,
  vendorReducer,
  type PhotoDraft,
} from '../../src/features/vendors/formState'

function photo(key: string, kind: PhotoDraft['kind'] = 'booth'): PhotoDraft {
  return {
    key,
    kind,
    image: { blob: new Blob(['x']), thumb: new Blob(['y']), width: 1, height: 1, bytes: 1 },
    previewUrl: `blob:mock-${key}`,
  }
}

describe('vendorReducer', () => {
  it('sets scalar and fair fields', () => {
    let draft = createEmptyDraft()
    draft = vendorReducer(draft, { type: 'setField', field: 'name', value: 'ACME' })
    draft = vendorReducer(draft, { type: 'setFair', field: 'booth', value: 'A12' })
    expect(draft.name).toBe('ACME')
    expect(draft.fair.booth).toBe('A12')
  })

  it('keeps exactly one primary contact', () => {
    let draft = createEmptyDraft()
    draft = vendorReducer(draft, { type: 'addContact', key: 'c1' })
    draft = vendorReducer(draft, { type: 'addContact', key: 'c2' })
    draft = vendorReducer(draft, { type: 'setPrimaryContact', key: 'c2' })
    expect(draft.contacts.map((contact) => contact.isPrimary)).toEqual([false, true])
  })

  it('links a photo to a product', () => {
    let draft = createEmptyDraft()
    draft = vendorReducer(draft, { type: 'addProduct', key: 'p1' })
    draft = vendorReducer(draft, {
      type: 'addPhoto',
      photo: photo('ph1', 'product'),
      productKey: 'p1',
    })
    expect(draft.products[0]?.photoKeys).toEqual(['ph1'])
    expect(draft.photos).toHaveLength(1)
  })

  it('retains photos in the draft after their product is removed', () => {
    let draft = createEmptyDraft()
    draft = vendorReducer(draft, { type: 'addProduct', key: 'p1' })
    draft = vendorReducer(draft, {
      type: 'addPhoto',
      photo: photo('ph1', 'product'),
      productKey: 'p1',
    })
    draft = vendorReducer(draft, { type: 'removeProduct', key: 'p1' })
    expect(draft.products).toHaveLength(0)
    expect(draft.photos).toHaveLength(1)
  })

  it('replaces a contact card photo and drops the previous one', () => {
    let draft = createEmptyDraft()
    draft = vendorReducer(draft, { type: 'addContact', key: 'c1' })
    draft = vendorReducer(draft, {
      type: 'addPhoto',
      photo: photo('card1', 'business_card'),
      contactKey: 'c1',
    })
    draft = vendorReducer(draft, {
      type: 'addPhoto',
      photo: photo('card2', 'business_card'),
      contactKey: 'c1',
    })
    expect(draft.contacts[0]?.cardPhotoKey).toBe('card2')
    expect(draft.photos.map((item) => item.key)).toEqual(['card2'])
  })

  it('unlinks a removed photo from products and contacts', () => {
    let draft = createEmptyDraft()
    draft = vendorReducer(draft, { type: 'addProduct', key: 'p1' })
    draft = vendorReducer(draft, { type: 'addContact', key: 'c1' })
    draft = vendorReducer(draft, {
      type: 'addPhoto',
      photo: photo('ph1', 'product'),
      productKey: 'p1',
    })
    draft = vendorReducer(draft, {
      type: 'addPhoto',
      photo: photo('ph2', 'business_card'),
      contactKey: 'c1',
    })
    draft = vendorReducer(draft, { type: 'removePhoto', key: 'ph1' })
    draft = vendorReducer(draft, { type: 'removePhoto', key: 'ph2' })
    expect(draft.products[0]?.photoKeys).toEqual([])
    expect(draft.contacts[0]?.cardPhotoKey).toBeUndefined()
  })
})
