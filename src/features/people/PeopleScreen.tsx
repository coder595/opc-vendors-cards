import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { EmailLink, PhoneLink } from '../../components/ContactLinks'
import { LoadingSpinner } from '../../components/LoadingSpinner'
import type { Contact, Vendor } from '../../db/models'
import { db } from '../../db/schema'
import { foldText } from '../vendors/vendorQuery'

const collator = new Intl.Collator(undefined, { sensitivity: 'base' })

interface Person {
  contact: Contact
  vendor: Vendor
}

function hasChannels(contact: Contact): boolean {
  return Boolean(contact.phone || contact.email || contact.whatsapp || contact.wechat)
}

export function PeopleScreen() {
  const data = useLiveQuery(async () => {
    const [contacts, vendors] = await Promise.all([db.contacts.toArray(), db.vendors.toArray()])
    return { contacts, vendors }
  }, [])
  const [text, setText] = useState('')

  const people = useMemo<Person[]>(() => {
    if (!data) return []
    const vendorById = new Map(
      data.vendors
        .filter((vendor) => vendor.deletedAt === undefined)
        .map((vendor): [string, Vendor] => [vendor.id, vendor]),
    )
    const needle = foldText(text)
    return data.contacts
      .flatMap((contact) => {
        const vendor = vendorById.get(contact.vendorId)
        return vendor ? [{ contact, vendor }] : []
      })
      .filter(({ contact, vendor }) => {
        if (needle === '') return true
        return foldText(`${contact.name} ${contact.position ?? ''} ${vendor.name}`).includes(needle)
      })
      .sort((a, b) => collator.compare(a.contact.name, b.contact.name))
  }, [data, text])

  const hasLiveContacts = useMemo(() => {
    if (!data) return false
    const liveVendorIds = new Set(
      data.vendors.filter((vendor) => vendor.deletedAt === undefined).map((vendor) => vendor.id),
    )
    return data.contacts.some((contact) => liveVendorIds.has(contact.vendorId))
  }, [data])

  if (data === undefined) {
    return <LoadingSpinner>Loading people…</LoadingSpinner>
  }

  return (
    <section aria-labelledby="people-heading">
      <h1 id="people-heading" className="list-title">
        People
      </h1>
      <div className="list-controls">
        <div className="field">
          <label htmlFor="people-search">Search</label>
          <input
            id="people-search"
            type="search"
            value={text}
            placeholder="Name, role, company"
            onChange={(event) => setText(event.target.value)}
          />
        </div>
      </div>
      <p className="list-count" role="status">
        {people.length} {people.length === 1 ? 'person' : 'people'}
      </p>

      {people.length === 0 ? (
        <>
          <p className="empty__body">
            {hasLiveContacts
              ? 'No people match this search.'
              : 'No people yet. Add a person to a vendor to see them here.'}
          </p>
          {hasLiveContacts ? null : (
            <div className="empty__actions">
              <a className="btn btn--primary" href="#/vendors/new">
                Add vendor
              </a>
            </div>
          )}
        </>
      ) : (
        <ul className="record-list">
          {people.map(({ contact, vendor }) => (
            <li key={contact.id} className="record">
              <div className="record__body">
                <p className="record__title">
                  {contact.name}
                  {contact.isPrimary ? <span className="chip">Primary</span> : null}
                </p>
                <p className="record__sub">
                  {contact.position ? <span>{contact.position}, </span> : null}
                  <a href={`#/vendors/${vendor.id}`}>
                    <span className="sr-only">{contact.name} at </span>
                    {vendor.name}
                  </a>
                </p>
                {hasChannels(contact) ? (
                  <p className="record__meta mono">
                    {contact.phone ? <PhoneLink phone={contact.phone} /> : null}
                    {contact.email ? <EmailLink email={contact.email} /> : null}
                    {contact.whatsapp ? <PhoneLink phone={contact.whatsapp} whatsapp /> : null}
                    {contact.wechat ? <span>WeChat {contact.wechat}</span> : null}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
