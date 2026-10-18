import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { StatusSeal } from '../../components/StatusSeal'
import { LoadingSpinner } from '../../components/LoadingSpinner'
import { STATUSES } from '../../db/labels'
import type { Vendor } from '../../db/models'
import { db } from '../../db/schema'
import { formatDate } from '../../lib/format'
import { ProductCompare } from './ProductCompare'

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

function startOfToday(): number {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function boothKey(vendor: Vendor): string {
  return `${vendor.fair.hall ?? ''} ${vendor.fair.booth ?? ''}`.trim()
}

export function TripScreen() {
  const data = useLiveQuery(async () => {
    const [vendors, notes] = await Promise.all([db.vendors.toArray(), db.notes.toArray()])
    return { vendors: vendors.filter((vendor) => vendor.deletedAt === undefined), notes }
  }, [])

  const summary = useMemo(() => {
    if (!data) return null
    const { vendors, notes } = data
    const vendorById = new Map(vendors.map((vendor): [string, Vendor] => [vendor.id, vendor]))
    const statusCounts = STATUSES.map((status) => ({
      ...status,
      count: vendors.filter((vendor) => vendor.status === status.value).length,
    })).filter((status) => status.count > 0)
    const countries = new Set(vendors.map((vendor) => vendor.country).filter(Boolean))
    const tasks = notes
      .filter((note) => note.isTask && !note.done && vendorById.has(note.vendorId))
      .sort(
        (a, b) => (a.dueDate ?? Number.POSITIVE_INFINITY) - (b.dueDate ?? Number.POSITIVE_INFINITY),
      )
    const booths = vendors
      .filter((vendor) => boothKey(vendor) !== '')
      .sort((a, b) => collator.compare(boothKey(a), boothKey(b)))
    const toRevisit = vendors
      .filter((vendor) => vendor.revisit)
      .sort((a, b) => {
        const hallCmp = collator.compare(a.fair.hall ?? '', b.fair.hall ?? '')
        if (hallCmp !== 0) return hallCmp
        return collator.compare(a.fair.booth ?? '', b.fair.booth ?? '')
      })
    const revisitByHall = new Map<string, Vendor[]>()
    for (const vendor of toRevisit) {
      const hall = vendor.fair.hall ?? ''
      const group = revisitByHall.get(hall) ?? []
      group.push(vendor)
      revisitByHall.set(hall, group)
    }
    return { vendors, vendorById, statusCounts, countries, tasks, booths, revisitByHall }
  }, [data])

  if (data === undefined) {
    return <LoadingSpinner>Loading trip…</LoadingSpinner>
  }

  if (summary === null) return null

  const { vendors, vendorById, statusCounts, countries, tasks, booths, revisitByHall } = summary

  if (vendors.length === 0) {
    return (
      <section className="trip" aria-labelledby="trip-heading">
        <h1 id="trip-heading" className="list-title">
          Trip summary
        </h1>
        <p className="empty__body">
          No vendors yet. Capture one and its fair location, pipeline status and tasks appear here.
        </p>
        <div className="empty__actions">
          <a className="btn btn--primary" href="#/vendors/new">
            Add vendor
          </a>
        </div>
      </section>
    )
  }

  const overdueBefore = startOfToday()

  return (
    <section className="trip" aria-labelledby="trip-heading">
      <div className="trip__head">
        <h1 id="trip-heading">Trip summary</h1>
        <button type="button" className="btn btn--ghost trip__print" onClick={() => window.print()}>
          Print summary
        </button>
      </div>

      <dl className="trip__stats">
        <div>
          <dt>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M4 7V4h16v3" />
              <path d="M9 20h6" />
              <path d="M12 4v16" />
              <path d="M4 7h16l-2 10H6L4 7z" />
            </svg>
            Vendors
          </dt>
          <dd className="mono">{vendors.length}</dd>
        </div>
        <div>
          <dt>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="7" r="4" />
              <path d="M5 21a8 8 0 0114 0" />
            </svg>
            Countries
          </dt>
          <dd className="mono">{countries.size}</dd>
        </div>
        <div>
          <dt>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
            </svg>
            Open tasks
          </dt>
          <dd className="mono">{tasks.length}</dd>
        </div>
        <div>
          <dt>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 21s-6-5.2-6-10a6 6 0 1112 0c0 4.8-6 10-6 10z" />
              <circle cx="12" cy="11" r="2" />
            </svg>
            Booths
          </dt>
          <dd className="mono">{booths.length}</dd>
        </div>
      </dl>

      <section className="trip__section" aria-labelledby="trip-pipeline-heading">
        <h2 id="trip-pipeline-heading">Pipeline</h2>
        <ul className="trip__list">
          {statusCounts.map((status) => (
            <li key={status.value} className="trip__row">
              <span>{status.label}</span>
              <span className="mono">{status.count}</span>
            </li>
          ))}
        </ul>
      </section>

      <ProductCompare />

      <section className="trip__section" aria-labelledby="trip-tasks-heading">
        <h2 id="trip-tasks-heading">Open tasks</h2>
        {tasks.length === 0 ? (
          <p className="panel__empty">No open tasks.</p>
        ) : (
          <ul className="trip__list">
            {tasks.map((note) => {
              const vendor = vendorById.get(note.vendorId)
              const overdue = note.dueDate !== undefined && note.dueDate < overdueBefore
              return (
                <li key={note.id} className="trip__row">
                  <span>{note.text}</span>
                  {vendor ? (
                    <a href={`#/vendors/${vendor.id}`}>
                      <span className="sr-only">Task vendor: </span>
                      {vendor.name}
                    </a>
                  ) : null}
                  {note.dueDate !== undefined ? (
                    <span className={overdue ? 'mono note__due' : 'mono'}>
                      {overdue ? 'Overdue ' : 'Due '}
                      {formatDate(note.dueDate)}
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="trip__section" aria-labelledby="trip-booths-heading">
        <h2 id="trip-booths-heading">Booths</h2>
        {booths.length === 0 ? (
          <p className="panel__empty">No booth locations recorded.</p>
        ) : (
          <ul className="trip__list">
            {booths.map((vendor) => (
              <li key={vendor.id} className="trip__row">
                <a href={`#/vendors/${vendor.id}`}>
                  <span className="sr-only">Booth: </span>
                  {vendor.name}
                </a>
                <span className="mono">
                  {[vendor.fair.hall, vendor.fair.booth].filter(Boolean).join(' ')}
                </span>
                <StatusSeal status={vendor.status} size="sm" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="trip__section" aria-labelledby="trip-revisit-heading">
        <h2 id="trip-revisit-heading">To revisit</h2>
        {revisitByHall.size === 0 ? (
          <p className="panel__empty">No vendors flagged for revisit.</p>
        ) : (
          [...revisitByHall.entries()]
            .sort(([a], [b]) => collator.compare(a, b))
            .map(([hall, vendors]) => (
              <div key={hall}>
                <h3 className="trip__hall">{hall || 'No hall'}</h3>
                <ul className="trip__list">
                  {vendors.map((vendor) => (
                    <li key={vendor.id} className="trip__row">
                      <a href={`#/vendors/${vendor.id}`}>{vendor.name}</a>
                      <span className="mono">
                        {[vendor.fair.hall, vendor.fair.booth].filter(Boolean).join(' ')}
                      </span>
                      <StatusSeal status={vendor.status} size="sm" />
                    </li>
                  ))}
                </ul>
              </div>
            ))
        )}
      </section>
    </section>
  )
}
