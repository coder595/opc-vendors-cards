import QRCode from 'qrcode'
import type { Contact, ExportEnvelope, Product, Vendor } from '../db/models'
import { APP_ID, APP_VERSION } from './app'
import { SCHEMA_VERSION } from '../db/schema'

const PREFIX_V1 = 'OCV1.'
const PREFIX_V2 = 'OCV2.'
/** QR v40 at EC level M holds 2331 bytes; keep density low for camera reliability. */
const MAX_QR_BYTES = 1200
const MAX_DECODE_CHARS = 5000

export interface VendorCardData {
  name: string
  type: Vendor['type']
  status: Vendor['status']
  rating: Vendor['rating']
  country?: string
  city?: string
  address?: string
  website?: string
  description?: string
  tags: string[]
  fair: Vendor['fair']
  contacts: {
    name: string
    position?: string
    phone?: string
    email?: string
    wechat?: string
    whatsapp?: string
    isPrimary: boolean
  }[]
  products: {
    name: string
    unit?: string
    currency: string
    price?: number
    moq?: number
    leadTimeDays?: number
  }[]
}

export function buildVendorCard(
  vendor: Vendor,
  contacts: Contact[],
  products: Product[],
): VendorCardData {
  return {
    name: vendor.name,
    type: vendor.type,
    status: vendor.status,
    rating: vendor.rating,
    country: vendor.country,
    city: vendor.city,
    address: vendor.address,
    website: vendor.website,
    description: vendor.description,
    tags: vendor.tags,
    fair: vendor.fair,
    contacts: contacts.map((contact) => ({
      name: contact.name,
      position: contact.position,
      phone: contact.phone,
      email: contact.email,
      wechat: contact.wechat,
      whatsapp: contact.whatsapp,
      isPrimary: contact.isPrimary,
    })),
    products: products.map((product) => ({
      name: product.name,
      unit: product.unit,
      currency: product.currency,
      price: product.price,
      moq: product.moq,
      leadTimeDays: product.leadTimeDays,
    })),
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const pad = (4 - (padded.length % 4)) % 4
  const binary = atob(padded + '='.repeat(pad))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(data)
  const stream = new Blob([copy]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return readAll(stream)
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(data)
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return readAll(stream)
}

function validateParsed(parsed: unknown): VendorCardData | null {
  if (typeof parsed !== 'object' || parsed === null) return null
  const card = parsed as Partial<VendorCardData>
  if (typeof card.name !== 'string' || card.name.trim() === '') return null
  if (!Array.isArray(card.contacts) || !Array.isArray(card.products)) return null
  if (card.tags !== undefined && !Array.isArray(card.tags)) return null
  return card as VendorCardData
}

/** Encodes a compact vendor card as a self-contained OCV1 string (no server). */
export function encodeVendorCard(card: VendorCardData): string {
  return PREFIX_V1 + bytesToBase64Url(new TextEncoder().encode(JSON.stringify(card)))
}

export async function encodeVendorCardUrl(card: VendorCardData, origin: string): Promise<string> {
  const json = JSON.stringify(card)
  const compressed = await deflateRaw(new TextEncoder().encode(json))
  return `${origin}/#/import?c=${PREFIX_V2}${bytesToBase64Url(compressed)}`
}

export async function decodeVendorCard(code: string): Promise<VendorCardData | null> {
  if (code.length > MAX_DECODE_CHARS) return null

  let payload = code
  const cParam = code.match(/[?&]c=([^&]+)/)
  if (cParam && cParam[1]) {
    try {
      payload = decodeURIComponent(cParam[1])
    } catch {
      return null
    }
  }

  try {
    if (payload.startsWith(PREFIX_V2)) {
      const compressed = base64UrlToBytes(payload.slice(PREFIX_V2.length))
      const decompressed = await inflateRaw(compressed)
      return validateParsed(JSON.parse(new TextDecoder().decode(decompressed)))
    }
    if (payload.startsWith(PREFIX_V1)) {
      const json = new TextDecoder().decode(base64UrlToBytes(payload.slice(PREFIX_V1.length)))
      return validateParsed(JSON.parse(json))
    }
    return null
  } catch {
    return null
  }
}

export function payloadFitsQr(text: string): boolean {
  return new TextEncoder().encode(text).length <= MAX_QR_BYTES
}

export async function renderQrToCanvas(canvas: HTMLCanvasElement, text: string): Promise<void> {
  await QRCode.toCanvas(canvas, text, { errorCorrectionLevel: 'M', margin: 2, width: 240 })
}

export function cardToEnvelope(card: VendorCardData): ExportEnvelope {
  const now = Date.now()
  const vendorId = crypto.randomUUID()
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: { id: APP_ID, version: APP_VERSION },
    data: {
      vendors: [
        {
          id: vendorId,
          name: card.name,
          type: card.type,
          status: card.status,
          rating: card.rating,
          country: card.country,
          city: card.city,
          address: card.address,
          website: card.website,
          description: card.description,
          socials: [],
          tags: card.tags ?? [],
          fair: card.fair ?? {},
          createdAt: now,
          updatedAt: now,
        },
      ],
      contacts: (card.contacts ?? []).map((contact) => ({
        id: crypto.randomUUID(),
        vendorId,
        name: contact.name,
        position: contact.position,
        phone: contact.phone,
        email: contact.email,
        wechat: contact.wechat,
        whatsapp: contact.whatsapp,
        isPrimary: contact.isPrimary,
      })),
      products: (card.products ?? []).map((product) => ({
        id: crypto.randomUUID(),
        vendorId,
        name: product.name,
        unit: product.unit,
        currency: product.currency,
        price: product.price,
        moq: product.moq,
        tiers: [],
        leadTimeDays: product.leadTimeDays,
        photoAttachmentIds: [],
        createdAt: now,
      })),
      notes: [],
      certs: [],
      attachments: [],
      settings: null,
    },
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export async function shareFile(blob: Blob, filename: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.canShare || !navigator.share) return false
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' })
  if (!navigator.canShare({ files: [file] })) return false
  try {
    await navigator.share({ files: [file], title: filename })
    return true
  } catch {
    return false
  }
}

export function canShareFiles(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    typeof navigator.share === 'function'
  )
}