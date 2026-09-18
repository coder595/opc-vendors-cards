import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { RatingField, SelectField, TextAreaField, TextField } from '../../components/Field'
import { PhotoPicker, PhotoThumb } from '../../components/PhotoPicker'
import { getVendorBundle, saveVendorBundle, type VendorBundle } from '../../data/bundle'
import type { PipelineStatus, VendorType } from '../../db/models'
import { validateVendorDraft } from '../../lib/formValidation'
import { requestPersistentStorage } from '../../lib/storage'
import { ContactFields } from './ContactFields'
import { ProductFields } from './ProductFields'
import { createEmptyDraft, vendorReducer, type PhotoDraft, type VendorDraft } from './formState'
import { VendorFormContext } from './VendorFormContext'

const VENDOR_TYPES: { value: VendorType; label: string }[] = [
  { value: 'supplier', label: 'Supplier' },
  { value: 'factory', label: 'Factory' },
  { value: 'dealer', label: 'Dealer' },
  { value: 'agent', label: 'Agent' },
  { value: 'trader', label: 'Trader' },
  { value: 'other', label: 'Other' },
]

const STATUSES: { value: PipelineStatus; label: string }[] = [
  { value: 'lead', label: 'Lead' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'met', label: 'Met' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'sample', label: 'Sample' },
  { value: 'negotiating', label: 'Negotiating' },
  { value: 'ordered', label: 'Ordered' },
  { value: 'archived', label: 'Archived' },
]

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
    contacts: contacts.map((contact) => ({
      key: contact.id,
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
      name: product.name,
      description: product.description ?? '',
      unit: product.unit ?? '',
      currency: product.currency,
      price: product.price !== undefined ? String(product.price) : '',
      moq: product.moq !== undefined ? String(product.moq) : '',
      leadTimeDays: product.leadTimeDays !== undefined ? String(product.leadTimeDays) : '',
      paymentTerms: product.paymentTerms ?? '',
      tiers: product.tiers,
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

  const photosRef = useRef<PhotoDraft[]>([])
  useEffect(() => {
    photosRef.current = draft.photos
  }, [draft.photos])

  useEffect(() => {
    if (mode !== 'edit' || !vendorId) return
    let active = true
    getVendorBundle(vendorId)
      .then((bundle) => {
        if (!active) return
        if (bundle) dispatch({ type: 'load', draft: bundleToDraft(bundle) })
        else setLoadError('Vendor not found.')
      })
      .catch(() => {
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
      void requestPersistentStorage()
      window.location.hash = '#/vendors'
    } catch {
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
            <a className="btn btn--ghost" href="#/vendors">
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
              .map((photo) => (
                <PhotoThumb key={photo.key} photo={photo} onRemove={() => removePhoto(photo)} />
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
