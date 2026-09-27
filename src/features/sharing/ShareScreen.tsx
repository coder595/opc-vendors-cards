import { useEffect, useState } from 'react'
import { TextField } from '../../components/Field'
import type { ExportEnvelope, ImportMode } from '../../db/models'
import { db } from '../../db/schema'
import { getSettings } from '../../data/settings'
import { buildProductCsv, buildVendorCsv, csvFilename } from '../../lib/csv'
import {
  buildExportBlob,
  estimateExportSize,
  exportFilename,
  exportNdjsonStream,
  importData,
  parseImport,
  previewImport,
  serializeDb,
  type ExportSizeEstimate,
  type ImportPreview,
  type ImportSummary,
} from '../../lib/exportImport'
import {
  canShareFiles,
  cardToEnvelope,
  decodeVendorCard,
  downloadBlob,
  shareFile,
  type VendorCardData,
} from '../../lib/share'
import { validateEnvelope, type RejectedRecord } from '../../lib/validate'

function ExportPanel() {
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [format, setFormat] = useState<1 | 2>(2)
  const [includePhotos, setIncludePhotos] = useState(true)
  const [sizeEstimate, setSizeEstimate] = useState<ExportSizeEstimate | null>(null)

  useEffect(() => {
    let cancelled = false
    estimateExportSize({ format, includePhotos }).then((estimate) => {
      if (!cancelled) setSizeEstimate(estimate)
    })
    return () => {
      cancelled = true
    }
  }, [format, includePhotos])

  const markExported = () =>
    localStorage.setItem('opc.lastExportAt', Date.now().toString())

  const runExport = async (task: () => Promise<string>) => {
    setBusy(true)
    setError('')
    setStatus('')
    try {
      setStatus(await task())
    } catch (err) {
      console.error(err)
      setError('Export failed. Your data is unchanged.')
    } finally {
      setBusy(false)
    }
  }

  const exportJson = () =>
    runExport(async () => {
      let blob: Blob
      if (format === 2) {
        const chunks: Uint8Array[] = []
        for await (const chunk of exportNdjsonStream({ format, includePhotos })) {
          chunks.push(chunk)
        }
        blob = new Blob(chunks as BlobPart[], { type: 'application/gzip' })
      } else {
        blob = await buildExportBlob(await serializeDb())
      }
      downloadBlob(blob, exportFilename())
      markExported()
      return 'Export downloaded.'
    })

  const exportCsv = () =>
    runExport(async () => {
      const [vendors, contacts, products] = await Promise.all([
        db.vendors.toArray(),
        db.contacts.toArray(),
        db.products.toArray(),
      ])
      const csv = buildVendorCsv(
        vendors.filter((vendor) => vendor.deletedAt === undefined),
        contacts,
        products,
      )
      downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), csvFilename())
      markExported()
      return 'CSV downloaded.'
    })

  const exportProductsCsv = () =>
    runExport(async () => {
      const [vendors, products, settings] = await Promise.all([
        db.vendors.toArray(),
        db.products.toArray(),
        getSettings(),
      ])
      const csv = buildProductCsv(
        vendors.filter((vendor) => vendor.deletedAt === undefined),
        products,
        settings.baseCurrency,
        settings.rates,
      )
      downloadBlob(
        new Blob([csv], { type: 'text/csv;charset=utf-8' }),
        csvFilename(new Date(), 'products'),
      )
      return 'Products CSV downloaded.'
    })

  const shareJson = () =>
    runExport(async () => {
      let blob: Blob
      if (format === 2) {
        const chunks: Uint8Array[] = []
        for await (const chunk of exportNdjsonStream({ format, includePhotos })) {
          chunks.push(chunk)
        }
        blob = new Blob(chunks as BlobPart[], { type: 'application/gzip' })
      } else {
        blob = await buildExportBlob(await serializeDb())
      }
      const shared = await shareFile(blob, exportFilename())
      if (shared) markExported()
      return shared ? 'Shared.' : 'Sharing is not available here — use Download.'
    })

  return (
    <section className="form-section" aria-labelledby="export-heading">
      <h2 id="export-heading">Export</h2>
      <p className="field__hint">All your data in one gzipped file for backup or transfer.</p>

      <fieldset className="field">
        <legend>Export options</legend>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={!includePhotos}
            onChange={(event) => setIncludePhotos(!event.target.checked)}
          />
          Without photos
        </label>
        <label className="checkbox">
          <input
            type="radio"
            name="export-format"
            checked={format === 2}
            onChange={() => setFormat(2)}
          />
          NDJSON (v2, streaming, smaller)
        </label>
        <label className="checkbox">
          <input
            type="radio"
            name="export-format"
            checked={format === 1}
            onChange={() => setFormat(1)}
          />
          JSON (v1, compatible with older versions)
        </label>
      </fieldset>

      {sizeEstimate ? (
        <p className="field__hint">Estimated size: {sizeEstimate.text}</p>
      ) : null}

      <div className="button-row">
        {canShareFiles() ? (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void shareJson()}
            disabled={busy}
          >
            Share file
          </button>
        ) : null}
        <button
          type="button"
          className={canShareFiles() ? 'btn btn--ghost' : 'btn btn--primary'}
          onClick={() => void exportJson()}
          disabled={busy}
        >
          Download export
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => void exportCsv()}
          disabled={busy}
        >
          Export CSV
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => void exportProductsCsv()}
          disabled={busy}
        >
          Products CSV
        </button>
      </div>
      {status ? (
        <p className="form-summary" role="status">
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}
      <StorageInfo />
    </section>
  )
}

