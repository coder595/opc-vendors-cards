import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BlobImage } from '../../components/BlobImage'
import { RatingField, SelectField } from '../../components/Field'
import { StatusSeal } from '../../components/StatusSeal'
import { Tabs, type TabItem } from '../../components/Tabs'
import { ATTACHMENT_KIND_LABEL, STATUSES, TYPE_LABEL } from '../../db/labels'
import type { Attachment, Certification, Contact, Note, Product, Vendor } from '../../db/models'
import { db } from '../../db/schema'
import { addCert, deleteCert } from '../../data/certs'
import { addNote, deleteNote, updateNote } from '../../data/notes'
import { updateVendor } from '../../data/vendors'
import { safeHref } from '../../lib/safeHref'
import { LIMITS } from '../../lib/validate'
import { useMutation } from './useMutation'

interface DetailData {
  vendor: Vendor
  contacts: Contact[]
  products: Product[]
  notes: Note[]
  certs: Certification[]
  attachments: Attachment[]
}

const TABS: TabItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'people', label: 'People' },
  { id: 'products', label: 'Products' },
  { id: 'notes', label: 'Notes' },
  { id: 'certs', label: 'Certs' },
  { id: 'files', label: 'Files' },
]

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

function formatDate(ms: number): string {
  return dateFormatter.format(new Date(ms))
}

function ExternalLink({ value }: { value: string }) {
  const href = safeHref(value)
  if (!href) return <span className="mono">{value}</span>
  return (
    <a href={href} rel="noreferrer noopener" target="_blank">
      {value}
    </a>
  )
}

function EmailLink({ email }: { email: string }) {
  const href = safeHref(`mailto:${email}`)
  if (!href) return <span className="mono">{email}</span>
  return <a href={href}>{email}</a>
}

function PhoneLink({ phone, whatsapp = false }: { phone: string; whatsapp?: boolean }) {
  const digits = phone.replace(/[^\d+]/g, '')
  if (!digits) return <span className="mono">{phone}</span>
  const href = whatsapp
    ? safeHref(`https://wa.me/${digits.replace(/\+/g, '')}`)
    : safeHref(`tel:${digits}`)
  if (!href) return <span className="mono">{phone}</span>
  return (
    <a
      href={href}
      rel={whatsapp ? 'noreferrer noopener' : undefined}
      target={whatsapp ? '_blank' : undefined}
    >
      {phone}
    </a>
  )
}

/** Social handles are not URLs; only http(s) values and WhatsApp numbers become links. */
function socialHref(platform: string, value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (platform === 'whatsapp') return safeHref(`https://wa.me/${trimmed.replace(/[^\d]/g, '')}`)
  if (platform === 'wechat') return undefined
  return /^https?:\/\//i.test(trimmed) ? safeHref(trimmed) : undefined
}

/** Parses an `<input type="date">` value as local midnight (avoids a UTC off-by-one). */
function parseLocalDate(value: string): number | undefined {
  if (!value) return undefined
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return undefined
  return new Date(year, month - 1, day).getTime()
}

