import { memo, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { EmptyState } from '../../components/EmptyState'
import { StatusSeal } from '../../components/StatusSeal'
import { STATUSES, STATUS_LABEL, TYPE_LABEL, VENDOR_TYPES } from '../../db/labels'
import type { PipelineStatus, Vendor, VendorType } from '../../db/models'
import { db } from '../../db/schema'
import {
  applyVendorQuery,
  buildSearchIndex,
  defaultVendorQuery,
  type VendorQuery,
  type VendorSort,
} from './vendorQuery'

const VendorRow = memo(function VendorRow({ vendor }: { vendor: Vendor }) {
  return (
    <li className="manifest__row">
      <a className="manifest__link" href={`#/vendors/${vendor.id}`}>
        <span className="manifest__name">{vendor.name}</span>
        <span className="manifest__meta">
          <span>{TYPE_LABEL[vendor.type]}</span>
          {vendor.country ? <span className="mono">{vendor.country}</span> : null}
          <span>{STATUS_LABEL[vendor.status]}</span>
        </span>
        <span className="sr-only">Interest {vendor.rating} of 5</span>
        <StatusSeal status={vendor.status} rating={vendor.rating} size="sm" decorative />
      </a>
    </li>
  )
})

export function VendorList() {
  const data = useLiveQuery(async () => {
    const [vendors, contacts, products] = await Promise.all([
      db.vendors.toArray(),
      db.contacts.toArray(),
      db.products.toArray(),
    ])
    return { vendors, contacts, products }
  }, [])
  const [query, setQuery] = useState<VendorQuery>(defaultVendorQuery)

  const index = useMemo(
    () => buildSearchIndex(data?.vendors ?? [], data?.contacts ?? [], data?.products ?? []),
    [data],
  )
  const results = useMemo(
    () => (data ? applyVendorQuery(data.vendors, index, query) : []),
    [data, index, query],
  )

  if (data === undefined) {
    return (
      <p className="form-summary" role="status">
        Loading vendors…
      </p>
    )
  }

  if (data.vendors.every((vendor) => vendor.deletedAt !== undefined)) return <EmptyState />

  const updateFilters = (patch: Partial<VendorQuery['filters']>) =>
    setQuery((prev) => ({ ...prev, filters: { ...prev.filters, ...patch } }))
  const hasFilters =
    query.text !== '' ||
    query.filters.status !== 'all' ||
    query.filters.country !== 'all' ||
    query.filters.type !== 'all' ||
    query.filters.minRating > 0

  return (
    <section aria-labelledby="vendors-heading">
      <h1 id="vendors-heading" className="list-title">
        Vendors
      </h1>
      <div className="list-controls">
        <div className="field">
          <label htmlFor="vendor-search">Search</label>
          <input
            id="vendor-search"
            type="search"
            value={query.text}
            placeholder="Name, person, product, tag"
            onChange={(event) => setQuery((prev) => ({ ...prev, text: event.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="filter-status">Status</label>
          <select
            id="filter-status"
            value={query.filters.status}
            onChange={(event) =>
              updateFilters({ status: event.target.value as PipelineStatus | 'all' })
            }
          >
            <option value="all">All</option>
            {STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="filter-country">Country</label>
          <select
            id="filter-country"
            value={query.filters.country}
            onChange={(event) => updateFilters({ country: event.target.value })}
          >
            <option value="all">All</option>
            {index.countries.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="filter-type">Type</label>
          <select
            id="filter-type"
            value={query.filters.type}
            onChange={(event) => updateFilters({ type: event.target.value as VendorType | 'all' })}
          >
            <option value="all">All</option>
            {VENDOR_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="filter-rating">Minimum rating</label>
          <select
            id="filter-rating"
            value={String(query.filters.minRating)}
            onChange={(event) => updateFilters({ minRating: Number(event.target.value) })}
          >
            <option value="0">Any</option>
            {[1, 2, 3, 4, 5].map((score) => (
              <option key={score} value={score}>
                {score} of 5
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sort">Sort</label>
          <select
            id="sort"
            value={query.sort}
            onChange={(event) =>
              setQuery((prev) => ({ ...prev, sort: event.target.value as VendorSort }))
            }
          >
            <option value="name">Name</option>
            <option value="updated">Recently updated</option>
            <option value="rating">Rating</option>
          </select>
        </div>
        {hasFilters ? (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setQuery(defaultVendorQuery)}
          >
            Clear filters
          </button>
        ) : null}
      </div>

      <p className="list-count" role="status">
        {results.length} vendor{results.length === 1 ? '' : 's'}
      </p>

      {results.length === 0 ? (
        <p className="empty__body">No vendors match these filters.</p>
      ) : (
        <ul className="manifest">
          {results.map((vendor) => (
            <VendorRow key={vendor.id} vendor={vendor} />
          ))}
        </ul>
      )}
    </section>
  )
}
