import { LIMITS } from '../lib/validate'

export function requireText(value: unknown, field: string, allowEmpty = false): string {
  if (typeof value !== 'string') throw new Error(`${field} must be text`)
  if (!allowEmpty && value.trim() === '') throw new Error(`${field} must not be empty`)
  if (value.length > LIMITS.maxStringLength) throw new Error(`${field} is too long`)
  return value
}

/**
 * Removes explicitly-undefined keys so a `Partial<Input>` patch cannot clobber
 * a required field (there is no `exactOptionalPropertyTypes` in this project).
 */
export function definedPatch<T extends object>(patch: T): Partial<T> {
  const out: Partial<T> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      ;(out as Record<string, unknown>)[key] = value
    }
  }
  return out
}
