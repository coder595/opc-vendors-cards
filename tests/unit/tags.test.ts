import { describe, expect, it } from 'vitest'
import { resolveTag, suggestTags, tagKey } from '../../src/lib/tags'

describe('tags', () => {
  it('treats case, spaces, hyphens and underscores as the same tag', () => {
    expect(tagKey('  LED  Panel ')).toBe('led panel')
    expect(tagKey('led-panel')).toBe(tagKey('LED_panel'))
  })

  it('reuses the existing spelling instead of creating a near-duplicate', () => {
    expect(resolveTag('LED Panel', ['led-panel', 'lighting'])).toBe('led-panel')
    expect(resolveTag('  new   tag ', ['led-panel'])).toBe('new tag')
  })

  it('suggests known tags not yet chosen, filtered by the typed text', () => {
    const known = ['led-panel', 'lighting', 'solar']
    expect(suggestTags(known, ['Solar'], '')).toEqual(['led-panel', 'lighting'])
    expect(suggestTags(known, [], 'li')).toEqual(['lighting'])
    expect(suggestTags(known, [], 'led pan')).toEqual(['led-panel'])
  })
})
