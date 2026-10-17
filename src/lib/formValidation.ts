import type { VendorBundleDraft } from '../data/bundle'
import { LIMITS } from './validate'
import type { VendorDraft } from '../features/vendors/formState'
import type { Incoterm, PriceTier } from '../db/models'
import { INCOTERMS } from './landedCost'

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
  max = Number.POSITIVE_INFINITY,
): number | undefined {
  const trimmed = raw.trim()
  if (trimmed === '') return undefined
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < 0 || value > max) {
    errors[path] = label
    return undefined
  }
  return value
}

/** Like parseOptionalNumber, but zero is an error (a carton of 0 pcs or 0 cm is a typo). */
function parseOptionalPositive(
  raw: string,
  path: string,
  label: string,
  errors: Record<string, string>,
): number | undefined {
  const value = parseOptionalNumber(raw, path, label, errors, 1_000_000)
  if (value === 0) errors[path] = label
  return value === 0 ? undefined : value
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
      product.incoterm,
      product.orderQty,
      product.pcsPerCarton,
      product.cartonLengthCm,
      product.cartonWidthCm,
      product.cartonHeightCm,
      product.cartonGrossKg,
    ].some((value) => (value ?? '').toString().trim() !== '') ||
    product.photoKeys.length > 0 ||
    product.tiers.some((tier) => tier.minQty.trim() !== '' || tier.unitPrice.trim() !== '')
  )
}

export function validateVendorDraft(draft: VendorDraft, defaultCurrency = 'USD'): DraftValidation {
  const errors: Record<string, string> = {}

  const name = draft.name.trim()
  if (name === '') errors['vendor.name'] = 'Enter a company name'
  else if (name.length > LIMITS.maxStringLength) errors['vendor.name'] = 'Name is too long'

  const contacts = draft.contacts.filter(contactHasContent).map((contact) => {
    const contactName = contact.name.trim()
    if (contactName === '') errors[`contacts.${contact.key}.name`] = 'Enter a name'
    return {
      key: contact.key,
      id: contact.id,
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
    const path = `products.${product.key}`
    const productName = product.name.trim()
    if (productName === '') errors[`products.${product.key}.name`] = 'Enter a product name'

    const currencyRaw = product.currency.trim().toUpperCase()
    let currency = defaultCurrency
    if (currencyRaw !== '') {
      if (CURRENCY_RE.test(currencyRaw)) currency = currencyRaw
      else errors[`products.${product.key}.currency`] = 'Use a 3-letter code'
    }

    const tiers: PriceTier[] = []
    const seenQty = new Set<number>()
    for (const tier of product.tiers) {
      const minQtyRaw = tier.minQty.trim()
      const unitPriceRaw = tier.unitPrice.trim()
      if (minQtyRaw === '' && unitPriceRaw === '') continue
      const minQty = Number(minQtyRaw)
      const unitPrice = Number(unitPriceRaw)
      const path = `products.${product.key}.tiers.${tier.key}`
      const qtyValid = Number.isInteger(minQty) && minQty >= 1
      const priceValid =
        unitPriceRaw !== '' &&
        Number.isFinite(unitPrice) &&
        unitPrice >= 0 &&
        unitPrice <= LIMITS.maxMoney
      if (!qtyValid) errors[`${path}.minQty`] = 'Enter a whole quantity of 1 or more'
      if (!priceValid) errors[`${path}.unitPrice`] = 'Enter a valid price'
      if (qtyValid && seenQty.has(minQty)) {
        errors[`${path}.minQty`] = 'Duplicate quantity'
        continue
      }
      if (qtyValid && priceValid) {
        seenQty.add(minQty)
        tiers.push({ minQty, unitPrice })
      }
    }
    tiers.sort((a, b) => a.minQty - b.minQty)

    return {
      key: product.key,
      id: product.id,
      name: productName,
      description: blankToUndefined(product.description),
      unit: blankToUndefined(product.unit),
      currency,
      price: parseOptionalNumber(
        product.price,
        `products.${product.key}.price`,
        'Enter a valid price',
        errors,
        LIMITS.maxMoney,
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
      incoterm: (INCOTERMS as readonly string[]).includes(product.incoterm)
        ? (product.incoterm as Incoterm)
        : undefined,
      orderQty: parseOptionalPositive(product.orderQty, `${path}.orderQty`, 'Enter a quantity of 1 or more', errors),
      pcsPerCarton: parseOptionalPositive(product.pcsPerCarton, `${path}.pcsPerCarton`, 'Enter pieces per carton', errors),
      cartonLengthCm: parseOptionalPositive(product.cartonLengthCm, `${path}.cartonLengthCm`, 'Enter a length in cm', errors),
      cartonWidthCm: parseOptionalPositive(product.cartonWidthCm, `${path}.cartonWidthCm`, 'Enter a width in cm', errors),
      cartonHeightCm: parseOptionalPositive(product.cartonHeightCm, `${path}.cartonHeightCm`, 'Enter a height in cm', errors),
      cartonGrossKg: parseOptionalPositive(product.cartonGrossKg, `${path}.cartonGrossKg`, 'Enter a weight in kg', errors),
      tiers,
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
