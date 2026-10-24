import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BlobImage } from '../../components/BlobImage'
import { EmailLink, PhoneLink } from '../../components/ContactLinks'
import { LoadingSpinner } from '../../components/LoadingSpinner'
import { RatingField, SelectField } from '../../components/Field'
import { PhotoViewer } from '../../components/PhotoViewer'
import { StatusSeal } from '../../components/StatusSeal'
import { Tabs, type TabItem } from '../../components/Tabs'
import { ATTACHMENT_KIND_LABEL, STATUSES, TYPE_LABEL } from '../../db/labels'
import type { Attachment, Certification, Contact, Note, Product, Vendor } from '../../db/models'
import { db } from '../../db/schema'
import { addCert, deleteCert } from '../../data/certs'
import { addNote, deleteNote, updateNote } from '../../data/notes'
import { getSettings } from '../../data/settings'
import { softDeleteVendor, updateVendor } from '../../data/vendors'
import { convertToBase, formatMoney, rateFor } from '../../lib/currency'
import { formatDate } from '../../lib/format'
import { landedUnitCost, orderTotals, packingSummary } from '../../lib/landedCost'
import { followUpLinks, followUpText } from '../../lib/followUp'
import { safeHref } from '../../lib/safeHref'
import { downloadBlob } from '../../lib/share'
import { buildVcard } from '../../lib/vcard'
import { LIMITS } from '../../lib/validate'
import { useMutation } from './useMutation'
import { haptic } from '../../lib/haptics'

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

