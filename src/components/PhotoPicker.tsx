import { useRef, useState } from 'react'
import type { AttachmentKind } from '../db/models'
import { resizePhoto } from '../lib/images'
import { newKey, type PhotoDraft } from '../features/vendors/formState'

interface PhotoPickerProps {
  id: string
  label: string
  kind: AttachmentKind
  onAdd: (photo: PhotoDraft) => void
  multiple?: boolean
  testId?: string
}

export function PhotoPicker({ id, label, kind, onAdd, multiple, testId }: PhotoPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return
    setBusy(true)
    setError(undefined)
    let failures = 0
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        failures += 1
        continue
      }
      try {
        const image = await resizePhoto(file)
        onAdd({
          key: newKey(),
          kind,
          image,
          previewUrl: URL.createObjectURL(image.thumb),
        })
      } catch {
        failures += 1
      }
    }
    if (failures > 0) {
      setError(
        failures === 1 ? 'That image could not be added.' : 'Some images could not be added.',
      )
    }
    setBusy(false)
  }

  return (
    <div className="photo-picker">
      <input
        ref={inputRef}
        id={id}
        data-testid={testId}
        className="sr-only"
        type="file"
        accept="image/*"
        capture="environment"
        multiple={multiple}
        tabIndex={-1}
        aria-label={label}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => {
          const files = event.target.files ? Array.from(event.target.files) : []
          event.target.value = ''
          void handleFiles(files)
        }}
      />
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        {busy ? 'Processing…' : label}
      </button>
      {error ? (
        <p className="field__error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function PhotoThumb({
  photo,
  onRemove,
  label = 'Remove photo',
}: {
  photo: PhotoDraft
  onRemove: () => void
  label?: string
}) {
  return (
    <figure className="photo-thumb">
      <img src={photo.previewUrl} alt="" width={72} height={72} />
      <button type="button" className="photo-thumb__remove" aria-label={label} onClick={onRemove}>
        ×
      </button>
    </figure>
  )
}
