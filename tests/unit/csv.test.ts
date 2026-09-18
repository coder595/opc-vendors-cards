import { describe, expect, it } from 'vitest'
import { buildVendorCsv, csvCell, csvFilename, toCsv } from '../../src/lib/csv'
import { makeVendor } from './helpers/fixtures'

describe('csvCell', () => {
  it('prefixes formula-leading characters', () => {
    expect(csvCell('=cmd')).toBe("'=cmd")
    expect(csvCell('+1')).toBe("'+1")
    expect(csvCell('-2')).toBe("'-2")
    expect(csvCell('@x')).toBe("'@x")
    expect(csvCell('\tstart')).toBe("'\tstart")
  })

  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('he said "hi"')).toBe('"he said ""hi"""')
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"')
  })

  it('leaves plain values untouched', () => {
    expect(csvCell('ACME')).toBe('ACME')
    expect(csvCell(5)).toBe('5')
    expect(csvCell(undefined)).toBe('')
  })
})

describe('buildVendorCsv', () => {
  it('emits a BOM, a header and CRLF rows with guarded cells', () => {
    const csv = buildVendorCsv([makeVendor({ name: '=EVIL', tags: ['a', 'b'] })], [], [])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('Name,Type,Status')
    expect(csv).toContain('\r\n')
    expect(csv).toContain("'=EVIL")
    expect(csv).toContain('a; b')
  })

  it('preserves CJK', () => {
    const csv = buildVendorCsv([makeVendor({ name: '柏林金属' })], [], [])
    expect(csv).toContain('柏林金属')
  })
})

describe('csvFilename', () => {
  it('uses a local date', () => {
    expect(csvFilename(new Date(2026, 9, 5))).toBe('opc-vendors-2026-10-05.csv')
  })
})

describe('toCsv', () => {
  it('joins rows with CRLF', () => {
    expect(toCsv([['a', 'b'], ['c']])).toBe('a,b\r\nc')
  })
})
