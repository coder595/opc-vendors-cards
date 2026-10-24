import { useCallback, useEffect, useRef, useState } from 'react'
import type { Attachment } from '../db/models'
import { ATTACHMENT_KIND_LABEL } from '../db/labels'
import { canShareFiles, downloadBlob } from '../lib/share'

const blobUrls = new Map<string, string>()

function urlFor(att: Attachment): string {
  let url = blobUrls.get(att.id)
  if (!url) {
    url = URL.createObjectURL(att.blob)
    blobUrls.set(att.id, url)
  }
  return url
}

function clearAll() {
  for (const u of blobUrls.values()) URL.revokeObjectURL(u)
  blobUrls.clear()
}

interface PhotoViewerProps {
  attachments: Attachment[]
  initialIndex: number
  onClose: () => void
  onDelete?: (id: string) => void
}

export function PhotoViewer({ attachments, initialIndex, onClose, onDelete }: PhotoViewerProps) {
  const [index, setIndex] = useState(initialIndex)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const attachment = attachments[index]

  useEffect(() => {
    clearAll()
    dialogRef.current?.showModal()
    return clearAll
  }, [])

  useEffect(() => {
    const arrowHandler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      // Never hijack arrows while typing (guards any future embedded field).
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setIndex((i) => Math.max(0, i - 1))
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        setIndex((i) => Math.min(attachments.length - 1, i + 1))
      }
    }
    window.addEventListener('keydown', arrowHandler)
    return () => window.removeEventListener('keydown', arrowHandler)
  }, [attachments.length])

  const handleClose = useCallback(() => {
    dialogRef.current?.close()
    onClose()
  }, [onClose])

  const handleBackdrop = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) handleClose()
  }, [handleClose])

  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), [])
  const next = useCallback(() => setIndex((i) => Math.min(attachments.length - 1, i + 1)), [attachments.length])

  // Share sheet (WhatsApp, WeChat, Mail…) where the browser can share files, else download.
  const sharePhoto = useCallback(async (att: Attachment, name: string) => {
    const file = new File([att.blob], name, { type: att.blob.type || 'image/jpeg' })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] })
      } catch {
        // Cancelled by the user; nothing to do.
      }
      return
    }
    downloadBlob(att.blob, name)
  }, [])

  if (!attachment) return null

  return (
    <dialog
      ref={dialogRef}
      className="photo-viewer"
      aria-label={`Photo ${index + 1} of ${attachments.length}`}
      onCancel={(event) => {
        event.preventDefault()
        handleClose()
      }}
    >
      <div className="photo-viewer__inner" role="presentation" onClick={handleBackdrop}>
        <div className="photo-viewer__head">
          <span className="mono">{ATTACHMENT_KIND_LABEL[attachment.kind]}</span>
          <span className="mono" aria-live="polite">{index + 1} / {attachments.length}</span>
          <button type="button" className="btn btn--ghost" onClick={handleClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="photo-viewer__body" style={{ touchAction: 'pinch-zoom' }}>
          <img src={urlFor(attachment)} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        </div>
        <div className="photo-viewer__foot">
          {index > 0 ? (
            <button type="button" className="btn btn--ghost" onClick={prev}>
              Previous
            </button>
          ) : <span />}
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => void sharePhoto(attachment, `${attachment.kind}-photo-${index + 1}.jpg`)}
          >
            {canShareFiles() ? 'Share' : 'Download'}
          </button>
          {onDelete ? (
            <button type="button" className="btn btn--ghost" onClick={() => { onDelete(attachment.id); handleClose() }}>
              Delete
            </button>
          ) : null}
          {index < attachments.length - 1 ? (
            <button type="button" className="btn btn--ghost" onClick={next}>
              Next
            </button>
          ) : <span />}
        </div>
      </div>
    </dialog>
  )
}