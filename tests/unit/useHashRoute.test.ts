import { describe, expect, it } from 'vitest'
import { parseHash, type Route } from '../../src/lib/useHashRoute'

const cases: [string, Route][] = [
  ['#/vendors', { name: 'vendors' }],
  ['#/vendors/new', { name: 'vendorNew' }],
  ['#/vendors/abc', { name: 'vendorDetail', id: 'abc' }],
  ['#/vendors/abc/edit', { name: 'vendorEdit', id: 'abc' }],
  ['#/vendors?status=quoted', { name: 'vendors' }],
  ['#/people', { name: 'people' }],
  ['#/trip', { name: 'trip' }],
  ['#/me', { name: 'me' }],
  ['#/nonsense', { name: 'vendors' }],
  ['', { name: 'vendors' }],
  ['#main', { name: 'vendors' }],
]

describe('parseHash', () => {
  it.each(cases)('parses %s', (hash, expected) => {
    expect(parseHash(hash)).toEqual(expected)
  })

  it('decodes route ids', () => {
    expect(parseHash('#/vendors/a%20b')).toEqual({ name: 'vendorDetail', id: 'a b' })
  })
})
