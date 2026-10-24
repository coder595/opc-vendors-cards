import { useCallback, useEffect, useRef, useState } from 'react'
import { ActionLabel } from '../../components/ActionLabel'
import { PhotoPicker, PhotoThumb } from '../../components/PhotoPicker'
import { RatingField, TextAreaField, TextField } from '../../components/Field'
import { saveVendorBundle } from '../../data/bundle'
import { haptic } from '../../lib/haptics'
import { requestPersistentStorage } from '../../lib/storage'
import type { PhotoDraft } from './formState'
import { DONE_MS } from './useMutation'

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
  /** Which save button is running; both are disabled meanwhile. */
  const [saving, setSaving] = useState<'next' | 'open' | null>(null)
  /** "Save & next" reads "Saved ✓" briefly, since the form just clears. */
  const [justSaved, setJustSaved] = useState(false)
  const [savedNotice, setSavedNotice] = useState('')
  const [summary, setSummary] = useState('')
  const justSavedTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const allPhotosRef = useRef<PhotoDraft[]>([])

  const allPhotos = [...state.cardPhotos, ...state.productPhotos]

  useEffect(() => {
    allPhotosRef.current = allPhotos
  })

  useEffect(() => {
    return () => {
      for (const photo of allPhotosRef.current) URL.revokeObjectURL(photo.previewUrl)
      clearTimeout(justSavedTimer.current)
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
      haptic('error')
      return
    }
    setSaving(navigate)
    setSummary('')
    setSavedNotice('')
    clearTimeout(justSavedTimer.current)
    setJustSaved(false)
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
      haptic('success')

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
        setSavedNotice(`Saved ${name}. Ready for the next vendor.`)
        setJustSaved(true)
        justSavedTimer.current = setTimeout(() => setJustSaved(false), DONE_MS)
      }
    } catch {
      setSummary('Could not be saved. Try again.')
      haptic('error')
    } finally {
      setSaving(null)
    }
  }

  return (
    <form
      className="vendor-form"
      onSubmit={(e) => e.preventDefault()}
      noValidate
      aria-busy={saving !== null}
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
      <p className="sr-only" role="status">
        {savedNotice}
      </p>

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
          disabled={saving !== null}
          aria-busy={saving === 'next'}
          onClick={() => void save('next')}
        >
          <ActionLabel
            show={saving === 'next' ? 'busy' : justSaved ? 'done' : 'idle'}
            labels={{ idle: 'Save & next', busy: 'Saving\u2026', done: 'Saved \u2713' }}
          />
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={saving !== null}
          aria-busy={saving === 'open'}
          onClick={() => void save('open')}
        >
          <ActionLabel
            show={saving === 'open' ? 'busy' : 'idle'}
            labels={{ idle: 'Save & open', busy: 'Saving\u2026' }}
          />
        </button>
      </div>
    </form>
  )
}