function OverviewPanel({ vendor }: { vendor: Vendor }) {
  const socials = vendor.socials.filter((social) => social.value.trim() !== '')
  const booth = [vendor.fair.edition, vendor.fair.hall, vendor.fair.booth].filter(Boolean).join(' ')
  return (
    <dl className="spec">
      <div>
        <dt>Type</dt>
        <dd>{TYPE_LABEL[vendor.type]}</dd>
      </div>
      <div>
        <dt>Location</dt>
        <dd>{[vendor.city, vendor.country].filter(Boolean).join(', ') || '—'}</dd>
      </div>
      <div>
        <dt>Address</dt>
        <dd>{vendor.address ?? '—'}</dd>
      </div>
      <div>
        <dt>Website</dt>
        <dd>{vendor.website ? <ExternalLink value={vendor.website} /> : '—'}</dd>
      </div>
      <div>
        <dt>Booth</dt>
        <dd className="mono">{booth || '—'}</dd>
      </div>
      <div>
        <dt>Socials</dt>
        <dd>
          {socials.length === 0
            ? '—'
            : socials.map((social) => {
                const href = socialHref(social.platform, social.value)
                return (
                  <span key={`${social.platform}-${social.value}`} className="social">
                    <span className="social__platform">{social.platform}</span>
                    {href ? (
                      <a href={href} rel="noreferrer noopener" target="_blank">
                        {social.value}
                      </a>
                    ) : (
                      <span className="mono">{social.value}</span>
                    )}
                  </span>
                )
              })}
        </dd>
      </div>
      <div>
        <dt>Tags</dt>
        <dd>{vendor.tags.length === 0 ? '—' : vendor.tags.join(', ')}</dd>
      </div>
      <div>
        <dt>Description</dt>
        <dd>{vendor.description ?? '—'}</dd>
      </div>
      <div>
        <dt>Updated</dt>
        <dd className="mono">{formatDate(vendor.updatedAt)}</dd>
      </div>
    </dl>
  )
}

