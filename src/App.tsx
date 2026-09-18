import { SettingsScreen } from './features/settings/SettingsScreen'
import { VendorDetail } from './features/vendors/VendorDetail'
import { VendorForm } from './features/vendors/VendorForm'
import { VendorList } from './features/vendors/VendorList'
import { useHashRoute, type Route } from './lib/useHashRoute'

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
    href: '#/me',
    name: 'me',
    label: 'Me',
    paths: ['M12 12a4 4 0 100-8 4 4 0 000 8z', 'M5 20a7 7 0 0114 0'],
  },
]

const PLACEHOLDERS: Record<string, string> = {
  people: 'People',
  trip: 'Trip',
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
  return route.name === 'vendorNew' || route.name === 'vendorDetail' || route.name === 'vendorEdit'
    ? 'vendors'
    : route.name
}

export default function App() {
  const route = useHashRoute()
  const active = activeNav(route)
  const onForm = route.name === 'vendorNew' || route.name === 'vendorEdit'

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="appbar">
        <div className="wordmark">
          OPC Vendors Cards
          <span className="wordmark__sub">Trade fair notebook</span>
        </div>
        {onForm ? null : (
          <a className="btn btn--primary" href="#/vendors/new">
            Add vendor
          </a>
        )}
      </header>
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
      <main id="main" className="main">
        {route.name === 'vendorNew' ? (
          <VendorForm key="new" mode="new" />
        ) : route.name === 'vendorEdit' ? (
          <VendorForm key={`${route.id}-edit`} mode="edit" vendorId={route.id} />
        ) : route.name === 'vendorDetail' ? (
          <VendorDetail key={route.id} vendorId={route.id} />
        ) : route.name === 'vendors' ? (
          <VendorList />
        ) : route.name === 'me' ? (
          <SettingsScreen />
        ) : (
          <section className="empty" aria-labelledby="placeholder-title">
            <h1 id="placeholder-title" className="empty__title">
              {PLACEHOLDERS[route.name] ?? 'Coming soon'}
            </h1>
            <p className="empty__body">This section arrives in a later phase.</p>
          </section>
        )}
      </main>
    </div>
  )
}
