import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { StatusSeal } from '../../components/StatusSeal'
import { getVendorBundle } from '../../data/bundle'
import { STATUS_LABEL, TYPE_LABEL } from '../../db/labels'
import { formatMoney } from '../../lib/currency'
import { buildVendorCard, encodeVendorCard, payloadFitsQr, renderQrToCanvas } from '../../lib/share'

export function VendorShare({ vendorId }: { vendorId: string }) {
  const bundle = useLiveQuery(async () => (await getVendorBundle(vendorId)) ?? null, [vendorId])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState('')

  const card = useMemo(
    () => (bundle ? buildVendorCard(bundle.vendor, bundle.contacts, bundle.products) : null),
    [bundle],
  )
  const code = useMemo(() => (card ? encodeVendorCard(card) : ''), [card])
  const fits = code !== '' && payloadFitsQr(code)

  useEffect(() => {
    if (!fits || !canvasRef.current) return
    void renderQrToCanvas(canvasRef.current, code).catch(() =>
      setStatus('Could not render the QR — use Copy code.'),
    )
  }, [code, fits])

  if (bundle === undefined) {
    return (
      <p className="form-summary" role="status">
        Loading…
      </p>
    )
  }

  if (bundle === null || !card) {
    return (
      <section className="empty" aria-labelledby="share-missing">
        <h1 id="share-missing" className="empty__title">
          Vendor not found
        </h1>
        <p className="empty__body">
          <a href="#/vendors">Back to vendors</a>
        </p>
      </section>
    )
  }

  const primary = bundle.contacts.find((contact) => contact.isPrimary) ?? bundle.contacts[0]
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setStatus('Code copied.')
    } catch {
      setStatus('Copy failed — select the code manually.')
    }
  }

  return (
    <div className="sharing">
      <p className="detail__back">
        <a href={`#/vendors/${vendorId}`}>← Vendor</a>
      </p>
      <article className="share-card">
        <header className="share-card__head">
          <StatusSeal status={bundle.vendor.status} rating={bundle.vendor.rating} size="md" />
          <div>
            <h1>{bundle.vendor.name}</h1>
            <p className="detail__meta">
              <span>{TYPE_LABEL[bundle.vendor.type]}</span>
              <span>{STATUS_LABEL[bundle.vendor.status]}</span>
              {bundle.vendor.country ? <span className="mono">{bundle.vendor.country}</span> : null}
            </p>
          </div>
        </header>
        <dl className="spec">
          {bundle.vendor.fair.hall || bundle.vendor.fair.booth ? (
            <div>
              <dt>Booth</dt>
              <dd className="mono">
                {[bundle.vendor.fair.hall, bundle.vendor.fair.booth].filter(Boolean).join(' ')}
              </dd>
            </div>
          ) : null}
          {bundle.vendor.website ? (
            <div>
              <dt>Website</dt>
              <dd className="mono">{bundle.vendor.website}</dd>
            </div>
          ) : null}
          {primary ? (
            <div>
              <dt>Contact</dt>
              <dd>
                {primary.name}
                {primary.phone ? <span className="mono"> {primary.phone}</span> : null}
                {primary.email ? <span className="mono"> {primary.email}</span> : null}
                {primary.wechat ? <span className="mono"> WeChat {primary.wechat}</span> : null}
              </dd>
            </div>
          ) : null}
        </dl>
        {bundle.products.length > 0 ? (
          <ul className="tier-list">
            {bundle.products.slice(0, 5).map((product) => (
              <li key={product.id} className="tier-list__row">
                <span>{product.name}</span>
                {product.price !== undefined ? (
                  <span className="mono">{formatMoney(product.price, product.currency)}</span>
                ) : null}
                {product.moq !== undefined ? <span className="mono">MOQ {product.moq}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="share-card__qr">
          {fits ? (
            <>
              <canvas ref={canvasRef} role="img" aria-label={`QR code for ${bundle.vendor.name}`} />
              <p className="field__hint">
                Scan or copy the code to add this vendor on another device.
              </p>
            </>
          ) : (
            <p className="field__error">
              Too much to fit in a QR code — use the full export instead.
            </p>
          )}
        </div>
        <p className="share-card__footer">OPC Vendors Cards</p>
      </article>

      <div className="share__actions button-row">
        <a className="btn btn--ghost" href={`#/vendors/${vendorId}`}>
          Back
        </a>
        {fits ? (
          <button type="button" className="btn btn--ghost" onClick={() => void copyCode()}>
            Copy code
          </button>
        ) : null}
        <button type="button" className="btn btn--primary" onClick={() => window.print()}>
          Print card
        </button>
      </div>
      {status ? (
        <p className="form-summary" role="status">
          {status}
        </p>
      ) : null}
    </div>
  )
}
