import { SCHEMA_VERSION } from '../db/schema'
import type {
  AttachmentKind,
  Certification,
  Contact,
  ExportEnvelope,
  ExportedAttachment,
  FairRef,
  Note,
  PipelineStatus,
  PriceTier,
  Product,
  Rating,
  Settings,
  SocialLink,
  SocialPlatform,
  Theme,
  Vendor,
  VendorType,
} from '../db/models'
import { APP_ID } from './app'

export const LIMITS = {
  maxFileBytes: 250 * 1024 * 1024,
  maxJsonChars: 400 * 1024 * 1024,
  maxVendors: 50_000,
  maxContacts: 200_000,
  maxProducts: 200_000,
  maxNotes: 200_000,
  maxCerts: 200_000,
  maxAttachments: 100_000,
  maxAttachmentBytes: 20 * 1024 * 1024,
  maxTotalAttachmentBytes: 300 * 1024 * 1024,
  maxAttachmentB64Length: Math.ceil((20 * 1024 * 1024 * 4) / 3) + 4,
  maxStringLength: 10_000,
  maxNestedItems: 200,
  maxMoney: 1e12,
} as const

export interface RejectedRecord {
  table: string
  index: number
  id?: string
  reason: string
}

export type ImportErrorCode =
  | 'file_too_large'
  | 'bad_json'
  | 'bad_gzip'
  | 'bad_envelope'
  | 'unsupported_schema'
  | 'too_many_records'

export interface ImportFailure {
  code: ImportErrorCode
  message: string
}

export type ValidationResult =
  | { ok: true; envelope: ExportEnvelope; rejected: RejectedRecord[]; warnings: string[] }
  | { ok: false; error: ImportFailure }

function fail(code: ImportErrorCode, message: string): ValidationResult {
  return { ok: false, error: { code, message } }
}

const VENDOR_TYPES = new Set<VendorType>([
  'supplier',
  'dealer',
  'agent',
  'factory',
  'trader',
  'other',
])
const PIPELINE_STATUSES = new Set<PipelineStatus>([
  'lead',
  'contacted',
  'met',
  'quoted',
  'sample',
  'negotiating',
  'ordered',
  'archived',
])
const SOCIAL_PLATFORMS = new Set<SocialPlatform>([
  'wechat',
  'whatsapp',
  'alibaba',
  'linkedin',
  'instagram',
  'facebook',
  'other',
])
const ATTACHMENT_KINDS = new Set<AttachmentKind>([
  'business_card',
  'product',
  'booth',
  'document',
  'other',
])
const THEMES = new Set<Theme>(['light', 'dark', 'system', 'gruvbox', 'oled', 'sepia'])
const MIME_ALLOWLIST = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/octet-stream',
])
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/
const CURRENCY_RE = /^[A-Z]{3}$/

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && ID_RE.test(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length <= LIMITS.maxStringLength
}

function optString(value: unknown): string | undefined {
  return isText(value) ? value : undefined
}

function isNonNegative(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0
}

function isPositive(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0
}

function nonNegativeNumber(value: unknown): number | undefined {
  return isNonNegative(value) ? value : undefined
}

function moneyNumber(value: unknown): number | undefined {
  return isNonNegative(value) && value <= LIMITS.maxMoney ? value : undefined
}

function parseSocials(value: unknown): SocialLink[] | null {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > LIMITS.maxNestedItems) return null
  const out: SocialLink[] = []
  for (const item of value) {
    if (!isObject(item)) return null
    const { platform, value: linkValue } = item
    if (typeof platform !== 'string' || !SOCIAL_PLATFORMS.has(platform as SocialPlatform)) {
      return null
    }
    if (!isText(linkValue)) return null
    out.push({ platform: platform as SocialPlatform, value: linkValue })
  }
  return out
}

function parseStringArray(value: unknown): string[] | null {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > LIMITS.maxNestedItems) return null
  const out: string[] = []
  for (const item of value) {
    if (!isText(item)) return null
    out.push(item)
  }
  return out
}

function parseIdArray(value: unknown): string[] | null {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > LIMITS.maxNestedItems) return null
  const out: string[] = []
  for (const item of value) {
    if (!isId(item)) return null
    out.push(item)
  }
  return out
}

