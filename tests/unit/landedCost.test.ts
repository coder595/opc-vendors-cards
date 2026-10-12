import { describe, expect, it } from 'vitest'
import type { Settings } from '../../src/db/models'
import { cartonCbm, landedUnitCost, packingSummary } from '../../src/lib/landedCost'

// OMR books: 1 OMR = 18.5 CNY, freight 10 %, duty 5 %, VAT 5 %.
const settings: Pick<Settings, 'baseCurrency' | 'rates' | 'landed'> = {
  baseCurrency: 'OMR',
  rates: { CNY: 18.5 },
  landed: { freightMode: 'percent', freight: 10, dutyPercent: 5, vatPercent: 5 },
}
const product = { price: 37, currency: 'CNY' } // = 2 OMR

describe('landedUnitCost (N2)', () => {
  it('adds freight %, then duty, then VAT on the running total', () => {
    // 2 → +10 % freight 2.2 → +5 % duty 2.31 → +5 % VAT 2.4255
    expect(landedUnitCost({ ...product, incoterm: 'FOB' }, settings)).toBeCloseTo(2.4255, 6)
  })

  it('skips freight for CIF quotes', () => {
    // 2 → duty 2.1 → VAT 2.205
    expect(landedUnitCost({ ...product, incoterm: 'CIF' }, settings)).toBeCloseTo(2.205, 6)
  })

  it('charges per-CBM freight by the unit share of a carton', () => {
    const perCbm = { ...settings, landed: { ...settings.landed!, freightMode: 'perCbm' as const, freight: 40 } }
    // carton 50×40×30 cm = 0.06 m³, 20 pcs → 0.003 m³/unit × 40 = 0.12 freight
    const packed = { ...product, pcsPerCarton: 20, cartonLengthCm: 50, cartonWidthCm: 40, cartonHeightCm: 30 }
    expect(landedUnitCost(packed, perCbm)).toBeCloseTo(2.12 * 1.05 * 1.05, 6)
    expect(landedUnitCost(product, perCbm)).toBeNull()
  })

  it('returns null without a price, a rate or landed-cost settings', () => {
    expect(landedUnitCost({ currency: 'CNY' }, settings)).toBeNull()
    expect(landedUnitCost({ price: 5, currency: 'EUR' }, settings)).toBeNull()
    expect(landedUnitCost(product, { ...settings, landed: undefined })).toBeNull()
  })

  it('computes carton volume in cubic metres', () => {
    expect(cartonCbm({ cartonLengthCm: 50, cartonWidthCm: 40, cartonHeightCm: 30 })).toBeCloseTo(0.06, 9)
    expect(cartonCbm({ cartonLengthCm: 50, cartonWidthCm: 40 })).toBeNull()
  })
})

describe('packingSummary', () => {
  it('lists only the packing fields that are set', () => {
    expect(
      packingSummary({ incoterm: 'FOB', pcsPerCarton: 20, cartonLengthCm: 50, cartonWidthCm: 40, cartonHeightCm: 30, cartonGrossKg: 12.5 }),
    ).toBe('FOB · 20 pcs/ctn · 50×40×30 cm · 0.060 m³ · 12.5 kg')
    expect(packingSummary({ incoterm: 'CIF' })).toBe('CIF')
    expect(packingSummary({})).toBe('')
  })
})
