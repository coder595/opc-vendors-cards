import { describe, expect, it } from 'vitest'
import { buildProductCsv, buildVendorCsv, csvCell, csvFilename, toCsv } from '../../src/lib/csv'
import { makeVendor } from './helpers/fixtures'

describe('csvCell', () => {
  it('prefixes formula-leading characters', () => {
    expect(csvCell('=cmd')).toBe("'=cmd")
    expect(csvCell('+1')).toBe("'+1")
    expect(csvCell('-2')).toBe("'-2")
    expect(csvCell('@x')).toBe("'@x")
    expect(csvCell('\tstart')).toBe("'\tstart")
    expect(csvCell('\nstart')).toBe(`"'\nstart"`)
    expect(csvCell('\rstart')).toBe(`"'\rstart"`)
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

describe('buildProductCsv', () => {
  const vendor = makeVendor({
    name: 'Acme',
    rating: 4,
    tags: ['led', 'panel'],
    fair: { edition: 'Canton 138', hall: '9.1', booth: 'B12' },
  })
  const product = {
    id: 'p1',
    vendorId: vendor.id,
    name: 'LED panel 60x60',
    unit: 'pc',
    currency: 'CNY',
    price: 72,
    moq: 500,
    orderQty: 1200,
    tiers: [
      { minQty: 1000, unitPrice: 68 },
      { minQty: 5000, unitPrice: 64 },
    ],
    leadTimeDays: 25,
    photoAttachmentIds: [],
    createdAt: 1,
    updatedAt: 1,
  }

  it('emits one row per product with base-currency price and tier breaks', () => {
    const csv = buildProductCsv([vendor], [product], 'USD', { CNY: 7.2 })
    const [header, row] = csv.replace('﻿', '').split('\r\n')
    expect(header).toContain('Price (USD)')
    expect(row).toBe(
      'Acme,9.1,B12,LED panel 60x60,pc,CNY,72,10.00,500,1200,1000: 68; 5000: 64,25,,4,led; panel,,,,,,',
    )
  })

  it('adds packing columns and a landed cost in the base currency decimals (N2)', () => {
    const packed = {
      ...product,
      incoterm: 'FOB' as const,
      pcsPerCarton: 20,
      cartonLengthCm: 50,
      cartonWidthCm: 40,
      cartonHeightCm: 30,
      cartonGrossKg: 12.5,
    }
    const landed = { freightMode: 'percent' as const, freight: 10, dutyPercent: 5, vatPercent: 5 }
    // 72 CNY / 18 = 4 OMR → freight 4.4 → duty 4.62 → VAT 4.851
    const csv = buildProductCsv([vendor], [packed], 'OMR', { CNY: 18 }, landed)
    const [header, row] = csv.replace('\uFEFF', '').split('\r\n')
    expect(header).toContain('Incoterm,Pcs per carton,Carton (cm),CBM,Gross kg,Landed (OMR)')
    expect(row).toContain(',4.000,')
    expect(row?.endsWith(',FOB,20,50x40x30,0.060,12.5,4.851')).toBe(true)
  })

  it('leaves the base price empty when no rate exists and skips orphans', () => {
    const orphan = { ...product, id: 'p2', vendorId: 'gone' }
    const csv = buildProductCsv([vendor], [product, orphan], 'EUR', {})
    const rows = csv.split('\r\n')
    expect(rows).toHaveLength(2)
    expect(rows[1]).toContain(',CNY,72,,500,')
  })

  it('names the file by kind', () => {
    expect(csvFilename(new Date(2026, 9, 1), 'products')).toBe('opc-products-2026-10-01.csv')
  })
})