function PeoplePanel({
  contacts,
  attachments,
}: {
  contacts: Contact[]
  attachments: Attachment[]
}) {
  if (contacts.length === 0) return <p className="panel__empty">No people yet.</p>
  return (
    <ul className="record-list">
      {contacts.map((contact) => {
        const card = attachments.find((item) => item.id === contact.cardAttachmentId)
        return (
          <li key={contact.id} className="record">
            {card ? (
              <BlobImage blob={card.thumb} alt={`Business card for ${contact.name}`} />
            ) : null}
            <div className="record__body">
              <p className="record__title">
                {contact.name}
                {contact.isPrimary ? <span className="chip">Primary</span> : null}
              </p>
              {contact.position ? <p className="record__sub">{contact.position}</p> : null}
              <p className="record__meta mono">
                {contact.phone ? <PhoneLink phone={contact.phone} /> : null}
                {contact.email ? <EmailLink email={contact.email} /> : null}
                {contact.whatsapp ? <PhoneLink phone={contact.whatsapp} whatsapp /> : null}
                {contact.wechat ? <span>WeChat {contact.wechat}</span> : null}
              </p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function ProductsPanel({
  products,
  attachments,
}: {
  products: Product[]
  attachments: Attachment[]
}) {
  if (products.length === 0) return <p className="panel__empty">No products yet.</p>
  return (
    <ul className="record-list">
      {products.map((product) => (
        <li key={product.id} className="record">
          <div className="record__body">
            <p className="record__title">{product.name}</p>
            <p className="record__meta">
              <span className="mono">
                {product.currency} {product.price ?? '—'}
              </span>
              {product.moq !== undefined ? <span className="mono">MOQ {product.moq}</span> : null}
              {product.leadTimeDays !== undefined ? (
                <span className="mono">{product.leadTimeDays}d</span>
              ) : null}
            </p>
            {product.paymentTerms ? <p className="record__sub">{product.paymentTerms}</p> : null}
          </div>
          <div className="record__photos">
            {attachments
              .filter((item) => product.photoAttachmentIds.includes(item.id))
              .map((item) => (
                <BlobImage key={item.id} blob={item.thumb} alt={product.name} size={56} />
              ))}
          </div>
        </li>
      ))}
    </ul>
  )
}

function NotesPanel({ vendorId, notes }: { vendorId: string; notes: Note[] }) {
  const [text, setText] = useState('')
  const [isTask, setIsTask] = useState(false)
  const [due, setDue] = useState('')
  const { error, run } = useMutation()

  const add = () => {
    if (text.trim() === '') return
    void run(
      addNote(vendorId, {
        text: text.trim(),
        isTask,
        dueDate: parseLocalDate(due),
      }).then(() => {
        setText('')
        setIsTask(false)
        setDue('')
      }),
    )
  }

  return (
    <div className="panel">
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}
      {notes.length === 0 ? <p className="panel__empty">No notes yet.</p> : null}
      <ul className="note-list">
        {notes.map((note) => (
          <li key={note.id} className="note">
            {note.isTask ? (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={note.done}
                  onChange={() => void run(updateNote(note.id, { done: !note.done }))}
                />
                <span className={note.done ? 'note__text note__text--done' : 'note__text'}>
                  {note.text}
                </span>
              </label>
            ) : (
              <span className="note__text">{note.text}</span>
            )}
            {note.dueDate ? (
              <span className="mono note__due">{formatDate(note.dueDate)}</span>
            ) : null}
            <button
              type="button"
              className="btn btn--ghost"
              aria-label={`Delete note: ${note.text}`}
              onClick={() => void run(deleteNote(note.id))}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
      <div className="add-row">
        <label className="sr-only" htmlFor="new-note">
          New note
        </label>
        <input
          id="new-note"
          value={text}
          maxLength={LIMITS.maxStringLength}
          placeholder="Note or task"
          onChange={(event) => setText(event.target.value)}
        />
        <label className="checkbox">
          <input
            type="checkbox"
            checked={isTask}
            onChange={(event) => setIsTask(event.target.checked)}
          />
          Task
        </label>
        <label className="sr-only" htmlFor="new-note-due">
          Due date
        </label>
        <input
          id="new-note-due"
          type="date"
          value={due}
          onChange={(event) => setDue(event.target.value)}
        />
        <button type="button" className="btn btn--primary" onClick={add}>
          Add note
        </button>
      </div>
    </div>
  )
}

function CertsPanel({ vendorId, certs }: { vendorId: string; certs: Certification[] }) {
  const [name, setName] = useState('')
  const [number, setNumber] = useState('')
  const [issuer, setIssuer] = useState('')
  const [expiry, setExpiry] = useState('')
  const { error, run } = useMutation()

  const add = () => {
    if (name.trim() === '') return
    void run(
      addCert(vendorId, {
        name: name.trim(),
        number: number.trim() || undefined,
        issuer: issuer.trim() || undefined,
        expiry: parseLocalDate(expiry),
      }).then(() => {
        setName('')
        setNumber('')
        setIssuer('')
        setExpiry('')
      }),
    )
  }

  return (
    <div className="panel">
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}
      {certs.length === 0 ? <p className="panel__empty">No certifications yet.</p> : null}
      <ul className="record-list">
        {certs.map((cert) => (
          <li key={cert.id} className="note">
            <span className="note__text">
              {cert.name}
              {cert.number ? <span className="mono"> {cert.number}</span> : null}
              {cert.issuer ? <span className="record__sub"> {cert.issuer}</span> : null}
              {cert.expiry ? <span className="mono">{formatDate(cert.expiry)}</span> : null}
            </span>
            <button
              type="button"
              className="btn btn--ghost"
              aria-label={`Delete certification: ${cert.name}`}
              onClick={() => void run(deleteCert(cert.id))}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
      <div className="add-row">
        <label className="sr-only" htmlFor="new-cert-name">
          Certification name
        </label>
        <input
          id="new-cert-name"
          value={name}
          maxLength={LIMITS.maxStringLength}
          placeholder="Certification"
          onChange={(event) => setName(event.target.value)}
        />
        <label className="sr-only" htmlFor="new-cert-number">
          Certificate number
        </label>
        <input
          id="new-cert-number"
          className="mono"
          value={number}
          maxLength={LIMITS.maxStringLength}
          placeholder="Number"
          onChange={(event) => setNumber(event.target.value)}
        />
        <label className="sr-only" htmlFor="new-cert-issuer">
          Issuer
        </label>
        <input
          id="new-cert-issuer"
          value={issuer}
          maxLength={LIMITS.maxStringLength}
          placeholder="Issuer"
          onChange={(event) => setIssuer(event.target.value)}
        />
        <label className="sr-only" htmlFor="new-cert-expiry">
          Expiry
        </label>
        <input
          id="new-cert-expiry"
          type="date"
          value={expiry}
          onChange={(event) => setExpiry(event.target.value)}
        />
        <button type="button" className="btn btn--primary" onClick={add}>
          Add certification
        </button>
      </div>
    </div>
  )
}

function FilesPanel({ attachments }: { attachments: Attachment[] }) {
  if (attachments.length === 0) return <p className="panel__empty">No files yet.</p>
  return (
    <ul className="file-grid">
      {attachments.map((attachment) => (
        <li key={attachment.id} className="file">
          <BlobImage blob={attachment.thumb} alt={ATTACHMENT_KIND_LABEL[attachment.kind]} />
          <span className="file__kind">{ATTACHMENT_KIND_LABEL[attachment.kind]}</span>
          <span className="mono file__size">{Math.round(attachment.bytes / 1024)} KB</span>
        </li>
      ))}
    </ul>
  )
}

export function VendorDetail({ vendorId }: { vendorId: string }) {
  const [tab, setTab] = useState('overview')
  const { error: mutationError, run } = useMutation()
  const data = useLiveQuery(async (): Promise<DetailData | null> => {
    const vendor = await db.vendors.get(vendorId)
    if (!vendor || vendor.deletedAt !== undefined) return null
    const [contacts, products, notes, certs, attachments] = await Promise.all([
      db.contacts.where('vendorId').equals(vendorId).toArray(),
      db.products.where('vendorId').equals(vendorId).toArray(),
      db.notes.where('vendorId').equals(vendorId).toArray(),
      db.certs.where('vendorId').equals(vendorId).toArray(),
      db.attachments.where('vendorId').equals(vendorId).toArray(),
    ])
    return { vendor, contacts, products, notes, certs, attachments }
  }, [vendorId])

  if (data === undefined) {
    return (
      <p className="form-summary" role="status">
        Loading vendor…
      </p>
    )
  }

  if (data === null) {
    return (
      <section className="empty" aria-labelledby="not-found-title">
        <h1 id="not-found-title" className="empty__title">
          Vendor not found
        </h1>
        <p className="empty__body">
          <a href="#/vendors">Back to vendors</a>
        </p>
      </section>
    )
  }

  const { vendor, contacts, products, notes, certs, attachments } = data

  return (
    <article className="detail">
      <p className="detail__back">
        <a href="#/vendors">← Vendors</a>
      </p>
      <header className="detail__head">
        <StatusSeal status={vendor.status} rating={vendor.rating} size="md" animate />
        <div className="detail__identity">
          <h1>{vendor.name}</h1>
          <p className="detail__meta">
            <span>{TYPE_LABEL[vendor.type]}</span>
            {vendor.country ? <span className="mono">{vendor.country}</span> : null}
          </p>
          <div className="detail__editors">
            <SelectField
              id="detail-status"
              label="Status"
              value={vendor.status}
              options={STATUSES}
              onChange={(status) => void run(updateVendor(vendor.id, { status }))}
            />
            <RatingField
              id="detail-rating"
              label="Interest"
              value={vendor.rating}
              onChange={(rating) => void run(updateVendor(vendor.id, { rating }))}
            />
          </div>
          {mutationError ? (
            <p className="field__error" role="alert">
              {mutationError}
            </p>
          ) : null}
          <a className="btn btn--ghost" href={`#/vendors/${vendor.id}/edit`}>
            Edit
          </a>
        </div>
      </header>

      <Tabs items={TABS} active={tab} onChange={setTab} label="Vendor sections">
        {tab === 'overview' ? <OverviewPanel vendor={vendor} /> : null}
        {tab === 'people' ? <PeoplePanel contacts={contacts} attachments={attachments} /> : null}
        {tab === 'products' ? (
          <ProductsPanel products={products} attachments={attachments} />
        ) : null}
        {tab === 'notes' ? <NotesPanel vendorId={vendor.id} notes={notes} /> : null}
        {tab === 'certs' ? <CertsPanel vendorId={vendor.id} certs={certs} /> : null}
        {tab === 'files' ? <FilesPanel attachments={attachments} /> : null}
      </Tabs>

      <p className="detail__updated mono">Updated {formatDate(vendor.updatedAt)}</p>
    </article>
  )
}
