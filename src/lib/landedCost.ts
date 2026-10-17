import type { Product, Settings } from '../db/models'
import { convertToBase } from './currency'

export const INCOTERMS = ['EXW', 'FOB', 'CIF'] as const

/** Carton volume in m³ from centimetres, or null when a side is missing. */
export function cartonCbm(
  product: Pick<Product, 'cartonLengthCm' | 'cartonWidthCm' | 'cartonHeightCm'>,
): number | null {
  const { cartonLengthCm: l, cartonWidthCm: w, cartonHeightCm: h } = product
  if (!l || !w || !h) return null
  return (l * w * h) / 1_000_000
}

/**
 * Estimated landed cost of one unit in the base currency, or null when the
 * price, its rate, the landed-cost settings or (for per-CBM freight) the packing is missing.
 * Freight is skipped for CIF (already in the price). Duty is charged on price + freight,
 * VAT on price + freight + duty.
 * ponytail: EXW is treated like FOB (no inland trucking or port fees); add a per-unit
 * origin charge if EXW quotes turn out to matter.
 */
export function landedUnitCost(
  product: Pick<
    Product,
    | 'price'
    | 'currency'
    | 'incoterm'
    | 'pcsPerCarton'
    | 'cartonLengthCm'
    | 'cartonWidthCm'
    | 'cartonHeightCm'
  >,
  settings: Pick<Settings, 'baseCurrency' | 'rates' | 'landed'>,
): number | null {
  const landed = settings.landed
  if (!landed || product.price === undefined) return null
  const unit = convertToBase(product.price, product.currency, settings.baseCurrency, settings.rates)
  if (unit === null) return null

  let freight = 0
  if (product.incoterm !== 'CIF') {
    if (landed.freightMode === 'percent') {
      freight = (unit * landed.freight) / 100
    } else {
      const cbm = cartonCbm(product)
      if (cbm === null || !product.pcsPerCarton) return null
      freight = (cbm / product.pcsPerCarton) * landed.freight
    }
  }
  const customsValue = unit + freight
  const duty = (customsValue * landed.dutyPercent) / 100
  const vat = ((customsValue + duty) * landed.vatPercent) / 100
  return customsValue + duty + vat
}

/** One-line packing summary, e.g. "FOB · 20 pcs/ctn · 50×40×30 cm · 0.060 m³ · 12.5 kg", or "" when empty. */
export function packingSummary(
  product: Pick<
    Product,
    | 'incoterm'
    | 'pcsPerCarton'
    | 'cartonLengthCm'
    | 'cartonWidthCm'
    | 'cartonHeightCm'
    | 'cartonGrossKg'
  >,
): string {
  const cbm = cartonCbm(product)
  return [
    product.incoterm,
    product.pcsPerCarton ? `${product.pcsPerCarton} pcs/ctn` : undefined,
    cbm !== null
      ? `${product.cartonLengthCm}×${product.cartonWidthCm}×${product.cartonHeightCm} cm · ${cbm.toFixed(3)} m³`
      : undefined,
    product.cartonGrossKg ? `${product.cartonGrossKg} kg` : undefined,
  ]
    .filter(Boolean)
    .join(' · ')
}
