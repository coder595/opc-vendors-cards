import { useSyncExternalStore } from 'react'

export type Route =
  | { name: 'vendors' }
  | { name: 'vendorNew' }
  | { name: 'vendorDetail'; id: string }
  | { name: 'vendorEdit'; id: string }
  | { name: 'vendorShare'; id: string }
  | { name: 'share' }
  | { name: 'people' }
  | { name: 'trip' }
  | { name: 'me' }
  | { name: 'import' }

const DEFAULT_HASH = '#/vendors'

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

function getSnapshot() {
  const hash = window.location.hash
  // Only '#/...' hashes are routes; the skip-link target (#main) is not.
  return hash.startsWith('#/') ? hash : DEFAULT_HASH
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('?')[0] ?? ''
  const parts = path.split('/').filter(Boolean).map(safeDecode)

  switch (parts[0]) {
    case 'vendors': {
      const segment = parts[1]
      if (!segment) return { name: 'vendors' }
      if (segment === 'new') return { name: 'vendorNew' }
      if (parts[2] === 'edit') return { name: 'vendorEdit', id: segment }
      if (parts[2] === 'share') return { name: 'vendorShare', id: segment }
      return { name: 'vendorDetail', id: segment }
    }
    case 'share':
      return { name: 'share' }
    case 'people':
      return { name: 'people' }
    case 'trip':
      return { name: 'trip' }
    case 'me':
      return { name: 'me' }
    case 'import':
      return { name: 'import' }
    default:
      return { name: 'vendors' }
  }
}

export function useHashRoute(): Route {
  return parseHash(useSyncExternalStore(subscribe, getSnapshot))
}