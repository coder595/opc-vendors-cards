import type { Table } from 'dexie'
import { db, SCHEMA_VERSION } from '../db/schema'
import type {
  Attachment,
  Certification,
  Contact,
  ExportEnvelope,
  ExportedAttachment,
  ImportMode,
  MergePolicy,
  Note,
  Product,
  Settings,
  Vendor,
} from '../db/models'
import { APP_ID, APP_VERSION } from './app'
import {
  LIMITS,
  parseAttachment,
  parseCert,
  parseContact,
  parseNote,
  parseProduct,
  parseSettings,
  parseVendor,
  validateEnvelope,
  type ImportErrorCode,
  type ImportFailure,
  type RejectedRecord,
  type ValidationResult,
} from './validate'

class ImportLimitError extends Error {}

function fail(code: ImportErrorCode, message: string): ValidationResult {
  return { ok: false, error: { code, message } }
}

export const EXPORT_FORMAT_V2 = 2 as const

export interface ExportOptions {
  format?: 1 | 2
  includePhotos?: boolean
  vendorIds?: string[]
  fairEdition?: string
}

export interface ImportSummary {
  mode: ImportMode
  insertedVendors: number
  matchedVendors: number
  updatedVendors: number
  insertedChildren: number
  skippedChildren: number
  updatedChildren: number
  importedAttachments: number
  rejected: RejectedRecord[]
}

export interface ImportOptions {
  policy?: MergePolicy
  importSettings?: boolean
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const CHUNK = 0x8000 // 32768 — safely under fromCharCode argument limits
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mime })
}

async function streamToText(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<string> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new ImportLimitError('Import expands beyond the size limit.')
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(out)
}

async function streamToBlob(stream: ReadableStream<Uint8Array>): Promise<Blob> {
  const reader = stream.getReader()
  const parts: BlobPart[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    const copy = new Uint8Array(value.byteLength)
    copy.set(value)
    parts.push(copy)
  }
  return new Blob(parts, { type: 'application/gzip' })
}

export async function serializeDb(): Promise<ExportEnvelope> {
  // A read transaction gives a consistent snapshot (no child rows referencing
  // a vendor that is missing from the same file).
  const snapshot = await db.transaction(
    'r',
    [db.vendors, db.contacts, db.products, db.notes, db.certs, db.attachments, db.settings],
    async () => ({
      vendors: await db.vendors.toArray(),
      contacts: await db.contacts.toArray(),
      products: await db.products.toArray(),
      notes: await db.notes.toArray(),
      certs: await db.certs.toArray(),
      attachments: await db.attachments.toArray(),
      settings: await db.settings.get('app'),
    }),
  )

  const attachments: ExportedAttachment[] = []
  // Sequential on purpose: base64 inflates ~33% and holding every string at
  // once would spike memory on photo-heavy exports.
  for (const row of snapshot.attachments) {
    attachments.push({
      id: row.id,
      vendorId: row.vendorId,
      kind: row.kind,
      width: row.width,
      height: row.height,
      bytes: row.bytes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      mime: row.blob.type || 'application/octet-stream',
      blobB64: await blobToBase64(row.blob),
      thumbMime: row.thumb.type || 'application/octet-stream',
      thumbB64: await blobToBase64(row.thumb),
    })
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: { id: APP_ID, version: APP_VERSION },
    data: {
      vendors: snapshot.vendors,
      contacts: snapshot.contacts,
      products: snapshot.products,
      notes: snapshot.notes,
      certs: snapshot.certs,
      attachments,
      settings: snapshot.settings ?? null,
    },
  }
}

export async function buildExportBlob(envelope: ExportEnvelope): Promise<Blob> {
  const json = JSON.stringify(envelope)
  if (typeof CompressionStream === 'undefined') {
    return new Blob([json], { type: 'application/json' })
  }
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))
  return streamToBlob(stream)
}

export function isGzip(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 2) return false
  const bytes = new Uint8Array(buffer, 0, 2)
  return bytes[0] === 0x1f && bytes[1] === 0x8b
}

