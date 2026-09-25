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
  await db.certs.add(cert)
  return cert.id
}

export async function updateCert(id: string, patch: Partial<CertInput>): Promise<void> {
  const safe = definedPatch(patch)
  if (safe.name !== undefined) requireText(safe.name, 'Certification name')
  const count = await db.certs.update(id, safe)
  if (count === 0) throw new Error(`Certification ${id} not found`)
}

export async function deleteCert(id: string): Promise<void> {
  await db.certs.delete(id)
}
