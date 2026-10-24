import { useCallback, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ActionLabel } from '../../components/ActionLabel'
import { LoadingSpinner } from '../../components/LoadingSpinner'
import { SelectField, TextField } from '../../components/Field'
import { getSettings, updateSettings } from '../../data/settings'
import {
  deleteVendor as permanentDeleteVendor,
  getDeletedVendors,
  restoreVendor,
} from '../../data/vendors'
import type { LandedCostSettings, Settings, Theme } from '../../db/models'
import { setThemePreference } from '../../lib/theme'
import { APP_BUILT_AT } from '../../lib/app'
import { updateApp, type UpdateResult } from '../../lib/appUpdate'
import { haptic } from '../../lib/haptics'
import { useMutation } from '../vendors/useMutation'

const builtAtText = APP_BUILT_AT
  ? new Date(APP_BUILT_AT).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  : 'unknown'

const UPDATE_MESSAGES: Record<UpdateResult, string> = {
  latest: `You're already on the latest version (built ${builtAtText}).`,
  updating:
    'A new version was found. Updating now; the app will reload in a moment. Your vendors, photos and settings stay as they are.',
  offline: "You're offline. Connect to the internet, then press Update app again.",
  unavailable:
    "Updates aren't available here. Open the installed app, or reload this page in your browser.",
}

function AppUpdateSection() {
  const [busy, setBusy] = useState<'idle' | 'checking' | 'updating'>('idle')
  const [message, setMessage] = useState('')

  const check = () => {
    setBusy('checking')
    setMessage('')
    updateApp()
      .then((result) => {
        setMessage(UPDATE_MESSAGES[result])
        setBusy(result === 'updating' ? 'updating' : 'idle')
      })
      .catch(() => {
        setMessage("Couldn't check for updates. Check your connection and try again.")
        setBusy('idle')
      })
  }

  return (
    <section className="form-section" aria-labelledby="app-update-heading">
      <h2 id="app-update-heading">App version</h2>
      <p className="field__hint">
        This copy was built {builtAtText}. Updating replaces only the app itself; your vendors,
        photos and settings stay on this device.
      </p>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={check}
        disabled={busy !== 'idle'}
        aria-busy={busy !== 'idle'}
      >
        <ActionLabel
          show={busy}
          labels={{ idle: 'Update app', checking: 'Checking for updates…', updating: 'Updating…' }}
        />
      </button>
      {message ? (
        <p className="form-summary" role="status">
          {message}
        </p>
      ) : null}
    </section>
  )
}

const numberText = (value?: number) => (value === undefined ? '' : String(value))

function SettingsForm({ initial }: { initial: Settings }) {
  const base = initial.baseCurrency
  const [theme, setTheme] = useState<Theme>(initial.theme)
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
  const { error: saveError, status: saveStatus, run } = useMutation()
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

  const save = (event: FormEvent) => {
    event.preventDefault()
    const nextErrors: Record<string, string> = {}
    // Landed cost is off while all three numbers are blank; a blank one counts as 0 otherwise.
    let landed: LandedCostSettings | undefined
    if ([freight, duty, vat].some((value) => value.trim() !== '')) {
      const numbers = { freight, duty, vat }
      const parsed: Record<string, number> = {}
      for (const [key, raw] of Object.entries(numbers)) {
        const value = raw.trim() === '' ? 0 : Number(raw)
        if (!Number.isFinite(value) || value < 0)
          nextErrors[`landed.${key}`] = 'Enter 0 or a positive number.'
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
    if (Object.keys(nextErrors).length > 0) return
    setNotice('')
    void run(
      updateSettings({
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
      <AppUpdateSection />
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
        <h2>Landed cost</h2>
        <p className="field__hint">
          Estimates the cost of one unit delivered home, in {base || 'the base currency'}. Leave all
          three blank to turn it off.
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
          <button
            type="submit"
            className="btn btn--primary"
            disabled={saveStatus === 'busy'}
            aria-busy={saveStatus === 'busy'}
          >
            <ActionLabel
              show={saveStatus}
              labels={{ idle: 'Save settings', busy: 'Saving…', done: 'Saved ✓' }}
            />
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
      <section className="form-section" aria-labelledby="rates-link-heading">
        <h2 id="rates-link-heading">Exchange rates</h2>
        <p className="field__hint">
          Base currency ({base}), saved rates, live rates and the converter are on the Rates tab.
        </p>
        <a className="btn btn--ghost" href="#/rates">
          Open exchange rates
        </a>
      </section>
      <section className="form-section" aria-labelledby="sharing-link-heading">
        <h2 id="sharing-link-heading">Sharing &amp; data</h2>
        <p className="field__hint">Export, import, CSV and single-vendor QR sharing.</p>
        <a className="btn btn--ghost" href="#/share">
          Open sharing &amp; data
        </a>
      </section>
    </section>
  )
}

function RecentlyDeletedSection() {
  const vendors = useLiveQuery(() => getDeletedVendors(), [])
  const { error, run } = useMutation()
  const confirmRef = useRef<HTMLDialogElement>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const handleRestore = useCallback(
    (id: string) => {
      void run(restoreVendor(id))
    },
    [run],
  )

  const askPermanentDelete = useCallback((id: string) => {
    setPendingId(id)
    confirmRef.current?.showModal()
  }, [])

  const confirmPermanentDelete = useCallback(() => {
    if (pendingId) {
      void run(
        permanentDeleteVendor(pendingId).then(() => {
          haptic('success')
          setPendingId(null)
        }),
      )
    }
  }, [pendingId, run])

  if (!vendors || vendors.length === 0) return null

  return (
    <section className="form-section" aria-labelledby="deleted-heading">
      <h2 id="deleted-heading">Recently deleted</h2>
      <p className="field__hint">These vendors will be permanently removed after 90 days.</p>
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}
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
                className="btn btn--danger"
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
          <h2 id="purge-vendor-title" className="dialog__title">
            Delete permanently?
          </h2>
          <p className="dialog__body">
            All data including contacts, products and photos will be removed. This cannot be undone.
          </p>
          <div className="dialog__actions">
            <button type="submit" className="btn btn--ghost">
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--danger-solid"
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
    return <LoadingSpinner>Loading settings…</LoadingSpinner>
  }
  return (
    <>
      <SettingsForm initial={settings} />
      <RecentlyDeletedSection />
    </>
  )
}