function parseFair(value: unknown): FairRef | null {
  if (value === undefined) return {}
  if (!isObject(value)) return null
  return {
    edition: optString(value.edition),
    hall: optString(value.hall),
    booth: optString(value.booth),
    note: optString(value.note),
  }
}

function parseTiers(value: unknown): PriceTier[] | null {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > LIMITS.maxNestedItems) return null
  const out: PriceTier[] = []
  for (const item of value) {
    if (
      !isObject(item) ||
      !isFiniteNumber(item.minQty) ||
      !Number.isInteger(item.minQty) ||
      item.minQty < 1 ||
      moneyNumber(item.unitPrice) === undefined
    ) {
      return null
    }
    out.push({ minQty: item.minQty, unitPrice: item.unitPrice as number })
  }
  return out
}

function parseRates(value: unknown): Record<string, number> | null {
  if (value === undefined) return {}
  if (!isObject(value)) return null
  const out: Record<string, number> = {}
  for (const [key, rate] of Object.entries(value)) {
    if (!CURRENCY_RE.test(key) || !isFiniteNumber(rate) || rate <= 0) return null
    out[key] = rate
  }
  return out
}

export function parseVendor(value: unknown): Vendor | null {
  if (!isObject(value)) return null
  if (!isId(value.id) || !isText(value.name) || value.name.trim() === '') return null
  if (typeof value.type !== 'string' || !VENDOR_TYPES.has(value.type as VendorType)) return null
  if (typeof value.status !== 'string' || !PIPELINE_STATUSES.has(value.status as PipelineStatus)) {
    return null
  }
  if (typeof value.rating !== 'number' || ![1, 2, 3, 4, 5].includes(value.rating)) return null
  if (!isPositive(value.createdAt) || !isPositive(value.updatedAt)) return null
  const socials = parseSocials(value.socials)
  if (socials === null) return null
  const tags = parseStringArray(value.tags)
  if (tags === null) return null
  const fair = parseFair(value.fair)
  if (fair === null) return null
  return {
    id: value.id,
    name: value.name,
    type: value.type as VendorType,
    status: value.status as PipelineStatus,
    rating: value.rating as Rating,
    country: optString(value.country),
    city: optString(value.city),
    address: optString(value.address),
    website: optString(value.website),
    description: optString(value.description),
    socials,
    tags,
    fair,
    revisit: value.revisit === true,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    deletedAt: isPositive(value.deletedAt) ? value.deletedAt : undefined,
  }
}

export function parseContact(value: unknown): Contact | null {
  if (!isObject(value)) return null
  if (!isId(value.id) || !isId(value.vendorId)) return null
  if (!isText(value.name) || value.name.trim() === '') return null
  if (typeof value.isPrimary !== 'boolean') return null
  return {
    id: value.id,
    vendorId: value.vendorId,
    name: value.name,
    position: optString(value.position),
    phone: optString(value.phone),
    email: optString(value.email),
    wechat: optString(value.wechat),
    whatsapp: optString(value.whatsapp),
    isPrimary: value.isPrimary,
    cardAttachmentId: isId(value.cardAttachmentId) ? value.cardAttachmentId : undefined,
    updatedAt: isPositive(value.updatedAt) ? value.updatedAt : (isPositive(value.createdAt) ? value.createdAt : Date.now()),
  }
}

export function parseProduct(value: unknown): Product | null {
  if (!isObject(value)) return null
  if (!isId(value.id) || !isId(value.vendorId)) return null
  if (!isText(value.name) || value.name.trim() === '') return null
  const currency =
    typeof value.currency === 'string' && CURRENCY_RE.test(value.currency) ? value.currency : null
  if (currency === null) return null
  const tiers = parseTiers(value.tiers)
  if (tiers === null) return null
  const photoAttachmentIds = parseIdArray(value.photoAttachmentIds)
  if (photoAttachmentIds === null) return null
  if (!isPositive(value.createdAt)) return null
  const price = value.price === undefined ? undefined : moneyNumber(value.price)
  if (value.price !== undefined && price === undefined) return null
  return {
    id: value.id,
    vendorId: value.vendorId,
    name: value.name,
    description: optString(value.description),
    unit: optString(value.unit),
    currency,
    price,
    moq: nonNegativeNumber(value.moq),
    tiers,
    leadTimeDays: nonNegativeNumber(value.leadTimeDays),
    paymentTerms: optString(value.paymentTerms),
    photoAttachmentIds,
    createdAt: value.createdAt,
    updatedAt: isPositive(value.updatedAt) ? value.updatedAt : (isPositive(value.createdAt) ? value.createdAt : Date.now()),
  }
}

