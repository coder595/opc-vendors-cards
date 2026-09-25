import type {
  AttachmentKind,
  FairRef,
  PipelineStatus,
  ProcessedImage,
  Rating,
  SocialLink,
  VendorType,
} from '../../db/models'

export function newKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `key-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
  )
}

export interface PhotoDraft {
  key: string
  kind: AttachmentKind
  image: ProcessedImage
  previewUrl: string
}

export interface ContactDraft {
  key: string
  name: string
  position: string
  phone: string
  email: string
  wechat: string
  whatsapp: string
  isPrimary: boolean
  cardPhotoKey?: string
}

export interface TierDraft {
  key: string
  minQty: string
  unitPrice: string
}

export interface ProductDraft {
  key: string
  name: string
  description: string
  unit: string
  currency: string
  price: string
  moq: string
  leadTimeDays: string
  paymentTerms: string
  tiers: TierDraft[]
  photoKeys: string[]
}

export interface VendorDraft {
  name: string
  type: VendorType
  status: PipelineStatus
  rating: Rating
  country: string
  city: string
  address: string
  website: string
  description: string
  socials: SocialLink[]
  tags: string[]
  fair: FairRef
  revisit: boolean
  contacts: ContactDraft[]
  products: ProductDraft[]
  photos: PhotoDraft[]
}

export type ScalarField =
  'name' | 'type' | 'status' | 'rating' | 'country' | 'city' | 'address' | 'website' | 'description'

export type VendorAction =
  | { type: 'setField'; field: ScalarField; value: VendorDraft[ScalarField] }
  | { type: 'setFair'; field: keyof FairRef; value: string }
  | { type: 'addContact'; key: string }
  | { type: 'updateContact'; key: string; patch: Partial<ContactDraft> }
  | { type: 'removeContact'; key: string }
  | { type: 'setPrimaryContact'; key: string }
  | { type: 'addProduct'; key: string }
  | { type: 'updateProduct'; key: string; patch: Partial<ProductDraft> }
  | { type: 'removeProduct'; key: string }
  | { type: 'addPhoto'; photo: PhotoDraft; contactKey?: string; productKey?: string }
  | { type: 'removePhoto'; key: string }
  | { type: 'load'; draft: VendorDraft }

export function createEmptyContact(key: string): ContactDraft {
  return {
    key,
    name: '',
    position: '',
    phone: '',
    email: '',
    wechat: '',
    whatsapp: '',
    isPrimary: false,
  }
}

export function createEmptyProduct(key: string): ProductDraft {
  return {
    key,
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
  }
}

export function createEmptyTier(key: string): TierDraft {
  return { key, minQty: '', unitPrice: '' }
}

export function createEmptyDraft(): VendorDraft {
  return {
    name: '',
    type: 'supplier',
    status: 'lead',
    rating: 3,
    country: '',
    city: '',
    address: '',
    website: '',
    description: '',
    socials: [],
    tags: [],
    fair: { edition: '', hall: '', booth: '', note: '' },
    revisit: false,
    contacts: [],
    products: [],
    photos: [],
  }
}

export function vendorReducer(draft: VendorDraft, action: VendorAction): VendorDraft {
  switch (action.type) {
    case 'setField':
      return { ...draft, [action.field]: action.value } as VendorDraft
    case 'setFair':
      return { ...draft, fair: { ...draft.fair, [action.field]: action.value } as FairRef }
    case 'addContact':
      return { ...draft, contacts: [...draft.contacts, createEmptyContact(action.key)] }
    case 'updateContact':
      return {
        ...draft,
        contacts: draft.contacts.map((contact) =>
          contact.key === action.key ? { ...contact, ...action.patch } : contact,
        ),
      }
    case 'removeContact':
      return { ...draft, contacts: draft.contacts.filter((contact) => contact.key !== action.key) }
    case 'setPrimaryContact':
      return {
        ...draft,
        contacts: draft.contacts.map((contact) => ({
          ...contact,
          isPrimary: contact.key === action.key,
        })),
      }
    case 'addProduct':
      return { ...draft, products: [...draft.products, createEmptyProduct(action.key)] }
    case 'updateProduct':
      return {
        ...draft,
        products: draft.products.map((product) =>
          product.key === action.key ? { ...product, ...action.patch } : product,
        ),
      }
    case 'removeProduct':
      return { ...draft, products: draft.products.filter((product) => product.key !== action.key) }
    case 'addPhoto': {
      let photos = [...draft.photos, action.photo]
      let contacts = draft.contacts
      let products = draft.products
      if (action.contactKey) {
        const previousCardKey = draft.contacts.find(
          (contact) => contact.key === action.contactKey,
        )?.cardPhotoKey
        if (previousCardKey) {
          photos = photos.filter((photo) => photo.key !== previousCardKey)
        }
        contacts = draft.contacts.map((contact) =>
          contact.key === action.contactKey
            ? { ...contact, cardPhotoKey: action.photo.key }
            : contact,
        )
      }
      if (action.productKey) {
        products = draft.products.map((product) =>
          product.key === action.productKey
            ? { ...product, photoKeys: [...product.photoKeys, action.photo.key] }
            : product,
        )
      }
      return { ...draft, photos, contacts, products }
    }
    case 'removePhoto':
      return {
        ...draft,
        photos: draft.photos.filter((photo) => photo.key !== action.key),
        contacts: draft.contacts.map((contact) =>
          contact.cardPhotoKey === action.key ? { ...contact, cardPhotoKey: undefined } : contact,
        ),
        products: draft.products.map((product) => ({
          ...product,
          photoKeys: product.photoKeys.filter((key) => key !== action.key),
        })),
      }
    case 'load':
      return action.draft
    default:
      return draft
  }
}
