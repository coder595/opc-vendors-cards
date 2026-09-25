import { useEffect, useReducer, useRef, useState } from 'react'
import { type ImportSummary } from '../../lib/exportImport'
import { cardToEnvelope, decodeVendorCard, type VendorCardData } from '../../lib/share'
import { importData } from '../../lib/exportImport'
import { validateEnvelope } from '../../lib/validate'

const MAX_C_CHARS = 4000

type CardState =
  | { kind: 'empty' }
  | { kind: 'preview'; card: VendorCardData }
  | { kind: 'error'; message: string }

type Action =
  | { type: 'clear' }
  | { type: 'decoded'; card: VendorCardData }
  | { type: 'decodeFailed' }
  | { type: 'tooLong' }
  | { type: 'error'; message: string }

function cardReducer(_state: CardState, action: Action): CardState {
  switch (action.type) {
    case 'clear':
      return { kind: 'empty' }
    case 'decoded':
      return { kind: 'preview', card: action.card }
    case 'decodeFailed':
      return { kind: 'error', message: 'That card code could not be read.' }
    case 'tooLong':
      return { kind: 'error', message: 'Card code is too long.' }
    case 'error':
      return { kind: 'error', message: action.message }
  }
}

function extractCParam(): string {
  const hash = window.location.hash
  const match = hash.match(/[?&]c=([^&]+)/)
  if (!match || !match[1]) return ''
  try {
    return decodeURIComponent(match[1])
  } catch {
    return ''
  }
}

function hasBarcodeDetector(): boolean {
  return 'BarcodeDetector' in window && typeof window.BarcodeDetector === 'function'
}

export function ImportCardScreen() {
  const [cardState, dispatch] = useReducer(cardReducer, { kind: 'empty' })
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scannerError, setScannerError] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const detectorRef = useRef<BarcodeDetector | null>(null)
  const scanningRef = useRef(false)
  const processedRef = useRef('')

  const code = extractCParam()

  useEffect(() => {
    if (processedRef.current === code) return
    processedRef.current = code

    setSummary(null)

    if (code.length > MAX_C_CHARS) {
      dispatch({ type: 'tooLong' })
      return
    }
    if (!code) {
      dispatch({ type: 'clear' })
      return
    }
    dispatch({ type: 'clear' })
    decodeVendorCard(code).then((decoded) => {
      if (processedRef.current !== code) return
      if (!decoded) {
        dispatch({ type: 'decodeFailed' })
        return
      }
      dispatch({ type: 'decoded', card: decoded })
    })
  }, [code])

  const add = async () => {
    if (cardState.kind !== 'preview') return
    setBusy(true)
    try {
      const result = validateEnvelope(cardToEnvelope(cardState.card))
      if (!result.ok) {
        dispatch({ type: 'error', message: result.error.message })
        return
      }
      setSummary(await importData(result.envelope, 'merge'))
      dispatch({ type: 'clear' })
    } catch {
      dispatch({ type: 'error', message: 'Could not add the vendor.' })
    } finally {
      setBusy(false)
    }
  }

  const stopCamera = () => {
    scanningRef.current = false
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setScanning(false)
  }

  const startScan = async () => {
    if (!hasBarcodeDetector()) return
    setScannerError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
      })
      streamRef.current = stream
      if (!videoRef.current) {
        stopCamera()
        return
      }
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      detectorRef.current = new BarcodeDetector({ formats: ['qr_code'] })
      setScanning(true)
      scanningRef.current = true
      const tick = async () => {
        if (!scanningRef.current || !videoRef.current || !detectorRef.current) return
        try {
          const barcodes = await detectorRef.current.detect(videoRef.current)
          for (const barcode of barcodes) {
            const decoded = await decodeVendorCard(barcode.rawValue)
            if (decoded) {
              stopCamera()
              dispatch({ type: 'decoded', card: decoded })
              return
            }
          }
        } catch {
          // detection frame failed, continue
        }
        if (scanningRef.current) requestAnimationFrame(tick)
      }
      tick()
    } catch {
      setScannerError('Camera access denied or unavailable.')
    }
  }

  useEffect(() => {
    return () => {
      scanningRef.current = false
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
    }
  }, [])

  const primary =
    cardState.kind === 'preview'
      ? cardState.card.contacts.find((c) => c.isPrimary) ?? cardState.card.contacts[0]
      : null

  return (
    <div className="import-card">
      <p className="detail__back">
        <a href="#/vendors">← Vendors</a>
      </p>
      <h1>Import vendor card</h1>

      {hasBarcodeDetector() && !scanning ? (
        <div className="button-row">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void startScan()}
            disabled={busy}
          >
            Scan QR
          </button>
        </div>
      ) : null}

      {scanning ? (
        <div className="scanner">
          <video ref={videoRef} className="scanner__video" autoPlay muted playsInline />
          <button type="button" className="btn btn--ghost" onClick={stopCamera}>
            Cancel scan
          </button>
        </div>
      ) : null}

      {scannerError ? (
        <p className="field__error" role="alert">
          {scannerError}
        </p>
      ) : null}

      {!code && !scanning ? (
        <p className="field__hint">
          Open a shared vendor link or scan a QR code to preview a vendor card here.
        </p>
      ) : null}

      {cardState.kind === 'error' ? (
        <p className="field__error" role="alert">
          {cardState.message}
        </p>
      ) : null}

      {cardState.kind === 'preview' ? (
        <div className="import-card__preview">
          <div className="import-card__info">
            <h2>{cardState.card.name}</h2>
            {primary ? (
              <p>
                {primary.name}
                {primary.phone ? <span className="mono"> {primary.phone}</span> : null}
                {primary.email ? <span className="mono"> {primary.email}</span> : null}
              </p>
            ) : null}
            {cardState.card.country ? <p className="mono">{cardState.card.country}</p> : null}
            <p className="field__hint">
              {cardState.card.contacts.length}{' '}
              {cardState.card.contacts.length === 1 ? 'contact' : 'contacts'} &middot;{' '}
              {cardState.card.products.length}{' '}
              {cardState.card.products.length === 1 ? 'product' : 'products'}
            </p>
          </div>
          <div className="button-row">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void add()}
              disabled={busy}
            >
              Add {cardState.card.name}
            </button>
          </div>
        </div>
      ) : null}

      {summary ? (
        <p className="form-summary" role="status">
          Added {summary.insertedVendors} vendor.
        </p>
      ) : null}
    </div>
  )
}