export function parseNote(value: unknown): Note | null {
  if (!isObject(value)) return null
  if (!isId(value.id) || !isId(value.vendorId)) return null
  if (!isText(value.text)) return null
  if (typeof value.isTask !== 'boolean' || typeof value.done !== 'boolean') return null
  if (!isPositive(value.createdAt)) return null
  return {
    id: value.id,
    vendorId: value.vendorId,
    text: value.text,
    isTask: value.isTask,
    done: value.done,
    dueDate: nonNegativeNumber(value.dueDate),
    createdAt: value.createdAt,
    updatedAt: isPositive(value.updatedAt) ? value.updatedAt : (isPositive(value.createdAt) ? value.createdAt : Date.now()),
  }
}

export function parseCert(value: unknown): Certification | null {
  if (!isObject(value)) return null
  if (!isId(value.id) || !isId(value.vendorId)) return null
  if (!isText(value.name) || value.name.trim() === '') return null
  return {
    id: value.id,
    vendorId: value.vendorId,
    name: value.name,
    number: optString(value.number),
    issuer: optString(value.issuer),
    expiry: nonNegativeNumber(value.expiry),
    updatedAt: isPositive(value.updatedAt) ? value.updatedAt : (isPositive(value.createdAt) ? value.createdAt : Date.now()),
  }
}

export function parseAttachment(value: unknown): ExportedAttachment | null {
  if (!isObject(value)) return null
  if (!isId(value.id) || !isId(value.vendorId)) return null
  if (typeof value.kind !== 'string' || !ATTACHMENT_KINDS.has(value.kind as AttachmentKind)) {
    return null
  }
  if (
    !isNonNegative(value.width) ||
    !isNonNegative(value.height) ||
    !isNonNegative(value.bytes) ||
    value.bytes > LIMITS.maxAttachmentBytes ||
    !isPositive(value.createdAt)
  ) {
    return null
  }
  const { mime, thumbMime, blobB64, thumbB64 } = value
  if (typeof mime !== 'string' || !MIME_ALLOWLIST.has(mime)) return null
  if (typeof thumbMime !== 'string' || !MIME_ALLOWLIST.has(thumbMime)) return null
  if (!isBase64(blobB64) || !isBase64(thumbB64)) return null
  return {
    id: value.id,
    vendorId: value.vendorId,
    kind: value.kind as AttachmentKind,
    width: value.width,
    height: value.height,
    bytes: value.bytes,
    createdAt: value.createdAt,
    updatedAt: isPositive(value.updatedAt) ? value.updatedAt : (isPositive(value.createdAt) ? value.createdAt : Date.now()),
    mime,
    blobB64,
    thumbMime,
    thumbB64,
  }
}

function decodedBytes(base64: string): number {
  return Math.floor((base64.length * 3) / 4)
}

function isBase64(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length % 4 === 0 &&
    value.length <= LIMITS.maxAttachmentB64Length &&
    BASE64_RE.test(value)
  )
}

export function parseSettings(value: unknown): Settings | null {
  if (!isObject(value) || value.id !== 'app') return null
  const baseCurrency =
    typeof value.baseCurrency === 'string' && CURRENCY_RE.test(value.baseCurrency)
      ? value.baseCurrency
      : 'USD'
  const theme =
    typeof value.theme === 'string' && THEMES.has(value.theme as Theme)
      ? (value.theme as Theme)
      : 'system'
  const rates = parseRates(value.rates)
  if (rates === null) return null
  const defaultFair = parseFair(value.defaultFair)
  return {
    id: 'app',
    baseCurrency,
    theme,
    rates,
    travellerName: optString(value.travellerName),
    defaultFair: defaultFair ?? undefined,
  }
}

type Parsed<T> = { ok: true; rows: T[] } | { ok: false; error: ImportFailure }