export async function parseImport(input: ArrayBuffer | Blob): Promise<ValidationResult> {
  if (input instanceof Blob && input.size > LIMITS.maxFileBytes) {
    return fail('file_too_large', 'File is larger than the 250 MB limit.')
  }
  const buffer = input instanceof Blob ? await input.arrayBuffer() : input
  if (buffer.byteLength > LIMITS.maxFileBytes) {
    return fail('file_too_large', 'File is larger than the 250 MB limit.')
  }

  let text: string
  if (isGzip(buffer)) {
    if (typeof DecompressionStream === 'undefined') {
      return fail('bad_gzip', 'This browser cannot read compressed files.')
    }
    try {
      const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))
      text = await streamToText(stream, LIMITS.maxJsonChars)
    } catch (error) {
      if (error instanceof ImportLimitError) return fail('file_too_large', error.message)
      return fail('bad_gzip', 'Compressed file could not be read.')
    }
  } else {
    text = new TextDecoder().decode(buffer)
  }

  if (text.length > LIMITS.maxJsonChars) {
    return fail('file_too_large', 'Import expands beyond the size limit.')
  }

  // Try NDJSON v2 format detection: first line parsed as JSON contains formatVersion=2
  const firstNewline = text.indexOf('\n')
  if (firstNewline > 0) {
    const firstLine = text.slice(0, firstNewline)
    try {
      const probe = JSON.parse(firstLine)
      if (probe && probe.formatVersion === EXPORT_FORMAT_V2) {
        return ndjsonToEnvelope(text)
      }
    } catch {
      // Not NDJSON — fall through to v1 JSON parser
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: { code: 'bad_json', message: 'File is not valid JSON.' } }
  }
  return validateEnvelope(parsed)
}

