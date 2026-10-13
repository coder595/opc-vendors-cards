import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { SelectField } from '../../components/Field'
import { getSettings } from '../../data/settings'
import { db } from '../../db/schema'
import { buildProductCsv, csvFilename } from '../../lib/csv'
import { formatMoney } from '../../lib/currency'
import { downloadBlob } from '../../lib/share'
import { compareRows, type CompareSort } from './compare'

const SORTS: { value: CompareSort; label: string }[] = [
  { value: 'price', label: 'Lowest base price' },
  { value: 'landed', label: 'Lowest landed cost' },
  { value: 'moq', label: 'Lowest MOQ' },
  { value: 'lead', label: 'Shortest lead time' },
  { value: 'rating', label: 'Highest rating' },
]

/** N3: every product of every vendor with a given tag, side by side. */
export function ProductCompare() {
  const data = useLiveQuery(async () => {
    const [vendors, products, settings] = await Promise.all([
      db.vendors.toArray(),
      db.products.toArray(),
      getSettings(),
    ])
    return {
      vendors: vendors.filter((vendor) => vendor.deletedAt === undefined),
      products,
      settings,
    }
  }, [])
  const [chosenTag, setChosenTag] = useState('')
  const [sort, setSort] = useState<CompareSort>('price')

  const tags = useMemo(
    () => [...new Set(data?.vendors.flatMap((vendor) => vendor.tags) ?? [])].sort(),
    [data],
  )
  const tag = tags.includes(chosenTag) ? chosenTag : (tags[0] ?? '')
  const rows = useMemo(
    () =>
      data && tag
        ? compareRows(
            data.vendors,
            data.products,
            tag,
            data.settings.baseCurrency,
            data.settings.rates,
            sort,
            data.settings.landed,
          )
        : [],
    [data, tag, sort],
  )

  if (!data) return null
  const base = data.settings.baseCurrency
  // The landed column and sort only appear once landed cost is set up in Settings.
  const landedOn = data.settings.landed !== undefined

  const exportCsv = () => {
    const csv = buildProductCsv(
      rows.map((row) => row.vendor),
      rows.map((row) => row.product),
      base,
      data.settings.rates,
      data.settings.landed,
    )
    downloadBlob(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
      csvFilename(new Date(), 'products'),
    )
  }

  return (
    <section className="trip__section" aria-labelledby="trip-compare-heading">
      <h2 id="trip-compare-heading">Compare products</h2>
      {tags.length === 0 ? (
        <p className="panel__empty">Tag vendors (e.g. “led-panel”) to compare their products.</p>
      ) : (
        <>
          <div className="compare__controls">
            <SelectField
              id="compare-tag"
              label="Tag"
              value={tag}
              onChange={setChosenTag}
              options={tags.map((value) => ({ value, label: value }))}
            />
            <SelectField
              id="compare-sort"
              label="Sort by"
              value={sort}
              onChange={setSort}
              options={landedOn ? SORTS : SORTS.filter((option) => option.value !== 'landed')}
            />
          </div>
          {rows.length === 0 ? (
            <p className="panel__empty">No products recorded for vendors tagged “{tag}”.</p>
          ) : (
            <>
              <div className="compare__scroll">
                <table className="compare" aria-labelledby="trip-compare-heading">
                  <thead>
                    <tr>
                      <th scope="col">Product</th>
                      <th scope="col">Vendor</th>
                      <th scope="col">Price</th>
                      <th scope="col">Price ({base})</th>
                      {landedOn ? <th scope="col">Landed ({base})</th> : null}
                      <th scope="col">MOQ</th>
                      <th scope="col">Lead (days)</th>
                      <th scope="col">Rating</th>
                      <th scope="col">Booth</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ product, vendor, basePrice, landedCost }) => (
                      <tr key={product.id}>
                        <th scope="row">{product.name}</th>
                        <td>
                          <a href={`#/vendors/${vendor.id}`}>{vendor.name}</a>
                        </td>
                        <td className="mono">
                          {product.price === undefined
                            ? '—'
                            : formatMoney(product.price, product.currency)}
                        </td>
                        <td className="mono">
                          {basePrice === null ? '—' : formatMoney(basePrice, base)}
                        </td>
                        {landedOn ? (
                          <td className="mono">
                            {landedCost === null ? '—' : formatMoney(landedCost, base)}
                          </td>
                        ) : null}
                        <td className="mono">{product.moq ?? '—'}</td>
                        <td className="mono">{product.leadTimeDays ?? '—'}</td>
                        <td className="mono">{vendor.rating}</td>
                        <td className="mono">
                          {[vendor.fair.hall, vendor.fair.booth].filter(Boolean).join(' ') || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" className="btn btn--ghost" onClick={exportCsv}>
                Export these as CSV
              </button>
            </>
          )}
        </>
      )}
    </section>
  )
}
