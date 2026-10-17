import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { SelectField, TextField } from '../../components/Field'
import { getSettings, updateSettings } from '../../data/settings'
import type { Settings } from '../../db/models'
import {
  COMMON_CURRENCIES,
  crossRate,
  formatMoney,
  normalizeCurrencyCode,
  rateFor,
} from '../../lib/currency'
import {
  FX_DEFAULT_CODES,
  fxIsStale,
  fetchLiveRates,
  mergeLiveRates,
  readFxStorage,
  writeFxStorage,
} from '../../lib/fx'
import { newKey } from '../../lib/app'
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

/** Updates listed currencies with live rates and appends OMR/CNY when missing. */
function mergeRows(rows: RateRow[], live: Record<string, number>, base: string): RateRow[] {
  const next = rows.map((row) => {
    const code = normalizeCurrencyCode(row.code)
    const rate = code && code !== base ? live[code] : undefined
    return rate === undefined ? row : { ...row, rate: String(rate) }
  })
  const listed = new Set(next.map((row) => normalizeCurrencyCode(row.code)))
  for (const code of FX_DEFAULT_CODES) {
    const rate = live[code]
    if (code !== base && !listed.has(code) && rate !== undefined) {
      next.push({ key: newKey(), code, rate: String(rate) })
    }
  }
  return next
}

const sameRows = (a: RateRow[], b: RateRow[]) =>
  a.length === b.length && a.every((row, i) => row.code === b[i]?.code && row.rate === b[i]?.rate)

const asOfText = (asOf: number) => new Date(asOf).toLocaleString()

const PAIR_STORAGE = 'opc.ratesPair'
const DEFAULT_PAIR = { from: 'OMR', to: 'CNY' }

function readPair(): { from: string; to: string } {
  try {
    const [from, to] = (localStorage.getItem(PAIR_STORAGE) ?? '').split('>')
    const a = normalizeCurrencyCode(from ?? '')
    const b = normalizeCurrencyCode(to ?? '')
    return a && b ? { from: a, to: b } : DEFAULT_PAIR
  } catch {
    return DEFAULT_PAIR
  }
}

function writePair(pair: { from: string; to: string }): void {
  try {
    localStorage.setItem(PAIR_STORAGE, `${pair.from}>${pair.to}`)
  } catch {
    // Private mode: the pair just isn't remembered.
  }
}

function Converter({ settings }: { settings: Settings }) {
  const [pair, setPair] = useState(readPair)
  const [amount, setAmount] = useState('1')
  const codes = [
    ...new Set([settings.baseCurrency, ...Object.keys(settings.rates), pair.from, pair.to]),
  ]
  const rate = crossRate(settings, pair.from, pair.to)
  const value = Number(amount)
  const validAmount = amount.trim() !== '' && Number.isFinite(value) && value >= 0
  const missing = [pair.from, pair.to].filter(
    (code) => rateFor(settings.rates, settings.baseCurrency, code) === null,
  )

  const choose = (next: { from: string; to: string }) => {
    setPair(next)
    writePair(next)
  }

  return (
    <section className="form-section converter" aria-labelledby="converter-heading">
      <h2 id="converter-heading">Convert</h2>
      <TextField
        id="convert-amount"
        label={`Amount in ${pair.from}`}
        inputMode="decimal"
        mono
        value={amount}
        onChange={setAmount}
        error={amount.trim() !== '' && !validAmount ? 'Enter 0 or a positive number.' : undefined}
      />
      <div className="converter__pair">
        <SelectField
          id="convert-from"
          label="From"
          value={pair.from}
          onChange={(from) => choose({ ...pair, from })}
          options={codes.map((code) => ({ value: code, label: code }))}
        />
        <button
          type="button"
          className="btn btn--ghost converter__swap"
          aria-label={`Swap to convert ${pair.to} to ${pair.from}`}
          onClick={() => choose({ from: pair.to, to: pair.from })}
        >
          ⇄
        </button>
        <SelectField
          id="convert-to"
          label="To"
          value={pair.to}
          onChange={(to) => choose({ ...pair, to })}
          options={codes.map((code) => ({ value: code, label: code }))}
        />
      </div>
      {rate === null ? (
        <p className="no-rate" role="status">
          No rate for {missing.join(' and ')} yet. Add it below or press Fetch live rates.
        </p>
      ) : (
        <div className="converter__result" role="status" data-testid="convert-result">
          <output htmlFor="convert-amount convert-from convert-to" className="converter__value mono">
            {validAmount ? formatMoney(value * rate, pair.to) : '—'}
          </output>
          <p className="converter__rates mono">
            1 {pair.from} = {Number(rate.toPrecision(6))} {pair.to} · 1 {pair.to} ={' '}
            {Number((1 / rate).toPrecision(6))} {pair.from}
          </p>
        </div>
      )}
      <p className="field__hint">Uses your saved rates, so it works offline.</p>
    </section>
  )
}

