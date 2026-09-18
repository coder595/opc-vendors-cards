import type { VendorBundleDraft } from '../data/bundle'
import { LIMITS } from './validate'
import type { VendorDraft } from '../features/vendors/formState'

export interface DraftValidation {
  errors: Record<string, string>
  bundle: VendorBundleDraft | null
}

const CURRENCY_RE = /^[A-Z]{3}$/

function blankToUndefined(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

function parseOptionalNumber(
  raw: string,
  path: string,
  label: string,
  errors: Record<string, string>,
): number | undefined {
  const trimmed = raw.trim()
  if (trimmed === '') return undefined
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < 0) {
    errors[path] = label
    return undefined
  }
  return value
}

function contactHasContent(contact: VendorDraft['contacts'][number]): boolean {
  return [
    contact.name,
    contact.position,
    contact.phone,
    contact.email,
    contact.wechat,
    contact.whatsapp,
    contact.cardPhotoKey,
  ].some((value) => (value ?? '').toString().trim() !== '')
}

function productHasContent(product: VendorDraft['products'][number]): boolean {
  return (
    [
      product.name,
      product.unit,
      product.currency,
      product.price,
      product.moq,
      product.leadTimeDays,
      product.paymentTerms,
    ].some((value) => (value ?? '').toString().trim() !== '') || product.photoKeys.length > 0
  )
}

export function validateVendorDraft(draft: VendorDraft): DraftValidation {
  const errors: Record<string, string> = {}

  const name = draft.name.trim()
  if (name === '') errors['vendor.name'] = 'Enter a company name'
  else if (name.length > LIMITS.maxStringLength) errors['vendor.name'] = 'Name is too long'

  const contacts = draft.contacts.filter(contactHasContent).map((contact) => {
    const contactName = contact.name.trim()
    if (contactName === '') errors[`contacts.${contact.key}.name`] = 'Enter a name'
    return {
      key: contact.key,
      name: contactName,
      position: blankToUndefined(contact.position),
      phone: blankToUndefined(contact.phone),
      email: blankToUndefined(contact.email),
      wechat: blankToUndefined(contact.wechat),
      whatsapp: blankToUndefined(contact.whatsapp),
      isPrimary: contact.isPrimary,
      cardPhotoKey: contact.cardPhotoKey,
    }
  })

  const products = draft.products.filter(productHasContent).map((product) => {
    const productName = product.name.trim()
    if (productName === '') errors[`products.${product.key}.name`] = 'Enter a product name'

    const currencyRaw = product.currency.trim().toUpperCase()
    let currency = 'USD'
    if (currencyRaw !== '') {
      if (CURRENCY_RE.test(currencyRaw)) currency = currencyRaw
      else errors[`products.${product.key}.currency`] = 'Use a 3-letter code'
    }

    return {
      key: product.key,
      name: productName,
      description: blankToUndefined(product.description),
      unit: blankToUndefined(product.unit),
      currency,
      price: parseOptionalNumber(
        product.price,
        `products.${product.key}.price`,
        'Enter a valid price',
        errors,
      ),
      moq: parseOptionalNumber(
        product.moq,
        `products.${product.key}.moq`,
        'Enter a valid quantity',
        errors,
      ),
      leadTimeDays: parseOptionalNumber(
        product.leadTimeDays,
        `products.${product.key}.leadTimeDays`,
        'Enter valid days',
        errors,
      ),
      paymentTerms: blankToUndefined(product.paymentTerms),
      tiers: product.tiers,
      photoKeys: product.photoKeys,
    }
  })

  const referencedPhotoKeys = new Set<string>()
  for (const contact of contacts) {
    if (contact.cardPhotoKey) referencedPhotoKeys.add(contact.cardPhotoKey)
  }
  for (const product of products) {
    for (const key of product.photoKeys) referencedPhotoKeys.add(key)
  }
  const photos = draft.photos
    .filter((photo) =>
      photo.kind !== 'business_card' && photo.kind !== 'product'
        ? true
        : referencedPhotoKeys.has(photo.key),
    )
    .map((photo) => ({ key: photo.key, kind: photo.kind, image: photo.image }))

  const bundle: VendorBundleDraft | null =
    Object.keys(errors).length > 0
      ? null
      : {
          vendor: {
            name,
            type: draft.type,
            status: draft.status,
            rating: draft.rating,
            country: blankToUndefined(draft.country),
            city: blankToUndefined(draft.city),
            address: blankToUndefined(draft.address),
            website: blankToUndefined(draft.website),
            description: blankToUndefined(draft.description),
            socials: draft.socials,
            tags: draft.tags,
            fair: {
              edition: blankToUndefined(draft.fair.edition ?? ''),
              hall: blankToUndefined(draft.fair.hall ?? ''),
              booth: blankToUndefined(draft.fair.booth ?? ''),
              note: blankToUndefined(draft.fair.note ?? ''),
            },
          },
          contacts,
          products,
          photos,
        }

  return { errors, bundle }
}
