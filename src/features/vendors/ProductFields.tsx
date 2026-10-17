import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { SelectField, TextField } from '../../components/Field'
import { PhotoPicker, PhotoThumb } from '../../components/PhotoPicker'
import { getSettings } from '../../data/settings'
import type { Settings } from '../../db/models'
import {
  COMMON_CURRENCIES,
  convertToBase,
  formatMoney,
  normalizeCurrencyCode,
} from '../../lib/currency'
import { newKey } from '../../lib/app'
import { INCOTERMS } from '../../lib/landedCost'
import { createEmptyTier, type ProductDraft, type TierDraft } from './formState'
import { useVendorForm } from './VendorFormContext'

function hasPacking(product: ProductDraft): boolean {
  return [
    product.incoterm,
    product.pcsPerCarton,
    product.cartonLengthCm,
    product.cartonWidthCm,
    product.cartonHeightCm,
    product.cartonGrossKg,
  ].some((value) => value.trim() !== '')
}

function BasePreview({
  amount,
  currency,
  base,
  rates,
}: {
  amount: string
  currency: string
  base: string
  rates: Settings['rates']
}) {
  const trimmed = amount.trim()
  const code = normalizeCurrencyCode(currency)
  if (!code || code === base || trimmed === '') return null
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < 0) return null
  const converted = convertToBase(value, code, base, rates)
  if (converted === null) return <span className="no-rate">no {base} rate</span>
  return <span className="tier-row__base mono">≈ {formatMoney(converted, base)}</span>
}

