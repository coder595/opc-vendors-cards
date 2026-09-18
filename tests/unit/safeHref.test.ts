import { describe, expect, it } from 'vitest'
import { safeHref } from '../../src/lib/safeHref'

describe('safeHref', () => {
  it('allows http, https, mailto and tel', () => {
    expect(safeHref('https://acme.com')).toBe('https://acme.com/')
    expect(safeHref('http://acme.com')).toBe('http://acme.com/')
    expect(safeHref('mailto:li@acme.com')).toBe('mailto:li@acme.com')
    expect(safeHref('tel:+8613800000000')).toBe('tel:+8613800000000')
  })

  it('upgrades a bare host to https', () => {
    expect(safeHref('acme.com')).toBe('https://acme.com/')
  })

  it('rejects executable and unknown schemes', () => {
    expect(safeHref('javascript:alert(1)')).toBeUndefined()
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeUndefined()
    expect(safeHref('vbscript:msgbox(1)')).toBeUndefined()
    expect(safeHref('file:///etc/passwd')).toBeUndefined()
  })

  it('returns undefined for empty input', () => {
    expect(safeHref('')).toBeUndefined()
    expect(safeHref(undefined)).toBeUndefined()
    expect(safeHref('   ')).toBeUndefined()
  })
})
