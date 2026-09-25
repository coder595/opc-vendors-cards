import type { Table } from 'dexie'
import { db, SCHEMA_VERSION } from '../db/schema'
import type {
  Attachment,
  ExportEnvelope,
  ExportedAttachment,
  ImportMode,
  MergePolicy,
  Vendor,
} from '../db/models'
import { APP_ID, APP_VERSION } from './app'
import {
  LIMITS,
  validateEnvelope,
  type ImportErrorCode,
  type RejectedRecord,
  type ValidationResult,
} from './validate'

class ImportLimitError extends Error {}

function fail(code: ImportErrorCode, message: string): ValidationResult {
  return { ok: false, error: { code, message } }
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
      const byId = new Map(liveVendors.map((vendor): [string, Vendor] => [vendor.id, vendor]))
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
