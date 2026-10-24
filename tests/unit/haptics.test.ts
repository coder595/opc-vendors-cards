import { afterEach, describe, expect, it, vi } from 'vitest'
import { haptic } from '../../src/lib/haptics'

function stubMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: reduce && query.includes('reduce') })),
  )
}

describe('haptic', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(navigator, 'vibrate')
  })

  it('is a no-op where vibrate is missing (iOS Safari, jsdom)', () => {
    Reflect.deleteProperty(navigator, 'vibrate')
    expect(() => haptic('success')).not.toThrow()
  })

  it('vibrates a short pulse on success and a distinct pattern on error', () => {
    stubMotion(false)
    const vibrate = vi.fn(() => true)
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
    haptic('success')
    haptic('error')
    expect(vibrate).toHaveBeenNthCalledWith(1, 20)
    expect(vibrate).toHaveBeenNthCalledWith(2, [30, 60, 30])
  })

  it('skips vibration when the user prefers reduced motion', () => {
    stubMotion(true)
    const vibrate = vi.fn(() => true)
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
    haptic('success')
    expect(vibrate).not.toHaveBeenCalled()
  })

  it('swallows a throwing vibrate', () => {
    stubMotion(false)
    Object.defineProperty(navigator, 'vibrate', {
      value: () => {
        throw new Error('blocked')
      },
      configurable: true,
    })
    expect(() => haptic('error')).not.toThrow()
  })
})
