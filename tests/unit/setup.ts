import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  // Data-layer tests run under the node environment where there is no DOM.
  if (typeof document !== 'undefined') cleanup()
  if (typeof window !== 'undefined') window.location.hash = ''
})