function ProductRow({
  product,
  settings,
}: {
  product: ProductDraft
  settings: Settings | undefined
}) {
  const { draft, dispatch, errors, removePhoto } = useVendorForm()
  const id = `product-${product.key}`
  const update = (patch: Partial<ProductDraft>) =>
    dispatch({ type: 'updateProduct', key: product.key, patch })
  const photos = draft.photos.filter((photo) => product.photoKeys.includes(photo.key))
  // Opens by itself only when the product already has packing data; the user toggles it after.
  const [packingOpen, setPackingOpen] = useState(() => hasPacking(product))

  const updateTier = (tierKey: string, patch: Partial<TierDraft>) =>
    update({
      tiers: product.tiers.map((tier) => (tier.key === tierKey ? { ...tier, ...patch } : tier)),
    })
  const removeTier = (tierKey: string) =>
    update({ tiers: product.tiers.filter((tier) => tier.key !== tierKey) })
  const addTier = () => {
    const key = newKey()
    update({ tiers: [...product.tiers, createEmptyTier(key)] })
    window.setTimeout(() => document.getElementById(`${id}-tier-${key}-qty`)?.focus(), 0)
  }

  return (
    <fieldset className="subform">
      <legend>{product.name.trim() || 'Product'}</legend>
      <TextField
        id={`${id}-name`}
        label="Product name"
        value={product.name}
        onChange={(name) => update({ name })}
        error={errors[`products.${product.key}.name`]}
      />
      <TextField
        id={`${id}-unit`}
        label="Unit"
        value={product.unit}
        onChange={(unit) => update({ unit })}
      />
      <TextField
        id={`${id}-currency`}
        label="Currency"
        hint="Three-letter code, for example CNY"
        list="currency-codes"
        mono
        value={product.currency}
        onChange={(currency) => update({ currency: currency.toUpperCase() })}
        error={errors[`products.${product.key}.currency`]}
      />
      <TextField
        id={`${id}-price`}
        label="Price"
        inputMode="decimal"
        mono
        value={product.price}
        onChange={(price) => update({ price })}
        error={errors[`products.${product.key}.price`]}
      />
      {settings ? (
        <BasePreview
          amount={product.price}
          currency={product.currency}
          base={settings.baseCurrency}
          rates={settings.rates}
        />
      ) : null}
      <TextField
        id={`${id}-moq`}
        label="MOQ"
        inputMode="numeric"
        mono
        value={product.moq}
        onChange={(moq) => update({ moq })}
        error={errors[`products.${product.key}.moq`]}
      />
      <TextField
        id={`${id}-order-qty`}
        label="Order quantity"
        hint="How many you plan to buy. Totals use the MOQ when this is blank."
        inputMode="numeric"
        mono
        value={product.orderQty}
        onChange={(orderQty) => update({ orderQty })}
        error={errors[`products.${product.key}.orderQty`]}
      />
      <TextField
        id={`${id}-lead`}
        label="Lead time in days"
        inputMode="numeric"
        mono
        value={product.leadTimeDays}
        onChange={(leadTimeDays) => update({ leadTimeDays })}
        error={errors[`products.${product.key}.leadTimeDays`]}
      />
      <TextField
        id={`${id}-terms`}
        label="Payment terms"
        value={product.paymentTerms}
        onChange={(paymentTerms) => update({ paymentTerms })}
      />

      {/* N2: collapsed so the booth form stays short; opens when anything is filled in. */}
      <details
        className="card-paste"
        open={packingOpen}
        onToggle={(event) => setPackingOpen(event.currentTarget.open)}
      >
        <summary>Packing and incoterm</summary>
        <div className="card-paste__body">
        <SelectField
          id={`${id}-incoterm`}
          label="Incoterm"
          value={product.incoterm}
          onChange={(incoterm) => update({ incoterm })}
          options={[
            { value: '', label: 'Not set' },
            ...INCOTERMS.map((term) => ({ value: term, label: term })),
          ]}
        />
        <TextField
          id={`${id}-pcs`}
          label="Pieces per carton"
          inputMode="numeric"
          mono
          value={product.pcsPerCarton}
          onChange={(pcsPerCarton) => update({ pcsPerCarton })}
          error={errors[`products.${product.key}.pcsPerCarton`]}
        />
        <TextField
          id={`${id}-len`}
          label="Carton length (cm)"
          inputMode="decimal"
          mono
          value={product.cartonLengthCm}
          onChange={(cartonLengthCm) => update({ cartonLengthCm })}
          error={errors[`products.${product.key}.cartonLengthCm`]}
        />
        <TextField
          id={`${id}-wid`}
          label="Carton width (cm)"
          inputMode="decimal"
          mono
          value={product.cartonWidthCm}
          onChange={(cartonWidthCm) => update({ cartonWidthCm })}
          error={errors[`products.${product.key}.cartonWidthCm`]}
        />
        <TextField
          id={`${id}-hei`}
          label="Carton height (cm)"
          inputMode="decimal"
          mono
          value={product.cartonHeightCm}
          onChange={(cartonHeightCm) => update({ cartonHeightCm })}
          error={errors[`products.${product.key}.cartonHeightCm`]}
        />
        <TextField
          id={`${id}-kg`}
          label="Carton gross weight (kg)"
          inputMode="decimal"
          mono
          value={product.cartonGrossKg}
          onChange={(cartonGrossKg) => update({ cartonGrossKg })}
          error={errors[`products.${product.key}.cartonGrossKg`]}
        />
        </div>
      </details>

      <div className="tier-editor">
        <p className="field__hint">MOQ breaks — unit price at a quantity</p>
        {product.tiers.map((tier) => (
          <div key={tier.key} className="tier-row">
            <TextField
              id={`${id}-tier-${tier.key}-qty`}
              label="From quantity"
              inputMode="numeric"
              mono
              value={tier.minQty}
              onChange={(minQty) => updateTier(tier.key, { minQty })}
              error={errors[`products.${product.key}.tiers.${tier.key}.minQty`]}
            />
            <TextField
              id={`${id}-tier-${tier.key}-price`}
              label="Unit price"
              inputMode="decimal"
              mono
              value={tier.unitPrice}
              onChange={(unitPrice) => updateTier(tier.key, { unitPrice })}
              error={errors[`products.${product.key}.tiers.${tier.key}.unitPrice`]}
            />
            {settings ? (
              <BasePreview
                amount={tier.unitPrice}
                currency={product.currency}
                base={settings.baseCurrency}
                rates={settings.rates}
              />
            ) : null}
            <button
              type="button"
              className="btn btn--ghost"
              aria-label={`Remove break from ${tier.minQty || 'new'}`}
              onClick={() => removeTier(tier.key)}
            >
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="btn btn--ghost" onClick={addTier}>
          Add break
        </button>
      </div>

      <div className="photo-row">
        <PhotoPicker
          id={`${id}-photo`}
          label="Product photo"
          kind="product"
          multiple
          onAdd={(photo) => dispatch({ type: 'addPhoto', photo, productKey: product.key })}
        />
        {photos.map((photo, index) => (
          <PhotoThumb
            key={photo.key}
            photo={photo}
            label={`Remove product photo ${index + 1}`}
            onRemove={() => removePhoto(photo)}
          />
        ))}
      </div>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => dispatch({ type: 'removeProduct', key: product.key })}
      >
        Remove product
      </button>
    </fieldset>
  )
}

export function ProductFields() {
  const { draft, dispatch } = useVendorForm()
  const settings = useLiveQuery(() => getSettings(), [])

  const addProduct = () => {
    const key = newKey()
    dispatch({ type: 'addProduct', key })
    window.setTimeout(() => document.getElementById(`product-${key}-name`)?.focus(), 0)
  }

  return (
    <section className="form-section" aria-labelledby="products-heading">
      <h2 id="products-heading">Products</h2>
      {draft.products.map((product) => (
        <ProductRow key={product.key} product={product} settings={settings} />
      ))}
      <button type="button" className="btn btn--ghost" onClick={addProduct}>
        Add product
      </button>
      <datalist id="currency-codes">
        {COMMON_CURRENCIES.map((code) => (
          <option key={code} value={code} />
        ))}
      </datalist>
    </section>
  )
}
