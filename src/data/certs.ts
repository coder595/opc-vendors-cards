import { db } from '../db/schema'
import type { Certification, CertInput } from '../db/models'
import { definedPatch, requireText } from './guards'

export async function addCert(vendorId: string, input: CertInput): Promise<string> {
  const cert: Certification = {
    id: crypto.randomUUID(),
    vendorId,
    name: requireText(input.name, 'Certification name'),
    number: input.number,
    issuer: input.issuer,
    expiry: input.expiry,
    updatedAt: Date.now(),
  }
  await db.transaction('rw', [db.certs, db.vendors], async () => {
    await db.certs.add(cert)
    await db.vendors.update(vendorId, { updatedAt: Date.now() })
  })
  return cert.id
}

export async function updateCert(id: string, patch: Partial<CertInput>): Promise<void> {
  const safe = definedPatch(patch)
  if (safe.name !== undefined) requireText(safe.name, 'Certification name')
  const cert = await db.certs.get(id)
  if (!cert) throw new Error(`Certification ${id} not found`)
  await db.transaction('rw', [db.certs, db.vendors], async () => {
    const count = await db.certs.update(id, safe)
    if (count === 0) throw new Error(`Certification ${id} not found`)
    await db.vendors.update(cert.vendorId, { updatedAt: Date.now() })
  })
}

export async function deleteCert(id: string): Promise<void> {
  const cert = await db.certs.get(id)
  if (!cert) return
  await db.transaction('rw', [db.certs, db.vendors], async () => {
    await db.certs.delete(id)
    await db.vendors.update(cert.vendorId, { updatedAt: Date.now() })
  })
}
