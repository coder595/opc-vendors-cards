import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { StatusSeal } from '../../components/StatusSeal'
import { STATUSES } from '../../db/labels'
import type { Vendor } from '../../db/models'
import { db } from '../../db/schema'

const collator = new Intl.Collator(undefined, { sensitivity: 'base' })
const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

function formatDate(ms: number): string {
  return dateFormatter.format(new Date(ms))
}

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
    return { vendors, vendorById, statusCounts, countries, tasks, booths }
  }, [data])

  if (data === undefined) {
    return (
      <p className="form-summary" role="status">
        Loading trip…
      </p>
    )
  }

  if (summary === null) return null

  const { vendors, vendorById, statusCounts, countries, tasks, booths } = summary

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
          <dt>Vendors</dt>
          <dd className="mono">{vendors.length}</dd>
        </div>
        <div>
          <dt>Countries</dt>
          <dd className="mono">{countries.size}</dd>
        </div>
        <div>
          <dt>Open tasks</dt>
          <dd className="mono">{tasks.length}</dd>
        </div>
        <div>
          <dt>Booths</dt>
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
    </section>
  )
}
