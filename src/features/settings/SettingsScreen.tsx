import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { TextField } from '../../components/Field'
import { getSettings, updateSettings } from '../../data/settings'
import type { Settings } from '../../db/models'
import { COMMON_CURRENCIES, normalizeCurrencyCode } from '../../lib/currency'
import { newKey } from '../vendors/formState'
import { useMutation } from '../vendors/useMutation'

interface RateRow {
  key: string
  code: string
  rate: string
}

function toRows(rates: Settings['rates']): RateRow[] {
  return Object.entries(rates).map(([code, rate]) => ({
    key: newKey(),
    code,
    rate: String(rate),
  }))
}

function SettingsForm({ initial }: { initial: Settings }) {
  const [base, setBase] = useState(initial.baseCurrency)
  const [rows, setRows] = useState<RateRow[]>(() => toRows(initial.rates))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  const originalRows = useRef<RateRow[]>(toRows(initial.rates))
  const { error: saveError, run } = useMutation()

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

    setErrors(nextErrors)
    if (!code || Object.keys(nextErrors).length > 0) return
    setNotice('')
    void run(
      updateSettings({ baseCurrency: code, rates }).then(() => {
        setNotice('Saved.')
      }),
    )
  }

  return (
    <section className="settings" aria-labelledby="settings-heading">
      <h1 id="settings-heading">Settings</h1>
      <form className="form-section" onSubmit={save} noValidate>
        <h2>Currency</h2>
        <TextField
          id="base-currency"
          label="Base currency"
          hint="Three-letter ISO code, for example USD."
          list="currency-codes"
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
                list="currency-codes"
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
      <section className="form-section" aria-labelledby="sharing-link-heading">
        <h2 id="sharing-link-heading">Sharing &amp; data</h2>
        <p className="field__hint">Export, import, CSV and single-vendor QR sharing.</p>
        <a className="btn btn--ghost" href="#/share">
          Open sharing &amp; data
        </a>
      </section>
      <datalist id="currency-codes">
        {COMMON_CURRENCIES.map((code) => (
          <option key={code} value={code} />
        ))}
      </datalist>
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
  return <SettingsForm initial={settings} />
}