function RatesForm({ initial }: { initial: Settings }) {
  const [base, setBase] = useState(initial.baseCurrency)
  const [rows, setRows] = useState<RateRow[]>(() => toRows(initial.rates))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  const originalRows = useRef<RateRow[]>(toRows(initial.rates))
  const { error: saveError, run } = useMutation()
  const [fxKey, setFxKey] = useState(() => readFxStorage().key)
  const [fxStatus, setFxStatus] = useState('')
  const [fetching, setFetching] = useState(false)
  const baseRef = useRef(initial.baseCurrency)

  // Auto-refresh: once a day per base, when a key is set and the device is online. Saves
  // straight away. The timestamp is claimed before the request so StrictMode, a second tab
  // or a bad key cannot burn the free plan's quota; the manual button retries a failure.
  useEffect(() => {
    const savedBase = initial.baseCurrency
    const { key } = readFxStorage()
    if (!key || !navigator.onLine || !fxIsStale(savedBase)) return
    writeFxStorage({ fetched: { base: savedBase, at: Date.now() } })
    fetchLiveRates(key, savedBase)
      .then(async ({ rates: live, asOf }) => {
        const current = await getSettings()
        if (current.baseCurrency !== savedBase) return
        const merged = mergeLiveRates(current.rates, live, savedBase)
        await updateSettings({ rates: merged })
        const before = originalRows.current
        originalRows.current = toRows(merged)
        // Rows the user has started editing are left alone; their Save wins.
        if (baseRef.current === savedBase) {
          setRows((prev) => (sameRows(prev, before) ? mergeRows(prev, live, savedBase) : prev))
        }
        setFxStatus(`Saved rates updated from openexchangerates.org (${asOfText(asOf)}).`)
      })
      .catch((error: unknown) => {
        setFxStatus(error instanceof Error ? error.message : 'Rates fetch failed.')
      })
  }, [initial.baseCurrency])

  const changeFxKey = (value: string) => {
    setFxKey(value)
    writeFxStorage({ key: value.trim() })
  }

  const fetchRates = () => {
    const code = normalizeCurrencyCode(base)
    if (!code) {
      setErrors((prev) => ({ ...prev, base: 'Enter a 3-letter base currency.' }))
      return
    }
    setFetching(true)
    setFxStatus('')
    fetchLiveRates(fxKey.trim(), code)
      .then(({ rates: live, asOf }) => {
        if (baseRef.current !== code) {
          setFxStatus('The base currency changed while fetching. Press Fetch live rates again.')
          return
        }
        writeFxStorage({ fetched: { base: code, at: Date.now() } })
        setRows((prev) => mergeRows(prev, live, code))
        setFxStatus(
          `Live rates filled in from openexchangerates.org (${asOfText(asOf)}). Edit any value, then press Save rates.`,
        )
      })
      .catch((error: unknown) => {
        setFxStatus(error instanceof Error ? error.message : 'Rates fetch failed.')
      })
      .finally(() => setFetching(false))
  }

  const changeBase = (value: string) => {
    const code = value
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 3)
    if (code === base) return
    setBase(code)
    baseRef.current = code
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
    <form className="form-section" onSubmit={save} noValidate aria-labelledby="rates-list-heading">
      <h2 id="rates-list-heading">Your rates</h2>
      <TextField
        id="base-currency"
        label="Base currency"
        hint="The currency you budget in, for example OMR. Prices across the app convert to it."
        list="rates-currency-codes"
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
              list="rates-currency-codes"
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
      <h2>Live rates</h2>
      <TextField
        id="fx-key"
        label="Rates API key"
        hint="Free App ID from openexchangerates.org. Kept on this device only and never exported. With a key, rates refresh once a day when you open Rates online; clear it to keep only hand-entered rates."
        autoComplete="off"
        mono
        value={fxKey}
        onChange={changeFxKey}
      />
      <button
        type="button"
        className="btn btn--ghost"
        onClick={fetchRates}
        disabled={!fxKey.trim() || fetching}
      >
        {fetching ? 'Fetching rates…' : 'Fetch live rates'}
      </button>
      {fxStatus ? (
        <p className="field__hint" role="status">
          {fxStatus}
        </p>
      ) : null}
      <div className="form-foot">
        <button type="submit" className="btn btn--primary">
          Save rates
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
      <datalist id="rates-currency-codes">
        {COMMON_CURRENCIES.map((code) => (
          <option key={code} value={code} />
        ))}
      </datalist>
    </form>
  )
}

export function RatesScreen() {
  const settings = useLiveQuery(() => getSettings(), [])
  if (!settings) {
    return (
      <p className="form-summary" role="status">
        Loading rates…
      </p>
    )
  }
  return (
    <section className="settings" aria-labelledby="rates-heading">
      <h1 id="rates-heading">Exchange rates</h1>
      <Converter settings={settings} />
      <RatesForm initial={settings} />
    </section>
  )
}