function StorageInfo() {
  const [info, setInfo] = useState<{ used: string; quota: string } | null>(null)

  useEffect(() => {
    if (!('storage' in navigator) || !('estimate' in navigator.storage)) return
    navigator.storage.estimate().then((est) => {
      if (est.usage === undefined || est.quota === undefined) return
      const fmt = (b: number) => {
        if (b < 1024) return `${b} B`
        if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
        return `${(b / (1024 * 1024)).toFixed(1)} MB`
      }
      setInfo({ used: fmt(est.usage), quota: fmt(est.quota) })
    })
  }, [])

  const lastExport = localStorage.getItem('opc.lastExportAt')
  const lastExportLabel = lastExport
    ? new Date(Number(lastExport)).toLocaleDateString()
    : 'Never'

  return (
    <details className="storage-info">
      <summary>Storage &amp; backups</summary>
      <dl>
        {info ? (
          <>
            <dt>Used</dt>
            <dd>{info.used}</dd>
            <dt>Quota</dt>
            <dd>{info.quota}</dd>
          </>
        ) : null}
        <dt>Last export</dt>
        <dd>{lastExportLabel}</dd>
      </dl>
    </details>
  )
}

function ImportPanel() {
  const [envelope, setEnvelope] = useState<ExportEnvelope | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [rejected, setRejected] = useState<RejectedRecord[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [mode, setMode] = useState<ImportMode>('merge')
  const [importedWins, setImportedWins] = useState(false)
  const [importSettings, setImportSettings] = useState(false)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [fileName, setFileName] = useState('')

  const onFile = async (file: File) => {
    setEnvelope(null)
    setPreview(null)
    setRejected([])
    setWarnings([])
    setSummary(null)
    setError('')
    setFileName(file.name)
    try {
      const result = await parseImport(file)
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      setEnvelope(result.envelope)
      setRejected(result.rejected)
      setWarnings(result.warnings)
      setPreview(await previewImport(result.envelope))
    } catch (err) {
      console.error(err)
      setError('Could not read that file.')
    }
  }

  const apply = async () => {
    if (!envelope) return
    setBusy(true)
    setError('')
    try {
      const result = await importData(envelope, mode, {
        policy: importedWins ? 'imported-wins' : 'newest-wins',
        importSettings,
      })
      setSummary(result)
      setRejected((prev) => [...prev, ...result.rejected])
    } catch (err) {
      console.error(err)
      setError('Import failed. The database was not changed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="form-section" aria-labelledby="import-heading">
      <h2 id="import-heading">Import</h2>
      <div className="field">
        <label htmlFor="import-file">Import file</label>
        <input
          id="import-file"
          type="file"
          accept=".ocv.json.gz,.gz,.json,application/gzip,application/json"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void onFile(file)
          }}
        />
      </div>
      {fileName ? <p className="field__hint">{fileName}</p> : null}
      {warnings.length > 0 ? <p className="field__hint">{warnings.join(' ')}</p> : null}
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}

      {preview ? (
        <div className="import-preview">
          <p role="status">
            {preview.counts.vendors} vendors, {preview.counts.contacts} people,{' '}
            {preview.counts.products} products, {preview.counts.attachments} photos
          </p>
          <p className="field__hint">
            {preview.newVendors} new · {preview.matchedVendors} matching existing
          </p>
          {rejected.length > 0 ? (
            <details>
              <summary>{rejected.length} records skipped</summary>
              <ul>
                {rejected.slice(0, 20).map((item, index) => (
                  <li key={index}>
                    {item.table}: {item.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <fieldset className="field">
            <legend>Import mode</legend>
            <label className="checkbox">
              <input
                type="radio"
                name="import-mode"
                checked={mode === 'merge'}
                onChange={() => setMode('merge')}
              />
              Merge
            </label>
            <label className="checkbox">
              <input
                type="radio"
                name="import-mode"
                checked={mode === 'replace'}
                onChange={() => setMode('replace')}
              />
              Replace everything
            </label>
          </fieldset>
          {mode === 'merge' ? (
            <label className="checkbox">
              <input
                type="checkbox"
                checked={importedWins}
                onChange={(event) => setImportedWins(event.target.checked)}
              />
              Always keep imported values on conflicts (otherwise the newer edit wins)
            </label>
          ) : (
            <p className="field__error">
              Replace deletes all local vendors before importing. Export a backup first.
            </p>
          )}
          <label className="checkbox">
            <input
              type="checkbox"
              checked={importSettings}
              onChange={(event) => setImportSettings(event.target.checked)}
            />
            Also import currency settings
          </label>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void apply()}
            disabled={busy}
          >
            {mode === 'replace' ? 'Replace all data' : 'Merge into this device'}
          </button>
        </div>
      ) : null}

      {summary ? (
        <p className="form-summary" role="status">
          Imported {summary.insertedVendors} vendors, matched {summary.matchedVendors},{' '}
          {summary.insertedChildren} records, {summary.importedAttachments} photos.
        </p>
      ) : null}
    </section>
  )
}

function ImportCode() {
  const [code, setCode] = useState('')
  const [card, setCard] = useState<VendorCardData | null>(null)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [error, setError] = useState('')

  const readCode = async () => {
    const decoded = await decodeVendorCard(code.trim())
    if (!decoded) {
      setError('That card code could not be read.')
      setCard(null)
      return
    }
    setError('')
    setSummary(null)
    setCard(decoded)
  }

  const add = async () => {
    if (!card) return
    setError('')
    try {
      const result = validateEnvelope(cardToEnvelope(card))
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      setSummary(await importData(result.envelope, 'merge'))
      setCard(null)
      setCode('')
    } catch (err) {
      console.error(err)
      setError('Could not add the vendor.')
    }
  }

  return (
    <section className="form-section" aria-labelledby="code-heading">
      <h2 id="code-heading">Add a vendor from a card code</h2>
      <p className="field__hint">Paste the URL or code shown under a shared vendor's QR.</p>
      <TextField id="card-code" label="Card URL or code" mono value={code} onChange={setCode} />
      <div className="button-row">
        <button type="button" className="btn btn--ghost" onClick={() => void readCode()}>
          Read code
        </button>
        {card ? (
          <button type="button" className="btn btn--primary" onClick={() => void add()}>
            Add {card.name}
          </button>
        ) : null}
      </div>
      {card ? (
        <p role="status">
          {card.name} · {card.contacts.length} people · {card.products.length} products
        </p>
      ) : null}
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}
      {summary ? (
        <p className="form-summary" role="status">
          Added {summary.insertedVendors} vendor.
        </p>
      ) : null}
    </section>
  )
}

export function ShareScreen() {
  return (
    <div className="sharing">
      <p className="detail__back">
        <a href="#/me">← Settings</a>
      </p>
      <h1>Sharing &amp; data</h1>
      <ExportPanel />
      <ImportPanel />
      <ImportCode />
    </div>
  )
}