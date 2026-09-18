import { useLiveQuery } from 'dexie-react-hooks'
import { EmptyState } from '../../components/EmptyState'
import { db } from '../../db/schema'

export function VendorList() {
  const vendors = useLiveQuery(() => db.vendors.orderBy('name').toArray(), [])

  if (vendors === undefined) {
    return (
      <p className="form-summary" role="status">
        Loading vendors…
      </p>
    )
  }

  if (vendors.length === 0) return <EmptyState />

  return (
    <section aria-labelledby="vendors-heading">
      <h1 id="vendors-heading" className="list-title">
        Vendors
      </h1>
      <ul className="manifest">
        {vendors.map((vendor) => (
          <li key={vendor.id} className="manifest__row">
            <a className="manifest__link" href={`#/vendors/${vendor.id}`}>
              <span className="manifest__name">{vendor.name}</span>
              <span className="manifest__meta">
                <span>{vendor.type}</span>
                {vendor.country ? <span className="mono">{vendor.country}</span> : null}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
