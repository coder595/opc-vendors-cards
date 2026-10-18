import { useCallback, useEffect, useRef, useState } from 'react'
import { PhotoPicker, PhotoThumb } from '../../components/PhotoPicker'
import { RatingField, TextAreaField, TextField } from '../../components/Field'
import { saveVendorBundle } from '../../data/bundle'
import { requestPersistentStorage } from '../../lib/storage'
import type { PhotoDraft } from './formState'

interface QuickState {
  name: string
  hall: string
  booth: string
  rating: 1 | 2 | 3 | 4 | 5
  note: string
  cardPhotos: PhotoDraft[]
  productPhotos: PhotoDraft[]
}

function emptyState(): QuickState {
  return {
    name: '',
    hall: localStorage.getItem('opc.lastHall') ?? '',
    booth: localStorage.getItem('opc.lastBooth') ?? '',
    rating: 3,
    note: '',
    cardPhotos: [],
    productPhotos: [],
  }
}

export function QuickAddScreen() {
  const [state, setState] = useState<QuickState>(emptyState)
  const [saving, setSaving] = useState(false)
  const [summary, setSummary] = useState('')
  const allPhotosRef = useRef<PhotoDraft[]>([])

  const allPhotos = [...state.cardPhotos, ...state.productPhotos]

  useEffect(() => {
    allPhotosRef.current = allPhotos
  })

  useEffect(() => {
    return () => {
      for (const photo of allPhotosRef.current) URL.revokeObjectURL(photo.previewUrl)
    }
  }, [])

  const dirty = state.name.trim() !== '' || state.note.trim() !== '' || allPhotos.length > 0

  useEffect(() => {
    window.onbeforeunload = dirty ? (() => true) : null
    return () => {
      window.onbeforeunload = null
    }
  }, [dirty])

  const removePhoto = useCallback((photo: PhotoDraft) => {
    URL.revokeObjectURL(photo.previewUrl)
    setState((prev) => ({
      ...prev,
      cardPhotos: prev.cardPhotos.filter((p) => p.key !== photo.key),
      productPhotos: prev.productPhotos.filter((p) => p.key !== photo.key),
    }))
  }, [])

  const save = async (navigate: 'next' | 'open') => {
    const name = state.name.trim()
    if (!name) {
      setSummary('Enter a company name')
      return
    }
    setSaving(true)
    setSummary('')
    try {
      const photos = allPhotos
      const vendorId = await saveVendorBundle({
        vendor: {
          name,
          type: 'other',
          status: 'lead',
          rating: state.rating,
          fair: {
            hall: state.hall.trim() || undefined,
            booth: state.booth.trim() || undefined,
            note: state.note.trim() || undefined,
          },
        },
        contacts: [],
        products: [],
        photos: photos.map((photo) => ({
          key: photo.key,
          kind: photo.kind,
          image: photo.image,
        })),
      })

      localStorage.setItem('opc.lastHall', state.hall)
      localStorage.setItem('opc.lastBooth', state.booth)
      void requestPersistentStorage()

      if (navigate === 'open') {
        window.location.hash = `#/vendors/${vendorId}`
      } else {
        for (const photo of allPhotosRef.current) URL.revokeObjectURL(photo.previewUrl)
        setState({
          name: '',
          hall: state.hall,
          booth: state.booth,
          rating: 3,
          note: '',
          cardPhotos: [],
          productPhotos: [],
        })
      }
    } catch {
      setSummary('Could not be saved. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="vendor-form"
      onSubmit={(e) => e.preventDefault()}
      noValidate
      aria-busy={saving}
    >
      <div className="form-head">
        <h1>Quick add vendor</h1>
        <div className="form-head__actions">
          <a className="btn btn--ghost" href="#/vendors">
            Cancel
          </a>
        </div>
      </div>

      {summary ? (
        <p className="form-summary" role="alert">
          {summary}
        </p>
      ) : null}

      <section className="form-section" aria-labelledby="quick-identity">
        <h2 id="quick-identity">Company</h2>
        <TextField
          id="quick-name"
          label="Company name"
          autoComplete="organization"
          value={state.name}
          onChange={(name) => setState((prev) => ({ ...prev, name }))}
        />
        <TextField
          id="quick-hall"
          label="Hall"
          mono
          value={state.hall}
          onChange={(hall) => setState((prev) => ({ ...prev, hall }))}
        />
        <TextField
          id="quick-booth"
          label="Booth"
          mono
          value={state.booth}
          onChange={(booth) => setState((prev) => ({ ...prev, booth }))}
        />
        <RatingField
          id="quick-rating"
          label="Interest"
          value={state.rating}
          onChange={(rating) => setState((prev) => ({ ...prev, rating }))}
        />
      </section>

      <section className="form-section" aria-labelledby="quick-photos">
        <h2 id="quick-photos">Photos</h2>
        <div className="photo-row">
          <PhotoPicker
            id="quick-card-photo"
            label="Take card photo"
            kind="business_card"
            onAdd={(photo) =>
              setState((prev) => ({ ...prev, cardPhotos: [...prev.cardPhotos, photo] }))
            }
          />
          {state.cardPhotos.map((photo) => (
            <PhotoThumb
              key={photo.key}
              photo={photo}
              label="Remove card photo"
              onRemove={() => removePhoto(photo)}
            />
          ))}
        </div>
        <div className="photo-row">
          <PhotoPicker
            id="quick-product-photo"
            label="Take product photo"
            kind="product"
            onAdd={(photo) =>
              setState((prev) => ({ ...prev, productPhotos: [...prev.productPhotos, photo] }))
            }
          />
          {state.productPhotos.map((photo, index) => (
            <PhotoThumb
              key={photo.key}
              photo={photo}
              label={`Remove product photo ${index + 1}`}
              onRemove={() => removePhoto(photo)}
            />
          ))}
        </div>
      </section>

      <section className="form-section" aria-labelledby="quick-notes">
        <h2 id="quick-notes">Note</h2>
        <TextAreaField
          id="quick-note"
          label="Free-text note"
          value={state.note}
          rows={3}
          onChange={(note) => setState((prev) => ({ ...prev, note }))}
        />
      </section>

      <div className="form-foot">
        <button
          type="button"
          className="btn btn--primary"
          disabled={saving}
          onClick={() => void save('next')}
        >
          {saving ? 'Saving\u2026' : 'Save & next'}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={saving}
          onClick={() => void save('open')}
        >
          {saving ? 'Saving\u2026' : 'Save & open'}
        </button>
      </div>
    </form>
  )
}