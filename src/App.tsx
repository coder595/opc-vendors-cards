import { lazy, Suspense, useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getSettings } from './data/settings'
import { LoadingSpinner } from './components/LoadingSpinner'
import { PeopleScreen } from './features/people/PeopleScreen'
import { ShareScreen } from './features/sharing/ShareScreen'
import { VendorDetail } from './features/vendors/VendorDetail'
import { VendorForm } from './features/vendors/VendorForm'
import { VendorList } from './features/vendors/VendorList'
import { QuickAddScreen } from './features/vendors/QuickAddScreen'
import { setThemePreference, watchSystemTheme } from './lib/theme'
import { useHashRoute, type Route } from './lib/useHashRoute'

const SettingsScreen = lazy(() =>
  import('./features/settings/SettingsScreen').then((m) => ({ default: m.SettingsScreen })),
)
const ImportCardScreen = lazy(() =>
  import('./features/sharing/ImportCardScreen').then((m) => ({ default: m.ImportCardScreen })),
)
const VendorShare = lazy(() =>
  import('./features/sharing/VendorShare').then((m) => ({ default: m.VendorShare })),
)
const RatesScreen = lazy(() =>
  import('./features/rates/RatesScreen').then((m) => ({ default: m.RatesScreen })),
)
const TripScreen = lazy(() =>
  import('./features/trip/TripScreen').then((m) => ({ default: m.TripScreen })),
)

type NavItem = {
  href: string
  name: string
  label: string
  paths: string[]
}

const NAV: NavItem[] = [
  { href: '#/vendors', name: 'vendors', label: 'Vendors', paths: ['M4 6h16M4 12h16M4 18h10'] },
  {
    href: '#/people',
    name: 'people',
    label: 'People',
    paths: [
      'M8 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7z',
      'M2 20a6 6 0 0112 0',
      'M16 4.5a3.5 3.5 0 010 7',
      'M17 14.2a6 6 0 015 5.8',
    ],
  },
  {
    href: '#/trip',
    name: 'trip',
    label: 'Trip',
    paths: ['M12 21s-6-5.2-6-10a6 6 0 1112 0c0 4.8-6 10-6 10z', 'M12 11a2 2 0 100-4 2 2 0 000 4z'],
  },
  {
    href: '#/rates',
    name: 'rates',
    label: 'Rates',
    paths: ['M4 12h16', 'M14 8l4 4-4 4', 'M10 16l-4-4 4-4'],
  },
  {
    href: '#/me',
    name: 'me',
    label: 'Me',
    paths: [
      'M12 15a3 3 0 100-6 3 3 0 000 6z',
      'M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z',
    ],
  },
]

const TITLES: Record<Route['name'], string> = {
  vendors: 'Vendors',
  vendorNew: 'New vendor',
  vendorsQuick: 'Quick add',
  vendorDetail: 'Vendor',
  vendorEdit: 'Edit vendor',
  vendorShare: 'Share vendor',
  share: 'Sharing & data',
  people: 'People',
  trip: 'Trip',
  rates: 'Exchange rates',
  me: 'Settings',
  import: 'Import vendor card',
}

function NavIcon({ paths }: { paths: string[] }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
function activeNav(route: Route): string {
  if (
    route.name === 'vendorNew' ||
    route.name === 'vendorsQuick' ||
    route.name === 'vendorDetail' ||
    route.name === 'vendorEdit' ||
    route.name === 'vendorShare'
  ) {
    return 'vendors'
  }
  return route.name === 'share' ? 'me' : route.name
}
export default function App() {
  const route = useHashRoute()
  const active = activeNav(route)
  const onForm =
    route.name === 'vendorNew' || route.name === 'vendorEdit' || route.name === 'vendorsQuick'
  const routeKey = route.name + ('id' in route ? `:${route.id}` : '')
  const mainRef = useRef<HTMLElement>(null)
  const firstRender = useRef(true)
  const settings = useLiveQuery(() => getSettings(), [])
  const theme = settings?.theme

  // Keep the persisted theme authoritative (also covers imported settings).
  useEffect(() => {
    if (theme) setThemePreference(theme)
  }, [theme])

  useEffect(() => watchSystemTheme(), [])

  useEffect(() => {
    document.title = `${TITLES[route.name]} · OPC Vendors Cards`
  }, [routeKey, route.name])

  // Move focus to the new screen for keyboard/screen-reader users.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    mainRef.current?.focus()
  }, [routeKey])

  return (
    <div className="app">
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault()
          mainRef.current?.focus()
        }}
      >
        Skip to content
      </a>
      <header className="appbar">
        <div className="wordmark">
          <span className="brand-mark" aria-hidden="true" />
          <div className="wordmark__text">
            OPC Vendors Cards
            <span className="wordmark__sub">Trade fair notebook</span>
          </div>
        </div>
        {onForm ? null : (
          <div className="form-head__actions">
            <a className="btn btn--ghost appbar__quick" href="#/vendors/quick">
              Quick add
            </a>
            <a className="btn btn--primary appbar__add" href="#/vendors/new">
              Add vendor
            </a>
          </div>
        )}
      </header>
      {onForm ? null : (
        // Phone thumb zone: the fair-speed capture action sits above the tab bar.
        <a className="btn btn--primary fab" href="#/vendors/quick">
          <svg
            className="btn__icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Quick add
        </a>
      )}
      <nav className="nav" aria-label="Primary">
        {NAV.map((item) => (
          <a
            key={item.href}
            className="nav__item"
            href={item.href}
            aria-current={active === item.name ? 'page' : undefined}
          >
            <NavIcon paths={item.paths} />
            {item.label}
          </a>
        ))}
      </nav>
      <main id="main" className="main" ref={mainRef} tabIndex={-1}>
        <Suspense fallback={<LoadingSpinner />}>
          {route.name === 'vendorNew' ? (
            <VendorForm key="new" mode="new" />
          ) : route.name === 'vendorsQuick' ? (
            <QuickAddScreen key="quick" />
          ) : route.name === 'vendorEdit' ? (
            <VendorForm key={`${route.id}-edit`} mode="edit" vendorId={route.id} />
          ) : route.name === 'vendorDetail' ? (
            <VendorDetail key={route.id} vendorId={route.id} />
          ) : route.name === 'vendorShare' ? (
            <VendorShare key={route.id} vendorId={route.id} />
          ) : route.name === 'import' ? (
            <ImportCardScreen />
          ) : route.name === 'share' ? (
            <ShareScreen />
          ) : route.name === 'vendors' ? (
            <VendorList />
          ) : route.name === 'people' ? (
            <PeopleScreen />
          ) : route.name === 'trip' ? (
            <TripScreen />
          ) : route.name === 'rates' ? (
            <RatesScreen />
          ) : route.name === 'me' ? (
            <SettingsScreen />
          ) : (
            <VendorList />
          )}
        </Suspense>
      </main>
    </div>
  )
}
