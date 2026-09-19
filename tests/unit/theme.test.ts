import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyTheme,
  initTheme,
  readStoredTheme,
  resolveTheme,
  setThemePreference,
  THEME_STORAGE_KEY,
  watchSystemTheme,
} from '../../src/lib/theme'

interface MediaMock {
  matches: boolean
  addEventListener: (type: string, cb: () => void) => void
  removeEventListener: (type: string, cb: () => void) => void
}

function mockMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>()
  const mql: MediaMock = {
    matches,
    addEventListener: (_type, cb) => listeners.add(cb),
    removeEventListener: (_type, cb) => listeners.delete(cb),
  }
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn(() => mql),
  })
  return { mql, listeners }
}

describe('theme', () => {
  let meta: HTMLMetaElement

  beforeEach(() => {
    window.localStorage.clear()
    delete document.documentElement.dataset.theme
    meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    document.head.append(meta)
  })

  afterEach(() => {
    meta.remove()
    vi.restoreAllMocks()
  })

  it('resolves explicit preferences without touching the system query', () => {
    mockMatchMedia(true)
    expect(resolveTheme('light')).toBe('light')
    expect(resolveTheme('dark')).toBe('dark')
  })

  it('follows the system scheme for the system preference', () => {
    mockMatchMedia(true)
    expect(resolveTheme('system')).toBe('dark')
    mockMatchMedia(false)
    expect(resolveTheme('system')).toBe('light')
  })

  it('defaults to system and reads a stored mirror', () => {
    expect(readStoredTheme()).toBe('system')
    setThemePreference('dark')
    expect(readStoredTheme()).toBe('dark')
  })

  it('applies the resolved theme to the document and theme-color meta', () => {
    mockMatchMedia(false)
    setThemePreference('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(meta.getAttribute('content')).toBe('#14151A')
    setThemePreference('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(meta.getAttribute('content')).toBe('#D8321F')
  })

  it('initTheme applies the mirrored preference before render', () => {
    mockMatchMedia(false)
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    initTheme()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('re-resolves on system changes only while following the system', () => {
    const { mql, listeners } = mockMatchMedia(false)
    initTheme()
    const stop = watchSystemTheme()
    expect(listeners.size).toBe(1)
    applyTheme('system')
    expect(document.documentElement.dataset.theme).toBe('light')
    mql.matches = true
    for (const listener of listeners) listener()
    expect(document.documentElement.dataset.theme).toBe('dark')

    // An explicit choice must not be overridden by an OS scheme change.
    setThemePreference('light')
    mql.matches = true
    for (const listener of listeners) listener()
    expect(document.documentElement.dataset.theme).toBe('light')
    stop()
    expect(listeners.size).toBe(0)
  })
})
