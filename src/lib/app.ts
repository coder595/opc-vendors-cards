export const APP_ID = 'opc-vendors-cards'

/**
 * Injected by Vite `define`. The `typeof` guard keeps tests and non-Vite
 * contexts from throwing on the undeclared identifier.
 */
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'
export const APP_BUILT_AT = typeof __APP_BUILT_AT__ === 'string' ? __APP_BUILT_AT__ : ''

/** Stable React key for unsaved form rows; not a persisted id. */
export function newKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `key-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
  )
}
