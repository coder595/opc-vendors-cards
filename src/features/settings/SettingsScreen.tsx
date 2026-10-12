import { useCallback, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { SelectField, TextField } from '../../components/Field'
import { getSettings, updateSettings } from '../../data/settings'
import { deleteVendor as permanentDeleteVendor, getDeletedVendors, restoreVendor } from '../../data/vendors'
import type { LandedCostSettings, Settings, Theme } from '../../db/models'
import { COMMON_CURRENCIES, normalizeCurrencyCode } from '../../lib/currency'
import { setThemePreference } from '../../lib/theme'
import { newKey } from '../../lib/app'
import { useMutation } from '../vendors/useMutation'

interface RateRow {
  key: string
  code: string
  rate: string
}

const numberText = (value?: number) => (value === undefined ? '' : String(value))

function toRows(rates: Settings['rates']): RateRow[] {
  return Object.entries(rates).map(([code, rate]) => ({
    key: newKey(),
    code,
    rate: String(rate),
  }))
}

function SettingsForm({ initial }: { initial: Settings }) {
  const [base, setBase] = useState(initial.baseCurrency)
  const [theme, setTheme] = useState<Theme>(initial.theme)
  const [rows, setRows] = useState<RateRow[]>(() => toRows(initial.rates))
  const [travellerName, setTravellerName] = useState(initial.travellerName ?? '')
  const [defaultEdition, setDefaultEdition] = useState(initial.defaultFair?.edition ?? '')
  const [defaultHall, setDefaultHall] = useState(initial.defaultFair?.hall ?? '')
  const [defaultBooth, setDefaultBooth] = useState(initial.defaultFair?.booth ?? '')
  const [freightMode, setFreightMode] = useState<LandedCostSettings['freightMode']>(
    initial.landed?.freightMode ?? 'percent',
  )
  const [freight, setFreight] = useState(numberText(initial.landed?.freight))
  const [duty, setDuty] = useState(numberText(initial.landed?.dutyPercent))
  const [vat, setVat] = useState(numberText(initial.landed?.vatPercent))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  const originalRows = useRef<RateRow[]>(toRows(initial.rates))
  const { error: saveError, run } = useMutation()

  const changeTheme = (next: Theme) => {
    setTheme(next)
    setThemePreference(next)
    setNotice('')
    updateSettings({ theme: next }).catch(() => {
      setTheme(initial.theme)
      setThemePreference(initial.theme)
      setNotice('Could not save the theme. Try again.')
    })
  }

  const changeBase = (value: string) => {
    const code = value
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 3)
    if (code === base) return
    setBase(code)
    if (code === initial.baseCurrency) {
      setRows(originalRows.current)
      setNotice('')
    } else {
      setRows([])
      setNotice('Base changed — rates were cleared. Re-enter them for the new base.')
    }
  }

  const updateRow = (key: string, patch: Partial<RateRow>) =>
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  const addRow = () => setRows((prev) => [...prev, { key: newKey(), code: '', rate: '' }])
  const removeRow = (key: string) => setRows((prev) => prev.filter((row) => row.key !== key))

  const save = (event: FormEvent) => {
    event.preventDefault()
    const nextErrors: Record<string, string> = {}
    const code = normalizeCurrencyCode(base)
    if (!code) nextErrors.base = 'Enter a 3-letter base currency.'

    const rates: Record<string, number> = {}
    const seen = new Set<string>()
    for (const row of rows) {
      if (row.code.trim() === '' && row.rate.trim() === '') continue
      const rowCode = normalizeCurrencyCode(row.code)
      const rate = Number(row.rate)
      if (!rowCode) {
        nextErrors[`${row.key}.code`] = 'Use a 3-letter currency code.'
        continue
      }
      if (seen.has(rowCode)) {
        nextErrors[`${row.key}.code`] = 'Duplicate currency code.'
        continue
      }
      if (!Number.isFinite(rate) || rate <= 0) {
        nextErrors[`${row.key}.rate`] = 'Enter a positive number.'
        continue
      }
      seen.add(rowCode)
      rates[rowCode] = rate
    }

    // Landed cost is off while all three numbers are blank; a blank one counts as 0 otherwise.
    let landed: LandedCostSettings | undefined
    if ([freight, duty, vat].some((value) => value.trim() !== '')) {
      const numbers = { freight, duty, vat }
      const parsed: Record<string, number> = {}
      for (const [key, raw] of Object.entries(numbers)) {
        const value = raw.trim() === '' ? 0 : Number(raw)
        if (!Number.isFinite(value) || value < 0) nextErrors[`landed.${key}`] = 'Enter 0 or a positive number.'
        parsed[key] = value
      }
      landed = {
        freightMode,
        freight: parsed.freight ?? 0,
        dutyPercent: parsed.duty ?? 0,
        vatPercent: parsed.vat ?? 0,
      }
    }

    setErrors(nextErrors)
    if (!code || Object.keys(nextErrors).length > 0) return
    setNotice('')
    void run(
      updateSettings({
        baseCurrency: code,
        rates,
        landed,
        travellerName: travellerName.trim() || undefined,
        defaultFair: {
          edition: defaultEdition.trim() || undefined,
          hall: defaultHall.trim() || undefined,
          booth: defaultBooth.trim() || undefined,
        },
      }).then(() => {
        setNotice('Saved.')
      }),
    )
  }

  return (
    <section className="settings" aria-labelledby="settings-heading">
      <h1 id="settings-heading">Settings</h1>
      <form className="form-section" onSubmit={save} noValidate>
        <h2>Appearance</h2>
        <SelectField
          id="theme"
          label="Theme"
          hint="System follows your device's light or dark setting."
          value={theme}
          onChange={changeTheme}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
            { value: 'sepia', label: 'Sepia' },
            { value: 'gruvbox', label: 'Gruvbox' },
            { value: 'oled', label: 'OLED Black' },
          ]}
        />
        <h2>Currency</h2>
        <TextField
          id="base-currency"
          label="Base currency"
          hint="Three-letter ISO code, for example USD."
          list="settings-currency-codes"
          mono
          value={base}
          onChange={changeBase}
          error={errors.base}
        />
        <p className="field__hint">
          Rates are units of each currency per 1 {base || '—'}. Changing the base clears them.
        </p>
        <div className="rate-rows">
          {rows.map((row, index) => (
            <div key={row.key} className="rate-row">
              <TextField
                id={`rate-${row.key}-code`}
                label={`Currency ${index + 1}`}
                list="settings-currency-codes"
                mono
                value={row.code}
                onChange={(code) => updateRow(row.key, { code: code.toUpperCase() })}
                error={errors[`${row.key}.code`]}
              />
              <TextField
                id={`rate-${row.key}-rate`}
                label={`Units per 1 ${base || '—'} (${index + 1})`}
                inputMode="decimal"
                mono
                value={row.rate}
                onChange={(rate) => updateRow(row.key, { rate })}
                error={errors[`${row.key}.rate`]}
              />
              <span className="rate-preview mono">
                1 {base || '—'} = {row.rate || '—'} {row.code || '—'}
              </span>
              <button
                type="button"
                className="btn btn--ghost"
                aria-label={`Remove rate ${index + 1}`}
                onClick={() => removeRow(row.key)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn--ghost" onClick={addRow}>
          Add rate
        </button>
        <h2>Landed cost</h2>
        <p className="field__hint">
          Estimates the cost of one unit delivered home, in {base || 'the base currency'}. Leave
          all three blank to turn it off.
        </p>
        <SelectField
          id="landed-freight-mode"
          label="Freight charged as"
          value={freightMode}
          onChange={setFreightMode}
          options={[
            { value: 'percent', label: 'Percent of the price' },
            { value: 'perCbm', label: `${base || 'Base'} per cubic metre` },
          ]}
        />
        <TextField
          id="landed-freight"
          label={freightMode === 'percent' ? 'Freight %' : `Freight per m³ (${base || '—'})`}
          hint={
            freightMode === 'perCbm'
              ? 'Needs carton size and pieces per carton on each product.'
              : 'Skipped for CIF quotes, which already include freight.'
          }
          inputMode="decimal"
          mono
          value={freight}
          onChange={setFreight}
          error={errors['landed.freight']}
        />
        <TextField
          id="landed-duty"
          label="Import duty %"
          inputMode="decimal"
          mono
          value={duty}
          onChange={setDuty}
          error={errors['landed.duty']}
        />
        <TextField
          id="landed-vat"
          label="VAT %"
          hint="Charged on price + freight + duty."
          inputMode="decimal"
          mono
          value={vat}
          onChange={setVat}
          error={errors['landed.vat']}
        />
        <div className="form-foot">
          <button type="submit" className="btn btn--primary">
            Save settings
          </button>
        </div>
        {notice ? (
          <p className="form-summary" role="status">
            {notice}
          </p>
        ) : null}
        {saveError ? (
          <p className="field__error" role="alert">
            {saveError}
          </p>
        ) : null}
      </form>
      <section className="form-section" aria-labelledby="profile-heading">
        <h2 id="profile-heading">Profile &amp; fair</h2>
        <TextField
          id="traveller-name"
          label="Your name"
          hint="Stored in exports so merged data shows who captured what."
          value={travellerName}
          onChange={setTravellerName}
        />
        <TextField
          id="default-edition"
          label="Current fair edition"
          value={defaultEdition}
          onChange={setDefaultEdition}
        />
        <TextField
          id="default-hall"
          label="Default hall"
          mono
          value={defaultHall}
          onChange={setDefaultHall}
        />
        <TextField
          id="default-booth"
          label="Default booth"
          mono
          value={defaultBooth}
          onChange={setDefaultBooth}
        />
      </section>
      <section className="form-section" aria-labelledby="sharing-link-heading">
        <h2 id="sharing-link-heading">Sharing &amp; data</h2>
        <p className="field__hint">Export, import, CSV and single-vendor QR sharing.</p>
        <a className="btn btn--ghost" href="#/share">
          Open sharing &amp; data
        </a>
      </section>
      <datalist id="settings-currency-codes">
        {COMMON_CURRENCIES.map((code) => (
          <option key={code} value={code} />
        ))}
      </datalist>
    </section>
  )
}

function RecentlyDeletedSection() {
  const vendors = useLiveQuery(() => getDeletedVendors(), [])
  const { error, run } = useMutation()
  const confirmRef = useRef<HTMLDialogElement>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const handleRestore = useCallback((id: string) => {
    void run(restoreVendor(id))
  }, [run])

  const askPermanentDelete = useCallback((id: string) => {
    setPendingId(id)
    confirmRef.current?.showModal()
  }, [])

  const confirmPermanentDelete = useCallback(() => {
    if (pendingId) {
      void run(permanentDeleteVendor(pendingId).then(() => {
        setPendingId(null)
      }))
    }
  }, [pendingId, run])

  if (!vendors || vendors.length === 0) return null

  return (
    <section className="form-section" aria-labelledby="deleted-heading">
      <h2 id="deleted-heading">Recently deleted</h2>
      <p className="field__hint">These vendors will be permanently removed after 90 days.</p>
      {error ? <p className="field__error" role="alert">{error}</p> : null}
      <ul className="record-list">
        {vendors.map((vendor) => (
          <li key={vendor.id} className="record">
            <div className="record__body">
              <p className="record__title">{vendor.name}</p>
              <p className="record__meta mono">
                Deleted {new Date(vendor.deletedAt!).toLocaleDateString()}
              </p>
            </div>
            <div className="record__actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => handleRestore(vendor.id)}
              >
                Restore
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => askPermanentDelete(vendor.id)}
              >
                Delete permanently
              </button>
            </div>
          </li>
        ))}
      </ul>
      <dialog ref={confirmRef} className="dialog" aria-labelledby="purge-vendor-title">
        <form method="dialog">
          <h2 id="purge-vendor-title" className="dialog__title">Delete permanently?</h2>
          <p className="dialog__body">
            All data including contacts, products and photos will be removed. This cannot be undone.
          </p>
          <div className="dialog__actions">
            <button type="submit" className="btn btn--ghost">Cancel</button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={confirmPermanentDelete}
            >
              Delete permanently
            </button>
          </div>
        </form>
      </dialog>
    </section>
  )
}

export function SettingsScreen() {
  const settings = useLiveQuery(() => getSettings(), [])
  if (!settings) {
    return (
      <p className="form-summary" role="status">
        Loading settings…
      </p>
    )
  }
  return (
    <>
      <SettingsForm initial={settings} />
      <RecentlyDeletedSection />
    </>
  )
}
