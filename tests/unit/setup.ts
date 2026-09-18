import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom's crypto may lack randomUUID; the data layer relies on it.
if (globalThis.crypto && typeof globalThis.crypto.randomUUID !== 'function') {
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    value: () => `test-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`,
    configurable: true,
  })
}

afterEach(() => {
  // Data-layer tests run under the node environment where there is no DOM.
  if (typeof document !== 'undefined') cleanup()
  if (typeof window !== 'undefined') window.location.hash = ''
})