export function normName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function normWebsite(value?: string): string {
  if (!value) return ''
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`)
    return (
      url.hostname.replace(/^www\./, '').toLowerCase() +
      url.pathname.replace(/\/+$/, '').toLowerCase()
    )
  } catch {
    return value.trim().toLowerCase()
  }
}

export function dedupeKey(vendor: Pick<Vendor, 'name' | 'website'>): string {
  return `${normName(vendor.name)}|${normWebsite(vendor.website)}`
}

export function exportFilename(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `opc-vendors-${year}-${month}-${day}.ocv.json.gz`
}

export interface ExportSizeEstimate {
  text: string
  bytes: number
}

export async function estimateExportSize(options: ExportOptions = {}): Promise<ExportSizeEstimate> {
  const counts = await db.transaction('r', [db.vendors, db.contacts, db.products, db.attachments], async () => {
    let vendors = await db.vendors.toArray()
    if (options.vendorIds) {
      const set = new Set(options.vendorIds)
      vendors = vendors.filter((v) => set.has(v.id))
    }
    if (options.fairEdition) {
      vendors = vendors.filter((v) => v.fair?.edition === options.fairEdition)
    }
    const vendorIds = new Set(vendors.map((v) => v.id))
    const contacts = await db.contacts.toArray()
    const filteredContacts = options.vendorIds || options.fairEdition
      ? contacts.filter((c) => vendorIds.has(c.vendorId))
      : contacts
    const products = await db.products.toArray()
    const filteredProducts = options.vendorIds || options.fairEdition
      ? products.filter((p) => vendorIds.has(p.vendorId))
      : products
    const attachments = await db.attachments.toArray()
    const filteredAttachments = options.vendorIds || options.fairEdition
      ? attachments.filter((a) => vendorIds.has(a.vendorId))
      : attachments
    const totalAttachmentBytes = options.includePhotos !== false
      ? filteredAttachments.reduce((s, a) => s + a.bytes, 0)
      : 0
    return {
      vendorCount: vendors.length,
      contactCount: filteredContacts.length,
      productCount: filteredProducts.length,
      attachmentBytes: totalAttachmentBytes,
    }
  })

  const raw = counts.vendorCount * 500 + counts.contactCount * 200 + counts.productCount * 300 + counts.attachmentBytes * 1.35
  const bytes = Math.ceil(raw)
  const text = bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return { text, bytes }
}

export async function* exportNdjsonStream(
  options: ExportOptions = {},
): AsyncGenerator<Uint8Array> {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const compressedReadable = readable.pipeThrough(new CompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>)

  const writePromise = (async () => {
    const writer = writable.getWriter()
    const encoder = new TextEncoder()
    try {
      const snapshot = await db.transaction(
        'r',
        [db.vendors, db.contacts, db.products, db.notes, db.certs, db.attachments, db.settings],
        async () => {
          let vendors = await db.vendors.toArray()
          if (options.vendorIds) {
            const set = new Set(options.vendorIds)
            vendors = vendors.filter((v) => set.has(v.id))
          }
          if (options.fairEdition) {
            vendors = vendors.filter((v) => v.fair?.edition === options.fairEdition)
          }
          const vendorIds = new Set(vendors.map((v) => v.id))
          const filter = <T extends { vendorId: string }>(rows: T[]): T[] =>
            vendorIds.size === 0 || options.vendorIds === undefined && options.fairEdition === undefined
              ? rows
              : rows.filter((r) => vendorIds.has(r.vendorId))
          const [contacts, products, notes, certs, attachments, settings] = await Promise.all([
            db.contacts.toArray().then(filter),
            db.products.toArray().then(filter),
            db.notes.toArray().then(filter),
            db.certs.toArray().then(filter),
            db.attachments.toArray().then(filter),
            db.settings.get('app'),
          ])
          return { vendors, contacts, products, notes, certs, attachments, settings }
        },
      )

      const counts = {
        vendors: snapshot.vendors.length,
        contacts: snapshot.contacts.length,
        products: snapshot.products.length,
        notes: snapshot.notes.length,
        certs: snapshot.certs.length,
        attachments: options.includePhotos !== false ? snapshot.attachments.length : 0,
      }

      const header = {
        schemaVersion: SCHEMA_VERSION,
        formatVersion: EXPORT_FORMAT_V2,
        exportedAt: new Date().toISOString(),
        app: { id: APP_ID, version: APP_VERSION },
        counts,
      }
      await writer.write(encoder.encode(JSON.stringify(header) + '\n'))

      const writeLines = async <T>(type: string, records: T[]): Promise<void> => {
        for (const record of records) {
          await writer.write(encoder.encode(JSON.stringify({ t: type, r: record }) + '\n'))
        }
      }

      await writeLines('vendor', snapshot.vendors)
      await writeLines('contact', snapshot.contacts)
      await writeLines('product', snapshot.products)
      await writeLines('note', snapshot.notes)
      await writeLines('cert', snapshot.certs)

      if (options.includePhotos !== false) {
        for (const row of snapshot.attachments) {
          const exported: ExportedAttachment = {
            id: row.id,
            vendorId: row.vendorId,
            kind: row.kind,
            width: row.width,
            height: row.height,
            bytes: row.bytes,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            mime: row.blob.type || 'application/octet-stream',
            blobB64: await blobToBase64(row.blob),
            thumbMime: row.thumb.type || 'application/octet-stream',
            thumbB64: await blobToBase64(row.thumb),
          }
          await writer.write(encoder.encode(JSON.stringify({ t: 'attachment', r: exported }) + '\n'))
        }
      }

      if (snapshot.settings) {
        await writer.write(encoder.encode(JSON.stringify({ t: 'settings', r: snapshot.settings }) + '\n'))
      }
    } finally {
      await writer.close()
    }
  })()

  const reader = compressedReadable.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      yield value
    }
  } finally {
    reader.releaseLock()
  }
  await writePromise
}

function parseNdjsonHeader(line: string): { header: Record<string, unknown>; error?: ImportFailure } {
  let header: Record<string, unknown>
  try {
    header = JSON.parse(line)
  } catch {
    return { header: {}, error: { code: 'bad_json' as ImportErrorCode, message: 'Invalid NDJSON header (line 1).' } }
  }
  if (!header || typeof header.schemaVersion !== 'number') {
    return { header: {}, error: { code: 'bad_envelope' as ImportErrorCode, message: 'Missing schemaVersion in NDJSON header.' } }
  }
  if (header.schemaVersion > SCHEMA_VERSION) {
    return { header: {}, error: { code: 'unsupported_schema' as ImportErrorCode, message: 'This file was made by a newer version of the app.' } }
  }
  if (header.formatVersion !== EXPORT_FORMAT_V2) {
    return { header: {}, error: { code: 'bad_envelope' as ImportErrorCode, message: 'Unsupported format version.' } }
  }
  return { header }
}

function parseNdjsonRecord(
  line: string,
  lineIndex: number,
  rejected: RejectedRecord[],
):
  | { type: 'vendor'; record: Vendor }
  | { type: 'contact'; record: Contact }
  | { type: 'product'; record: Product }
  | { type: 'note'; record: Note }
  | { type: 'cert'; record: Certification }
  | { type: 'attachment'; record: ExportedAttachment }
  | { type: 'settings'; record: Settings }
  | { type: 'skip' }
  | { type: 'error' }
  | null {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(line)
  } catch {
    rejected.push({ table: 'ndjson', index: lineIndex, reason: 'Invalid JSON on line' })
    return null
  }
  if (!parsed || typeof parsed.t !== 'string' || !parsed.r || typeof parsed.r !== 'object') {
    rejected.push({ table: 'ndjson', index: lineIndex, reason: 'Missing type or record field' })
    return null
  }
  const r = parsed.r as Record<string, unknown>
  switch (parsed.t) {
    case 'vendor': {
      const v = parseVendor(r)
      if (v) return { type: 'vendor', record: v }
      rejected.push({ table: 'vendors', index: lineIndex, id: typeof r.id === 'string' ? r.id : undefined, reason: 'Validation failed' })
      return null
    }
    case 'contact': {
      const c = parseContact(r)
      if (c) return { type: 'contact', record: c }
      rejected.push({ table: 'contacts', index: lineIndex, id: typeof r.id === 'string' ? r.id : undefined, reason: 'Validation failed' })
      return null
    }
    case 'product': {
      const p = parseProduct(r)
      if (p) return { type: 'product', record: p }
      rejected.push({ table: 'products', index: lineIndex, id: typeof r.id === 'string' ? r.id : undefined, reason: 'Validation failed' })
      return null
    }
    case 'note': {
      const n = parseNote(r)
      if (n) return { type: 'note', record: n }
      rejected.push({ table: 'notes', index: lineIndex, id: typeof r.id === 'string' ? r.id : undefined, reason: 'Validation failed' })
      return null
    }
    case 'cert': {
      const ct = parseCert(r)
      if (ct) return { type: 'cert', record: ct }
      rejected.push({ table: 'certs', index: lineIndex, id: typeof r.id === 'string' ? r.id : undefined, reason: 'Validation failed' })
      return null
    }
    case 'attachment': {
      const a = parseAttachment(r)
      if (a) return { type: 'attachment', record: a }
      rejected.push({ table: 'attachments', index: lineIndex, id: typeof r.id === 'string' ? r.id : undefined, reason: 'Validation failed' })
      return null
    }
    case 'settings': {
      const s = parseSettings(r)
      if (s) return { type: 'settings', record: s }
      rejected.push({ table: 'settings', index: lineIndex, reason: 'Validation failed' })
      return null
    }
    default:
      rejected.push({ table: 'ndjson', index: lineIndex, reason: `Unknown record type: ${parsed.t}` })
      return null
  }
}

export function ndjsonToEnvelope(text: string): ValidationResult {
  const firstNewline = text.indexOf('\n')
  if (firstNewline < 0) {
    return fail('bad_envelope', 'NDJSON file has only one line.')
  }
  const headerLine = text.slice(0, firstNewline)
  const { header, error } = parseNdjsonHeader(headerLine)
  if (error) return { ok: false, error }

  const warnings: string[] = []
  if (header.app && typeof header.app === 'object') {
    const appId = (header.app as Record<string, unknown>).id
    if (appId !== APP_ID) warnings.push(`File was exported by "${String(appId)}".`)
  }

  const rejected: RejectedRecord[] = []
  const vendors: Vendor[] = []
  const contacts: Contact[] = []
  const products: Product[] = []
  const notes: Note[] = []
  const certs: Certification[] = []
  const attachments: ExportedAttachment[] = []
  let settings: Settings | null = null

  const remaining = text.slice(firstNewline + 1)
  const lines = remaining ? remaining.split('\n') : []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim()
    if (!line) continue
    const result = parseNdjsonRecord(line, i + 2, rejected)
    if (result === null) continue
    switch (result.type) {
      case 'vendor':
        vendors.push(result.record)
        break
      case 'contact':
        contacts.push(result.record)
        break
      case 'product':
        products.push(result.record)
        break
      case 'note':
        notes.push(result.record)
        break
      case 'cert':
        certs.push(result.record)
        break
      case 'attachment':
        attachments.push(result.record)
        break
      case 'settings':
        settings = result.record
        break
    }
  }

  if (vendors.length > LIMITS.maxVendors) {
    return fail('too_many_records', `Too many vendors (max ${LIMITS.maxVendors}).`)
  }
  if (contacts.length > LIMITS.maxContacts) {
    return fail('too_many_records', `Too many contacts (max ${LIMITS.maxContacts}).`)
  }
  if (products.length > LIMITS.maxProducts) {
    return fail('too_many_records', `Too many products (max ${LIMITS.maxProducts}).`)
  }
  if (notes.length > LIMITS.maxNotes) {
    return fail('too_many_records', `Too many notes (max ${LIMITS.maxNotes}).`)
  }
  if (certs.length > LIMITS.maxCerts) {
    return fail('too_many_records', `Too many certs (max ${LIMITS.maxCerts}).`)
  }
  if (attachments.length > LIMITS.maxAttachments) {
    return fail('too_many_records', `Too many attachments (max ${LIMITS.maxAttachments}).`)
  }

  return {
    ok: true,
    rejected,
    warnings,
    envelope: {
      schemaVersion: header.schemaVersion as number,
      exportedAt: (header.exportedAt as string) ?? new Date().toISOString(),
      app: header.app as { id: string; version: string } ?? { id: APP_ID, version: APP_VERSION },
      data: {
        vendors,
        contacts,
        products,
        notes,
        certs,
        attachments,
        settings,
      },
    },
  }
}

export async function importNdjsonStream(
  input: Blob | ArrayBuffer,
  mode: ImportMode,
  options: ImportOptions = {},
): Promise<ImportSummary> {
  const size = input instanceof Blob ? input.size : input.byteLength
  if (size > LIMITS.maxFileBytes) {
    throw new Error('File is larger than the 250 MB limit.')
  }

  const buffer = input instanceof Blob ? await input.arrayBuffer() : input

  let text: string
  if (isGzip(buffer)) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('This browser cannot read compressed files.')
    }
    try {
      const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))
      text = await streamToText(stream, LIMITS.maxJsonChars)
    } catch (error) {
      if (error instanceof ImportLimitError) throw error
      throw new Error('Compressed file could not be read.')
    }
  } else {
    text = new TextDecoder().decode(buffer)
  }

  if (text.length > LIMITS.maxJsonChars) {
    throw new Error('Import expands beyond the size limit.')
  }

  const result = ndjsonToEnvelope(text)
  if (!result.ok) {
    throw new Error(result.error.message)
  }

  return importData(result.envelope, mode, options)
}

async function bulkPutChunked<T>(table: Table<T, string>, rows: T[]): Promise<void> {
  const CHUNK = 1000
  for (let i = 0; i < rows.length; i += CHUNK) {
    await table.bulkPut(rows.slice(i, i + CHUNK))
  }
}

async function upsertChildren<T extends { id: string; updatedAt?: number }>(
  table: Table<T, string>,
  rows: T[],
  policy: MergePolicy,
  summary: ImportSummary,
): Promise<number> {
  const existingIds = new Set((await table.toCollection().primaryKeys()).map(String))
  const toPut: T[] = []
  for (const row of rows) {
    if (existingIds.has(row.id)) {
      if (policy === 'imported-wins') {
        toPut.push(row)
      } else if (policy === 'newest-wins') {
        const existing = await table.get(row.id)
        if (existing && (existing.updatedAt ?? 0) >= (row.updatedAt ?? 0)) {
          summary.skippedChildren += 1
        } else {
          toPut.push(row)
          summary.updatedChildren += 1
        }
      } else {
        summary.skippedChildren += 1
      }
    } else {
      toPut.push(row)
      summary.insertedChildren += 1
    }
  }
  await bulkPutChunked(table, toPut)
  return toPut.length
}

export async function importData(
  envelope: ExportEnvelope,
  mode: ImportMode,
  options: ImportOptions = {},
): Promise<ImportSummary> {
  const policy = options.policy ?? 'newest-wins'
  const { data } = envelope
  const summary: ImportSummary = {
    mode,
    insertedVendors: 0,
    matchedVendors: 0,
    updatedVendors: 0,
    insertedChildren: 0,
    skippedChildren: 0,
    updatedChildren: 0,
    importedAttachments: 0,
    rejected: [],
  }

  // Decode every blob before entering the transaction: Dexie auto-commits when
  // it sees a non-Dexie await inside a transaction zone.
  const attachments: Attachment[] = data.attachments.map((item) => ({
    id: item.id,
    vendorId: item.vendorId,
    kind: item.kind,
    blob: base64ToBlob(item.blobB64, item.mime),
    thumb: base64ToBlob(item.thumbB64, item.thumbMime),
    width: item.width,
    height: item.height,
    bytes: item.bytes,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }))

  if (mode === 'replace') {
    await db.transaction(
      'rw',
      [db.vendors, db.contacts, db.products, db.notes, db.certs, db.attachments, db.settings],
      async () => {
        await Promise.all([
          db.vendors.clear(),
          db.contacts.clear(),
          db.products.clear(),
          db.notes.clear(),
          db.certs.clear(),
          db.attachments.clear(),
        ])
        await bulkPutChunked(db.vendors, data.vendors)

        // Keep referential integrity: drop children whose vendor is absent.
        const vendorIds = new Set(data.vendors.map((vendor) => vendor.id))
        const filterChildren = <T extends { id: string; vendorId: string }>(
          table: string,
          rows: T[],
        ): T[] => {
          const out: T[] = []
          rows.forEach((row, index) => {
            if (!vendorIds.has(row.vendorId)) {
              summary.rejected.push({ table, index, id: row.id, reason: 'Vendor not found' })
              return
            }
            out.push(row)
          })
          return out
        }
        const contacts = filterChildren('contacts', data.contacts)
        const products = filterChildren('products', data.products)
        const notes = filterChildren('notes', data.notes)
        const certs = filterChildren('certs', data.certs)
        const keptAttachments = filterChildren('attachments', attachments)

        await bulkPutChunked(db.contacts, contacts)
        await bulkPutChunked(db.products, products)
        await bulkPutChunked(db.notes, notes)
        await bulkPutChunked(db.certs, certs)
        await bulkPutChunked(db.attachments, keptAttachments)

        // Local settings (currency, rates, theme) are device preferences and
        // are preserved unless the user explicitly opts in.
        if (options.importSettings && data.settings) {
          await db.settings.put(data.settings)
        }
        summary.insertedVendors = data.vendors.length
        summary.importedAttachments = keptAttachments.length
        summary.insertedChildren = contacts.length + products.length + notes.length + certs.length
      },
    )
    return summary
  }

  await db.transaction(
    'rw',
    [db.vendors, db.contacts, db.products, db.notes, db.certs, db.attachments, db.settings],
    async () => {
      const existingVendors = await db.vendors.toArray()
      const liveVendors = existingVendors.filter((vendor) => vendor.deletedAt === undefined)
      const byId = new Map(existingVendors.map((vendor): [string, Vendor] => [vendor.id, vendor]))
      const byKey = new Map<string, Vendor>()
      for (const vendor of liveVendors) {
        byKey.set(dedupeKey(vendor), vendor)
      }

      const vendorIdMap = new Map<string, string>()
      for (const imported of data.vendors) {
        const sameId = byId.get(imported.id)
        const key = dedupeKey(imported)
        const matched = sameId ?? byKey.get(key)
        if (matched) {
          vendorIdMap.set(imported.id, matched.id)
          summary.matchedVendors += 1
          if (policy === 'imported-wins') {
            const updated: Vendor = {
              ...imported,
              id: matched.id,
              createdAt: matched.createdAt,
            }
            await db.vendors.put(updated)
            byId.set(updated.id, updated)
            byKey.set(dedupeKey(updated), updated)
          } else if (policy === 'newest-wins') {
            if ((matched.updatedAt ?? 0) < (imported.updatedAt ?? 0)) {
              const updated: Vendor = {
                ...imported,
                id: matched.id,
                createdAt: matched.createdAt,
              }
              await db.vendors.put(updated)
              byId.set(updated.id, updated)
              byKey.set(dedupeKey(updated), updated)
              summary.updatedVendors += 1
            }
          }
        } else {
          await db.vendors.put(imported)
          vendorIdMap.set(imported.id, imported.id)
          byId.set(imported.id, imported)
          byKey.set(key, imported)
          summary.insertedVendors += 1
        }
      }

      const resolveVendorId = (vendorId: string): string | undefined => {
        const mapped = vendorIdMap.get(vendorId)
        if (mapped !== undefined) return mapped
        return byId.has(vendorId) ? vendorId : undefined
      }

      const reparent = <T extends { id: string; vendorId: string }>(
        table: string,
        rows: T[],
      ): T[] => {
        const out: T[] = []
        rows.forEach((row, index) => {
          const vendorId = resolveVendorId(row.vendorId)
          if (vendorId === undefined) {
            summary.rejected.push({ table, index, id: row.id, reason: 'Vendor not found' })
            return
          }
          out.push({ ...row, vendorId })
        })
        return out
      }

      await upsertChildren(db.contacts, reparent('contacts', data.contacts), policy, summary)
      await upsertChildren(db.products, reparent('products', data.products), policy, summary)
      await upsertChildren(db.notes, reparent('notes', data.notes), policy, summary)
      await upsertChildren(db.certs, reparent('certs', data.certs), policy, summary)
      const upsertedAttachments = await upsertChildren(
        db.attachments,
        reparent('attachments', attachments),
        policy,
        summary,
      )
      summary.importedAttachments = upsertedAttachments
      if (options.importSettings && data.settings) {
        await db.settings.put(data.settings)
      }
    },
  )

  return summary
}

export interface ImportPreview {
  counts: {
    vendors: number
    contacts: number
    products: number
    notes: number
    certs: number
    attachments: number
  }
  matchedVendors: number
  newVendors: number
}

/** Read-only pass so the UI can preview conflicts before writing anything. */
export async function previewImport(envelope: ExportEnvelope): Promise<ImportPreview> {
  const existing = await db.vendors.toArray()
  const byId = new Set(existing.map((vendor) => vendor.id))
  const byKey = new Set(
    existing.filter((vendor) => vendor.deletedAt === undefined).map((vendor) => dedupeKey(vendor)),
  )
  let matchedVendors = 0
  const claimedIds = new Set<string>()
  const claimedKeys = new Set<string>()
  for (const vendor of envelope.data.vendors) {
    const key = dedupeKey(vendor)
    if (
      byId.has(vendor.id) ||
      byKey.has(key) ||
      claimedIds.has(vendor.id) ||
      claimedKeys.has(key)
    ) {
      matchedVendors += 1
    } else {
      claimedIds.add(vendor.id)
      claimedKeys.add(key)
    }
  }
  const { data } = envelope
  return {
    counts: {
      vendors: data.vendors.length,
      contacts: data.contacts.length,
      products: data.products.length,
      notes: data.notes.length,
      certs: data.certs.length,
      attachments: data.attachments.length,
    },
    matchedVendors,
    newVendors: data.vendors.length - matchedVendors,
  }
}
