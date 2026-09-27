import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { SocialPlatform } from '../../db/models'
import { RatingField, SelectField, TextAreaField, TextField } from '../../components/Field'
import { PhotoPicker, PhotoThumb } from '../../components/PhotoPicker'
import { getVendorBundle, saveVendorBundle, type VendorBundle } from '../../data/bundle'
import { loadDraft, saveDraft, deleteDraft } from '../../data/drafts'
import { STATUSES, VENDOR_TYPES } from '../../db/labels'
import { db } from '../../db/schema'
import { parseCardText } from '../../lib/cardParser'
import { validateVendorDraft } from '../../lib/formValidation'
import { requestPersistentStorage } from '../../lib/storage'
import { ContactFields } from './ContactFields'
import { ProductFields } from './ProductFields'
import { createEmptyDraft, vendorReducer, type PhotoDraft, type VendorDraft } from './formState'
import { VendorFormContext } from './VendorFormContext'

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

function bundleToDraft(bundle: VendorBundle): VendorDraft {
  const { vendor, contacts, products, attachments } = bundle
  return {
    name: vendor.name,
    type: vendor.type,
    status: vendor.status,
    rating: vendor.rating,
    country: vendor.country ?? '',
    city: vendor.city ?? '',
    address: vendor.address ?? '',
    website: vendor.website ?? '',
    description: vendor.description ?? '',
    socials: vendor.socials,
    tags: vendor.tags,
    fair: {
      edition: vendor.fair.edition ?? '',
      hall: vendor.fair.hall ?? '',
      booth: vendor.fair.booth ?? '',
      note: vendor.fair.note ?? '',
    },
    revisit: vendor.revisit ?? false,
    contacts: contacts.map((contact) => ({
      key: contact.id,
      id: contact.id,
      name: contact.name,
      position: contact.position ?? '',
      phone: contact.phone ?? '',
      email: contact.email ?? '',
      wechat: contact.wechat ?? '',
      whatsapp: contact.whatsapp ?? '',
      isPrimary: contact.isPrimary,
      cardPhotoKey: contact.cardAttachmentId,
    })),
    products: products.map((product) => ({
      key: product.id,
      id: product.id,
      name: product.name,
      description: product.description ?? '',
      unit: product.unit ?? '',
      currency: product.currency,
      price: product.price !== undefined ? String(product.price) : '',
      moq: product.moq !== undefined ? String(product.moq) : '',
      leadTimeDays: product.leadTimeDays !== undefined ? String(product.leadTimeDays) : '',
      paymentTerms: product.paymentTerms ?? '',
      tiers: product.tiers.map((tier) => ({
        key: crypto.randomUUID(),
        minQty: String(tier.minQty),
        unitPrice: String(tier.unitPrice),
      })),
      photoKeys: product.photoAttachmentIds,
    })),
    photos: attachments.map((attachment) => ({
      key: attachment.id,
      kind: attachment.kind,
      image: {
        blob: attachment.blob,
        thumb: attachment.thumb,
        width: attachment.width,
        height: attachment.height,
        bytes: attachment.bytes,
      },
      previewUrl: URL.createObjectURL(attachment.thumb),
    })),
  }
}

interface VendorFormProps {
  mode: 'new' | 'edit'
  vendorId?: string
}