function ExternalLink({ value }: { value: string }) {
  const href = safeHref(value)
  if (!href) return <span className="mono">{value}</span>
  return (
    <a href={href} rel="noreferrer noopener" target="_blank">
      {value}
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
  products,
  vendor,
  onViewPhoto,
}: {
  contacts: Contact[]
  attachments: Attachment[]
  products: Product[]
  vendor: Vendor
  onViewPhoto: (index: number) => void
}) {
  const settings = useLiveQuery(() => getSettings(), [])
  if (contacts.length === 0) return <p className="panel__empty">No people yet.</p>
  return (
    <ul className="record-list">
      {contacts.map((contact) => {
        const card = attachments.find((item) => item.id === contact.cardAttachmentId)
        const cardIndex = card ? attachments.indexOf(card) : -1

        const followUp = followUpLinks(
          contact,
          vendor,
          followUpText(
            contact,
            vendor,
            products.map((product) => product.name),
            settings?.travellerName,
          ),
        )

        const handleSaveContact = () => {
          downloadBlob(
            new Blob([buildVcard(contact, vendor)], { type: 'text/vcard' }),
            `${contact.name.replace(/\s+/g, '_')}.vcf`,
          )
        }

        return (
          <li key={contact.id} className="record">
            {card ? (
              <button type="button" className="btn-blob" onClick={() => onViewPhoto(cardIndex)}>
                <BlobImage blob={card.thumb} alt={`Business card for ${contact.name}`} />
              </button>
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
              <div className="button-row">
                <button type="button" className="btn btn--ghost" onClick={handleSaveContact}>
                  Save contact
                </button>
                {followUp.whatsapp ? (
                  <a
                    className="btn btn--ghost"
                    href={followUp.whatsapp}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Follow up on WhatsApp<span className="sr-only"> with {contact.name}</span>
                  </a>
                ) : null}
                {followUp.email ? (
                  <a className="btn btn--ghost" href={followUp.email}>
                    Follow up by email<span className="sr-only"> with {contact.name}</span>
                  </a>
                ) : null}
              </div>
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
  onViewPhoto,
}: {
  products: Product[]
  attachments: Attachment[]
  onViewPhoto: (index: number) => void
}) {
  const settings = useLiveQuery(() => getSettings(), [])
  if (products.length === 0) return <p className="panel__empty">No products yet.</p>
  return (
    <ul className="record-list">
      {products.map((product) => {
        const converted =
          settings && product.price !== undefined
            ? convertToBase(product.price, product.currency, settings.baseCurrency, settings.rates)
            : null
        const landed = settings ? landedUnitCost(product, settings) : null
        const packing = packingSummary(product)
        const totals = orderTotals(product, settings)
        const foreign = settings !== undefined && product.currency !== settings.baseCurrency
        const landedTotal = totals?.landedBase ?? null
        const toProductCurrency = settings
          ? rateFor(settings.rates, settings.baseCurrency, product.currency)
          : null
        return (
          <li key={product.id} className="record">
            <div className="record__body">
              <p className="record__title">{product.name}</p>
              <p className="record__meta">
                <span className="mono">
                  {product.price !== undefined ? formatMoney(product.price, product.currency) : '—'}
                </span>
                {settings &&
                product.price !== undefined &&
                product.currency !== settings.baseCurrency ? (
                  converted === null ? (
                    <span className="no-rate">no {settings.baseCurrency} rate</span>
                  ) : (
                    <span className="mono" data-testid="base-price">
                      ≈ {formatMoney(converted, settings.baseCurrency)}
                    </span>
                  )
                ) : null}
                {product.moq !== undefined ? <span className="mono">MOQ {product.moq}</span> : null}
                {product.leadTimeDays !== undefined ? (
                  <span>
                    Lead time <span className="mono">{product.leadTimeDays} days</span>
                  </span>
                ) : null}
              </p>
              {packing ? <p className="record__sub mono">{packing}</p> : null}
              {settings && landed !== null ? (
                <p className="record__sub" data-testid="landed-cost">
                  Landed ≈{' '}
                  <span className="mono">{formatMoney(landed, settings.baseCurrency)}</span> per
                  unit
                </p>
              ) : null}
              {totals ? (
                <div className="order-totals" data-testid="order-total">
                  <p className="order-totals__head">
                    Order of{' '}
                    <span className="mono">
                      {totals.qty}{' '}
                      {product.unit && /[a-z]/i.test(product.unit) ? product.unit : 'pcs'}
                    </span>
                    {totals.fromMoq ? ' (MOQ)' : ''} at{' '}
                    <span className="mono">{formatMoney(totals.unitPrice, product.currency)}</span>
                  </p>
                  <dl className="order-totals__rows">
                    <div className="order-totals__row">
                      <dt>Goods</dt>
                      <dd className="mono">{formatMoney(totals.total, product.currency)}</dd>
                      {settings && foreign && totals.totalBase !== null ? (
                        <dd className="mono order-totals__base">
                          ≈ {formatMoney(totals.totalBase, settings.baseCurrency)}
                        </dd>
                      ) : null}
                    </div>
                    {settings && landedTotal !== null ? (
                      <div className="order-totals__row" data-testid="order-landed">
                        <dt>Landed</dt>
                        {foreign && toProductCurrency !== null ? (
                          <>
                            <dd className="mono">
                              {formatMoney(landedTotal * toProductCurrency, product.currency)}
                            </dd>
                            <dd className="mono order-totals__base">
                              ≈ {formatMoney(landedTotal, settings.baseCurrency)}
                            </dd>
                          </>
                        ) : (
                          <dd className="mono">
                            {formatMoney(landedTotal, settings.baseCurrency)}
                          </dd>
                        )}
                      </div>
                    ) : null}
                  </dl>
                  {settings && landedTotal !== null ? (
                    <p className="order-totals__note">
                      Landed includes freight, duty and VAT from Settings.
                    </p>
                  ) : null}
                </div>
              ) : null}
              {product.tiers.length > 0 ? (
                <ul className="tier-list">
                  {product.tiers.map((tier, index) => {
                    const tierBase = settings
                      ? convertToBase(
                          tier.unitPrice,
                          product.currency,
                          settings.baseCurrency,
                          settings.rates,
                        )
                      : null
                    return (
                      <li key={`${product.id}-${index}`} className="tier-list__row">
                        <span className="mono">{tier.minQty}+</span>
                        <span className="mono">
                          {formatMoney(tier.unitPrice, product.currency)}
                        </span>
                        {settings && product.currency !== settings.baseCurrency ? (
                          tierBase === null ? (
                            <span className="no-rate">no {settings.baseCurrency} rate</span>
                          ) : (
                            <span className="mono">
                              ≈ {formatMoney(tierBase, settings.baseCurrency)}
                            </span>
                          )
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              ) : null}
              {product.paymentTerms ? (
                <p className="record__sub">
                  <span className="record__label">Payment terms:</span> {product.paymentTerms}
                </p>
              ) : null}
            </div>
            <div className="record__photos">
              {attachments
                .filter((item) => product.photoAttachmentIds.includes(item.id))
                .map((item) => {
                  const idx = attachments.indexOf(item)
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="btn-blob"
                      onClick={() => onViewPhoto(idx)}
                    >
                      <BlobImage blob={item.thumb} alt={product.name} size={56} />
                    </button>
                  )
                })}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function NotesPanel({ vendorId, notes }: { vendorId: string; notes: Note[] }) {
  const [text, setText] = useState('')
  const [isTask, setIsTask] = useState(false)
  const [due, setDue] = useState('')
  const { error, run } = useMutation()
  const [pendingDelete, setPendingDelete] = useState<Note | null>(null)
  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    return () => {
      if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current)
    }
  }, [])

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

  const scheduleDelete = (note: Note) => {
    clearTimeout(deleteTimeoutRef.current)
    setPendingDelete(note)
    deleteTimeoutRef.current = setTimeout(() => {
      void run(deleteNote(note.id))
      setPendingDelete(null)
    }, 5000)
  }

  const undoDelete = () => {
    clearTimeout(deleteTimeoutRef.current)
    setPendingDelete(null)
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
            {pendingDelete?.id === note.id ? (
              <span className="mono note__pending">Deleting…</span>
            ) : (
              <button
                type="button"
                className="btn btn--danger"
                aria-label={`Delete note: ${note.text}`}
                onClick={() => scheduleDelete(note)}
              >
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
      {pendingDelete ? (
        <p className="toast" role="status" aria-live="polite">
          Note deleted —
          <button type="button" className="btn-toast" onClick={undoDelete}>
            Undo
          </button>
        </p>
      ) : null}
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
  const [pendingDelete, setPendingDelete] = useState<Certification | null>(null)
  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    return () => {
      if (deleteTimeoutRef.current) clearTimeout(deleteTimeoutRef.current)
    }
  }, [])

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

  const scheduleDelete = (cert: Certification) => {
    clearTimeout(deleteTimeoutRef.current)
    setPendingDelete(cert)
    deleteTimeoutRef.current = setTimeout(() => {
      void run(deleteCert(cert.id))
      setPendingDelete(null)
    }, 5000)
  }

  const undoDelete = () => {
    clearTimeout(deleteTimeoutRef.current)
    setPendingDelete(null)
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
            {pendingDelete?.id === cert.id ? (
              <span className="mono note__pending">Deleting…</span>
            ) : (
              <button
                type="button"
                className="btn btn--danger"
                aria-label={`Delete certification: ${cert.name}`}
                onClick={() => scheduleDelete(cert)}
              >
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
      {pendingDelete ? (
        <p className="toast" role="status" aria-live="polite">
          Certification deleted —
          <button type="button" className="btn-toast" onClick={undoDelete}>
            Undo
          </button>
        </p>
      ) : null}
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

function FilesPanel({
  attachments,
  onViewPhoto,
}: {
  attachments: Attachment[]
  onViewPhoto: (index: number) => void
}) {
  if (attachments.length === 0) return <p className="panel__empty">No files yet.</p>
  return (
    <ul className="file-grid">
      {attachments.map((attachment, idx) => (
        <li key={attachment.id} className="file">
          <button type="button" className="btn-blob" onClick={() => onViewPhoto(idx)}>
            <BlobImage blob={attachment.thumb} alt={ATTACHMENT_KIND_LABEL[attachment.kind]} />
          </button>
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
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const deleteDialogRef = useRef<HTMLDialogElement>(null)
  const [deleteError, setDeleteError] = useState('')

  const handleDelete = useCallback(() => {
    setDeleteError('')
    void run(
      softDeleteVendor(vendorId).then(
        () => {
          haptic('success')
          window.location.hash = '#/vendors'
        },
        () => {
          setDeleteError('Could not delete the vendor.')
        },
      ),
    )
  }, [vendorId, run])
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

  const vendorName = data?.vendor?.name
  useEffect(() => {
    if (vendorName) document.title = `${vendorName} · OPC Vendors Cards`
  }, [vendorId, vendorName])

  if (data === undefined) {
    return <LoadingSpinner>Loading vendor…</LoadingSpinner>
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
        {/* Keyed on status so the stamp replays when the status changes. */}
        <StatusSeal
          key={vendor.status}
          status={vendor.status}
          rating={vendor.rating}
          size="md"
          animate
        />
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
            <label className="toggle-chip">
              <input
                type="checkbox"
                checked={vendor.revisit ?? false}
                onChange={() =>
                  void run(updateVendor(vendor.id, { revisit: !(vendor.revisit ?? false) }))
                }
              />
              <svg viewBox="0 0 24 24" aria-hidden="true" strokeLinejoin="round">
                <path d="M6 3h12v18l-6-4.5L6 21z" />
              </svg>
              Revisit
            </label>
          </div>
          {mutationError ? (
            <p className="field__error" role="alert">
              {mutationError}
            </p>
          ) : null}
          <div className="detail__actions">
            <a className="btn btn--ghost" href={`#/vendors/${vendor.id}/edit`}>
              Edit
            </a>
            <a className="btn btn--ghost" href={`#/vendors/${vendor.id}/share`}>
              Share
            </a>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => deleteDialogRef.current?.showModal()}
            >
              Delete
            </button>
          </div>
          <dialog ref={deleteDialogRef} className="dialog" aria-labelledby="delete-vendor-title">
            <form method="dialog">
              <h2 id="delete-vendor-title" className="dialog__title">
                Delete {vendor.name}?
              </h2>
              <p className="dialog__body">
                This vendor will be hidden and can be restored from Settings within 90 days.
                Children (contacts, products, photos) are preserved.
              </p>
              {deleteError ? (
                <p className="field__error" role="alert">
                  {deleteError}
                </p>
              ) : null}
              <div className="dialog__actions">
                <button type="submit" className="btn btn--ghost">
                  Cancel
                </button>
                <button type="button" className="btn btn--danger-solid" onClick={handleDelete}>
                  Delete
                </button>
              </div>
            </form>
          </dialog>
        </div>
      </header>

      <Tabs items={TABS} active={tab} onChange={setTab} label="Vendor sections">
        {tab === 'overview' ? <OverviewPanel vendor={vendor} /> : null}
        {tab === 'people' ? (
          <PeoplePanel
            vendor={vendor}
            contacts={contacts}
            attachments={attachments}
            products={products}
            onViewPhoto={setViewerIndex}
          />
        ) : null}
        {tab === 'products' ? (
          <ProductsPanel
            products={products}
            attachments={attachments}
            onViewPhoto={setViewerIndex}
          />
        ) : null}
        {tab === 'notes' ? <NotesPanel vendorId={vendor.id} notes={notes} /> : null}
        {tab === 'certs' ? <CertsPanel vendorId={vendor.id} certs={certs} /> : null}
        {tab === 'files' ? (
          <FilesPanel attachments={attachments} onViewPhoto={setViewerIndex} />
        ) : null}
      </Tabs>

      {viewerIndex !== null ? (
        <PhotoViewer
          attachments={attachments}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      ) : null}

      <p className="detail__updated mono">Updated {formatDate(vendor.updatedAt)}</p>
    </article>
  )
}
