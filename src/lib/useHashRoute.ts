import { useSyncExternalStore } from 'react'

const DEFAULT_ROUTE = '#/vendors'

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

function getSnapshot() {
  const hash = window.location.hash
  // Only '#/...' hashes are routes; the skip-link target (#main) is not.
  return hash.startsWith('#/') ? hash : DEFAULT_ROUTE
}

export function useHashRoute(): string {
  return useSyncExternalStore(subscribe, getSnapshot)
}