function parseRows<T>(
  table: string,
  raw: unknown,
  cap: number,
  parse: (value: unknown) => T | null,
  rejected: RejectedRecord[],
): Parsed<T> {
  if (raw === undefined) return { ok: true, rows: [] }
  if (!Array.isArray(raw)) {
    return {
      ok: false,
      error: { code: 'bad_envelope', message: `data.${table} must be an array.` },
    }
  }
  if (raw.length > cap) {
    return { ok: false, error: { code: 'too_many_records', message: `Too many ${table} records.` } }
  }
  const rows: T[] = []
  raw.forEach((item, index) => {
    const parsed = parse(item)
    if (parsed === null) {
      rejected.push({
        table,
        index,
        id: isObject(item) && isText(item.id) ? item.id : undefined,
        reason: 'Record failed validation',
      })
    } else {
      rows.push(parsed)
    }
  })
  return { ok: true, rows }
}

const ALLOWED_TOP = new Set(['schemaVersion', 'exportedAt', 'app', 'data'])
const ALLOWED_DATA = new Set([
  'vendors',
  'contacts',
  'products',
  'notes',
  'certs',
  'attachments',
  'settings',
])

export function validateEnvelope(input: unknown): ValidationResult {
  if (!isObject(input)) return fail('bad_envelope', 'Import file is not an object.')
  for (const key of Object.keys(input)) {
    if (!ALLOWED_TOP.has(key)) return fail('bad_envelope', `Unexpected top-level field: ${key}`)
  }
  const schemaVersion = input.schemaVersion
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion)) {
    return fail('bad_envelope', 'Missing or invalid schemaVersion.')
  }
  if (schemaVersion > SCHEMA_VERSION) {
    return fail('unsupported_schema', 'This file was made by a newer version of the app.')
  }
  if (schemaVersion < 1) {
    return fail('unsupported_schema', 'This file is too old to import.')
  }
  if (!isText(input.exportedAt)) {
    return fail('bad_envelope', 'Missing or invalid exportedAt.')
  }
  const app = input.app
  if (!isObject(app) || !isText(app.id) || !isText(app.version)) {
    return fail('bad_envelope', 'Missing or invalid app info.')
  }
  const data = input.data
  if (!isObject(data)) return fail('bad_envelope', 'Missing data object.')
  for (const key of Object.keys(data)) {
    if (!ALLOWED_DATA.has(key)) return fail('bad_envelope', `Unexpected data field: ${key}`)
  }

  const warnings: string[] = []
  if (app.id !== APP_ID) warnings.push(`File was exported by "${app.id}".`)

  const rejected: RejectedRecord[] = []
  const vendors = parseRows('vendors', data.vendors, LIMITS.maxVendors, parseVendor, rejected)
  if (!vendors.ok) return vendors
  const contacts = parseRows('contacts', data.contacts, LIMITS.maxContacts, parseContact, rejected)
  if (!contacts.ok) return contacts
  const products = parseRows('products', data.products, LIMITS.maxProducts, parseProduct, rejected)
  if (!products.ok) return products
  const notes = parseRows('notes', data.notes, LIMITS.maxNotes, parseNote, rejected)
  if (!notes.ok) return notes
  const certs = parseRows('certs', data.certs, LIMITS.maxCerts, parseCert, rejected)
  if (!certs.ok) return certs
  const attachments = parseRows(
    'attachments',
    data.attachments,
    LIMITS.maxAttachments,
    parseAttachment,
    rejected,
  )
  if (!attachments.ok) return attachments

  const totalAttachmentBytes = attachments.rows.reduce(
    (sum, item) => sum + decodedBytes(item.blobB64) + decodedBytes(item.thumbB64),
    0,
  )
  if (totalAttachmentBytes > LIMITS.maxTotalAttachmentBytes) {
    return fail('too_many_records', 'Attachment payload is too large.')
  }

  let settings: Settings | null = null
  if (data.settings !== undefined && data.settings !== null) {
    const parsed = parseSettings(data.settings)
    if (parsed === null) {
      rejected.push({ table: 'settings', index: 0, reason: 'Settings failed validation' })
    } else {
      settings = parsed
    }
  }

  return {
    ok: true,
    rejected,
    warnings,
    envelope: {
      schemaVersion,
      exportedAt: input.exportedAt,
      app: { id: app.id, version: app.version },
      data: {
        vendors: vendors.rows,
        contacts: contacts.rows,
        products: products.rows,
        notes: notes.rows,
        certs: certs.rows,
        attachments: attachments.rows,
        settings,
      },
    },
  }
}