export function VendorForm({ mode, vendorId }: VendorFormProps) {
  const [draft, dispatch] = useReducer(vendorReducer, undefined, createEmptyDraft)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [summary, setSummary] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(mode === 'edit')
  const [loadError, setLoadError] = useState('')
  const [duplicateHint, setDuplicateHint] = useState<{ id: string; date: string } | null>(null)
  const [draftBanner, setDraftBanner] = useState('')

  const photosRef = useRef<PhotoDraft[]>([])
  const draftId = mode === 'edit' && vendorId ? vendorId : 'new'
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const isDirtyRef = useRef(false)

  useEffect(() => {
    photosRef.current = draft.photos
  }, [draft.photos])

  useEffect(() => {
    const name = draft.name.trim()
    let active = true
    const timer = setTimeout(async () => {
      if (name.length < 2) {
        if (active) setDuplicateHint(null)
        return
      }
      const needle = name.toLowerCase()
      const matches = await db.vendors
        .filter(
          (v) =>
            v.deletedAt === undefined &&
            v.name.toLowerCase().includes(needle),
        )
        .toArray()
      if (!active) return
      const best = matches.find(
        (v) => !(mode === 'edit' && v.id === vendorId),
      )
      if (best) {
        setDuplicateHint({
          id: best.id,
          date: dateFormatter.format(new Date(best.createdAt)),
        })
      } else {
        setDuplicateHint(null)
      }
    }, 500)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [draft.name, mode, vendorId])

  useEffect(() => {
    if (mode !== 'edit' || !vendorId) return
    let active = true
    getVendorBundle(vendorId)
      .then((bundle) => {
        if (!active) return
        if (bundle) dispatch({ type: 'load', draft: bundleToDraft(bundle) })
        else setLoadError('Vendor not found.')
      })
      .catch((err) => {
        console.error(err)
        if (active) setLoadError('The vendor could not be loaded.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [mode, vendorId])

  useEffect(() => {
    if (mode !== 'new') return
    let active = true
    loadDraft('new').then((saved) => {
      if (saved && active) {
        const restored: VendorDraft = {
          name: saved.vendor.name,
          type: saved.vendor.type ?? 'supplier',
          status: saved.vendor.status ?? 'lead',
          rating: saved.vendor.rating ?? 3,
          country: saved.vendor.country ?? '',
          city: saved.vendor.city ?? '',
          address: saved.vendor.address ?? '',
          website: saved.vendor.website ?? '',
          description: saved.vendor.description ?? '',
          socials: saved.vendor.socials ?? [],
          tags: saved.vendor.tags ?? [],
          fair: {
            edition: saved.vendor.fair?.edition ?? '',
            hall: saved.vendor.fair?.hall ?? '',
            booth: saved.vendor.fair?.booth ?? '',
            note: saved.vendor.fair?.note ?? '',
          },
          revisit: saved.vendor.revisit ?? false,
          contacts: saved.contacts.map((c) => ({
            key: c.key,
            id: c.id,
            name: c.name,
            position: c.position ?? '',
            phone: c.phone ?? '',
            email: c.email ?? '',
            wechat: c.wechat ?? '',
            whatsapp: c.whatsapp ?? '',
            isPrimary: c.isPrimary,
            cardPhotoKey: c.cardPhotoKey,
          })),
          products: saved.products.map((p) => ({
            key: p.key,
            id: p.id,
            name: p.name,
            description: p.description ?? '',
            unit: p.unit ?? '',
            currency: p.currency,
            price: p.price !== undefined ? String(p.price) : '',
            moq: p.moq !== undefined ? String(p.moq) : '',
            leadTimeDays: p.leadTimeDays !== undefined ? String(p.leadTimeDays) : '',
            paymentTerms: p.paymentTerms ?? '',
            tiers: p.tiers.map((t) => ({
              key: crypto.randomUUID(),
              minQty: String(t.minQty),
              unitPrice: String(t.unitPrice),
            })),
            photoKeys: p.photoKeys,
          })),
          photos: saved.photos.map((ph) => ({
            key: ph.key,
            kind: ph.kind,
            image: { blob: ph.blob, thumb: ph.thumb, width: ph.width, height: ph.height, bytes: ph.bytes },
            previewUrl: URL.createObjectURL(ph.thumb),
          })),
        }
        dispatch({ type: 'load', draft: restored })
        setDraftBanner(`Unsaved vendor from ${new Date(saved.updatedAt).toLocaleTimeString()} — `)
      }
    })
    return () => {
      active = false
    }
  }, [mode])

  const discardDraft = useCallback(() => {
    void deleteDraft(draftId).then(() => {
      setDraftBanner('')
    })
  }, [draftId])

  useEffect(() => {
    isDirtyRef.current = draft.name !== '' || draft.contacts.some((c) => c.name !== '') || draft.photos.length > 0
  }, [draft])

  useEffect(() => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    if (!isDirtyRef.current) return
    autosaveTimerRef.current = setTimeout(() => {
      void saveDraft({
        id: draftId,
        vendor: {
          name: draft.name,
          type: draft.type,
          status: draft.status,
          rating: draft.rating,
          country: draft.country || undefined,
          city: draft.city || undefined,
          address: draft.address || undefined,
          website: draft.website || undefined,
          description: draft.description || undefined,
          socials: draft.socials,
          tags: draft.tags,
          fair: {
            edition: draft.fair.edition || undefined,
            hall: draft.fair.hall || undefined,
            booth: draft.fair.booth || undefined,
            note: draft.fair.note || undefined,
          },
        },
        contacts: draft.contacts.map((c) => ({
          key: c.key,
          id: c.id,
          name: c.name,
          position: c.position || undefined,
          phone: c.phone || undefined,
          email: c.email || undefined,
          wechat: c.wechat || undefined,
          whatsapp: c.whatsapp || undefined,
          isPrimary: c.isPrimary,
          cardPhotoKey: c.cardPhotoKey,
        })),
        products: draft.products.map((p) => ({
          key: p.key,
          id: p.id,
          name: p.name,
          description: p.description || undefined,
          unit: p.unit || undefined,
          currency: p.currency || 'USD',
          price: p.price ? Number(p.price) : undefined,
          moq: p.moq ? Number(p.moq) : undefined,
          tiers: [],
          leadTimeDays: p.leadTimeDays ? Number(p.leadTimeDays) : undefined,
          paymentTerms: p.paymentTerms || undefined,
          photoKeys: p.photoKeys,
        })),
        photos: draft.photos.map((ph) => ({
          key: ph.key,
          kind: ph.kind,
          blob: ph.image.blob,
          thumb: ph.image.thumb,
          width: ph.image.width,
          height: ph.image.height,
          bytes: ph.image.bytes,
        })),
        updatedAt: Date.now(),
      })
    }, 800)
    return () => { if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current) }
  }, [draft, draftId])

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  useEffect(() => {
    return () => {
      for (const photo of photosRef.current) URL.revokeObjectURL(photo.previewUrl)
    }
  }, [])

  const removePhoto = useCallback((photo: PhotoDraft) => {
    URL.revokeObjectURL(photo.previewUrl)
    dispatch({ type: 'removePhoto', key: photo.key })
  }, [])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving || loading || loadError !== '') return
    setSummary('')
    const result = validateVendorDraft(draft)
    setErrors(result.errors)
    if (!result.bundle) {
      setSummary('Fix the highlighted fields before saving.')
      return
    }
    setSaving(true)
    try {
      await saveVendorBundle(result.bundle, mode === 'edit' ? vendorId : undefined)
      void deleteDraft(draftId)
      setDraftBanner('')
      void requestPersistentStorage()
      window.location.hash = mode === 'edit' && vendorId ? `#/vendors/${vendorId}` : '#/vendors'
    } catch (err) {
      console.error(err)
      setSummary('The vendor could not be saved. Try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <p className="form-summary" role="status">
        Loading vendor…
      </p>
    )
  }

  if (loadError !== '') {
    return (
      <section className="empty" aria-labelledby="load-error-title">
        <h1 id="load-error-title" className="empty__title">
          {loadError}
        </h1>
        <p className="empty__body">
          <a href="#/vendors">Back to vendors</a>
        </p>
      </section>
    )
  }

  return (
    <VendorFormContext.Provider value={{ draft, dispatch, errors, removePhoto }}>
      <form className="vendor-form" onSubmit={handleSubmit} noValidate aria-busy={saving}>
        <div className="form-head">
          <h1>{mode === 'edit' ? 'Edit vendor' : 'New vendor'}</h1>
          <div className="form-head__actions">
            <a
              className="btn btn--ghost"
              href={mode === 'edit' && vendorId ? `#/vendors/${vendorId}` : '#/vendors'}
            >
              Cancel
            </a>
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save vendor'}
            </button>
          </div>
        </div>

        {summary ? (
          <p className="form-summary" role="alert">
            {summary}
          </p>
        ) : null}

        {draftBanner ? (
          <p className="form-summary" role="status">
            {draftBanner}
            <button type="button" className="btn btn--ghost" onClick={discardDraft}>
              Discard
            </button>
          </p>
        ) : null}

        <section className="form-section" aria-labelledby="identity-heading">
          <h2 id="identity-heading">Identity</h2>
          <TextField
            id="vendor-name"
            label="Company name"
            autoComplete="organization"
            value={draft.name}
            onChange={(name) => dispatch({ type: 'setField', field: 'name', value: name })}
            error={errors['vendor.name']}
          />
          {duplicateHint ? (
            <p className="field__hint" role="status">
              Already met on {duplicateHint.date} —{' '}
              <a href={`#/vendors/${duplicateHint.id}`}>open instead?</a>
            </p>
          ) : null}
          <details className="card-paste">
            <summary>Paste card text</summary>
            <div className="card-paste__body">
              <label className="sr-only" htmlFor="card-paste-text">
                Business card text
              </label>
              <textarea
                id="card-paste-text"
                rows={4}
                placeholder="Paste business card text here…"
              />
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  const ta = document.getElementById('card-paste-text') as HTMLTextAreaElement | null
                  if (!ta || !ta.value.trim()) return
                  const parsed = parseCardText(ta.value)
                  if (parsed.company && draft.name.trim() === '') {
                    dispatch({ type: 'setField', field: 'name', value: parsed.company })
                  }
                  if (parsed.phones.length > 0) {
                    const phone = parsed.phones[0]
                    if (draft.contacts.length === 0) {
                      dispatch({ type: 'addContact', key: crypto.randomUUID() })
                    }
                    for (const contact of draft.contacts) {
                      if (contact.name === '' && contact.phone === '') {
                        dispatch({ type: 'updateContact', key: contact.key, patch: { phone } })
                      }
                    }
                  }
                  if (parsed.emails.length > 0) {
                    const email = parsed.emails[0]
                    for (const contact of draft.contacts) {
                      if (contact.email === '') {
                        dispatch({ type: 'updateContact', key: contact.key, patch: { email } })
                      }
                    }
                  }
                  if (parsed.wechat) {
                    for (const contact of draft.contacts) {
                      if (contact.wechat === '') {
                        dispatch({ type: 'updateContact', key: contact.key, patch: { wechat: parsed.wechat } })
                      }
                    }
                  }
                  if (parsed.urls.length > 0 && parsed.urls[0] && draft.website === '') {
                    dispatch({ type: 'setField', field: 'website', value: parsed.urls[0] })
                  }
                  ta.value = ''
                }}
              >
                Fill fields
              </button>
            </div>
          </details>
          <SelectField
            id="vendor-type"
            label="Type"
            value={draft.type}
            onChange={(value) => dispatch({ type: 'setField', field: 'type', value })}
            options={VENDOR_TYPES}
          />
          <SelectField
            id="vendor-status"
            label="Status"
            value={draft.status}
            onChange={(value) => dispatch({ type: 'setField', field: 'status', value })}
            options={STATUSES}
          />
          <RatingField
            id="vendor-rating"
            label="Interest"
            value={draft.rating}
            onChange={(value) => dispatch({ type: 'setField', field: 'rating', value })}
          />
        </section>

        <section className="form-section" aria-labelledby="where-heading">
          <h2 id="where-heading">Where</h2>
          <TextField
            id="vendor-country"
            label="Country"
            autoComplete="country-name"
            value={draft.country}
            onChange={(value) => dispatch({ type: 'setField', field: 'country', value })}
          />
          <TextField
            id="vendor-city"
            label="City"
            autoComplete="address-level2"
            value={draft.city}
            onChange={(value) => dispatch({ type: 'setField', field: 'city', value })}
          />
          <TextField
            id="vendor-address"
            label="Address"
            autoComplete="street-address"
            value={draft.address}
            onChange={(value) => dispatch({ type: 'setField', field: 'address', value })}
          />
          <TextField
            id="vendor-website"
            label="Website"
            inputMode="url"
            autoComplete="url"
            mono
            value={draft.website}
            onChange={(value) => dispatch({ type: 'setField', field: 'website', value })}
          />
        </section>

        <section className="form-section" aria-labelledby="fair-heading">
          <h2 id="fair-heading">Fair</h2>
          <TextField
            id="fair-edition"
            label="Fair edition"
            value={draft.fair.edition ?? ''}
            onChange={(value) => dispatch({ type: 'setFair', field: 'edition', value })}
          />
          <TextField
            id="fair-hall"
            label="Hall"
            mono
            value={draft.fair.hall ?? ''}
            onChange={(value) => dispatch({ type: 'setFair', field: 'hall', value })}
          />
          <TextField
            id="fair-booth"
            label="Booth"
            mono
            value={draft.fair.booth ?? ''}
            onChange={(value) => dispatch({ type: 'setFair', field: 'booth', value })}
          />
          <TextField
            id="fair-note"
            label="Fair note"
            value={draft.fair.note ?? ''}
            onChange={(value) => dispatch({ type: 'setFair', field: 'note', value })}
          />
        </section>

        <section className="form-section" aria-labelledby="tags-heading">
          <h2 id="tags-heading">Tags</h2>
          <div className="chip-row" role="group" aria-label="Tags">
            {draft.tags.map((tag) => (
              <span key={tag} className="chip">
                {tag}
                <button
                  type="button"
                  className="chip__remove"
                  aria-label={`Remove tag ${tag}`}
                  onClick={() => dispatch({ type: 'removeTag', value: tag })}
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
          <input
            id="vendor-tags"
            aria-label="Add a tag"
            placeholder="Add a tag and press Enter"
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ',') {
                event.preventDefault()
                const value = (event.target as HTMLInputElement).value.trim()
                if (value && !draft.tags.includes(value)) {
                  dispatch({ type: 'addTag', value })
                }
                (event.target as HTMLInputElement).value = ''
              }
            }}
          />
        </section>

        <section className="form-section" aria-labelledby="socials-heading">
          <h2 id="socials-heading">Social links</h2>
          {draft.socials.map((social, index) => (
            <div key={index} className="social-row">
              <SelectField
                id={`social-${index}-platform`}
                label="Platform"
                value={social.platform}
                onChange={(value) =>
                  dispatch({ type: 'updateSocial', index, patch: { platform: value as SocialPlatform } })
                }
                options={[
                  { value: 'wechat', label: 'WeChat' },
                  { value: 'whatsapp', label: 'WhatsApp' },
                  { value: 'alibaba', label: 'Alibaba' },
                  { value: 'linkedin', label: 'LinkedIn' },
                  { value: 'instagram', label: 'Instagram' },
                  { value: 'facebook', label: 'Facebook' },
                  { value: 'other', label: 'Other' },
                ]}
              />
              <TextField
                id={`social-${index}-value`}
                label="Handle or URL"
                value={social.value}
                onChange={(value) =>
                  dispatch({ type: 'updateSocial', index, patch: { value } })
                }
              />
              <button
                type="button"
                className="btn btn--ghost"
                aria-label={`Remove ${social.platform}`}
                onClick={() => dispatch({ type: 'removeSocial', index })}
              >
                Remove
              </button>
            </div>
          ))}
          <button type="button" className="btn btn--ghost" onClick={() => dispatch({ type: 'addSocial' })}>
            Add social link
          </button>
        </section>

        <ContactFields />
        <ProductFields />

        <section className="form-section" aria-labelledby="photos-heading">
          <h2 id="photos-heading">Photos</h2>
          <div className="photo-row">
            <PhotoPicker
              id="vendor-photo"
              testId="vendor-photo-input"
              label="Add photo"
              kind="booth"
              multiple
              onAdd={(photo) => dispatch({ type: 'addPhoto', photo })}
            />
            {draft.photos
              .filter((photo) => photo.kind === 'booth' || photo.kind === 'other')
              .map((photo, index) => (
                <PhotoThumb
                  key={photo.key}
                  photo={photo}
                  label={`Remove photo ${index + 1}`}
                  onRemove={() => removePhoto(photo)}
                />
              ))}
          </div>
        </section>

        <section className="form-section" aria-labelledby="notes-heading">
          <h2 id="notes-heading">Notes</h2>
          <TextAreaField
            id="vendor-description"
            label="Description"
            value={draft.description}
            onChange={(value) => dispatch({ type: 'setField', field: 'description', value })}
          />
        </section>
      </form>
    </VendorFormContext.Provider>
  )
}
