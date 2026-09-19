import type { Theme } from '../db/models'

export const THEME_STORAGE_KEY = 'opc.theme'
const LIGHT_THEME_COLOR = '#D8321F'
const DARK_THEME_COLOR = '#14151A'

export type ResolvedTheme = 'light' | 'dark'

/** The preference last applied in this session (authoritative for OS-change handling). */
let currentPreference: Theme = 'system'

export function resolveTheme(preference: Theme): ResolvedTheme {
  if (preference === 'system') {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    return media?.matches ? 'dark' : 'light'
  }
  return preference
}

/**
 * Synchronous mirror of the stored preference so first paint is themed before
 * IndexedDB (async) resolves. CSP bans inline scripts, so this runs in main.tsx.
 */
export function readStoredTheme(): Theme {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (value === 'light' || value === 'dark' || value === 'system') return value
  } catch {
    // localStorage unavailable (private mode / disabled) — fall back to system.
  }
  return 'system'
}

function storeTheme(preference: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // Non-fatal: the theme still applies for this session.
  }
}

export function applyTheme(preference: Theme): ResolvedTheme {
  const resolved = resolveTheme(preference)
  document.documentElement.dataset.theme = resolved
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute('content', resolved === 'dark' ? DARK_THEME_COLOR : LIGHT_THEME_COLOR)
  }
  return resolved
}

/** Persist the preference and apply it immediately (settings control + startup). */
export function setThemePreference(preference: Theme): void {
  currentPreference = preference
  storeTheme(preference)
  applyTheme(preference)
}

/** Apply the mirrored preference before React renders. */
export function initTheme(): void {
  currentPreference = readStoredTheme()
  applyTheme(currentPreference)
}

/** Re-resolve while the OS scheme changes, but only while following the system. */
export function watchSystemTheme(): () => void {
  const media = window.matchMedia?.('(prefers-color-scheme: dark)')
  if (!media) return () => {}
  const onChange = () => {
    if (currentPreference === 'system') applyTheme('system')
  }
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}
