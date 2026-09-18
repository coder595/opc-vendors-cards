import { useState } from 'react'
import { EmptyState } from './components/EmptyState'
import { useHashRoute } from './lib/useHashRoute'

type NavItem = {
  href: string
  label: string
  paths: string[]
}

const NAV: NavItem[] = [
  { href: '#/vendors', label: 'Vendors', paths: ['M4 6h16M4 12h16M4 18h10'] },
  {
    href: '#/people',
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
    label: 'Trip',
    paths: ['M12 21s-6-5.2-6-10a6 6 0 1112 0c0 4.8-6 10-6 10z', 'M12 11a2 2 0 100-4 2 2 0 000 4z'],
  },
  {
    href: '#/me',
    label: 'Me',
    paths: ['M12 12a4 4 0 100-8 4 4 0 000 8z', 'M5 20a7 7 0 0114 0'],
  },
]

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

const CAPTURE_PENDING = 'Vendor capture arrives in the next phase.'

export default function App() {
  const route = useHashRoute()
  const [notice, setNotice] = useState('')

  // Clear then re-set so repeated activations still announce (React bails on
  // an identical state value).
  const announceCapturePending = () => {
    setNotice('')
    queueMicrotask(() => setNotice(CAPTURE_PENDING))
  }

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
        <button type="button" className="btn btn--primary" onClick={announceCapturePending}>
          Add vendor
        </button>
      </header>
      <nav className="nav" aria-label="Primary">
        {NAV.map((item) => (
          <a
            key={item.href}
            className="nav__item"
            href={item.href}
            aria-current={route === item.href ? 'page' : undefined}
          >
            <NavIcon paths={item.paths} />
            {item.label}
          </a>
        ))}
      </nav>
      <main id="main" className="main">
        <EmptyState onAdd={announceCapturePending} />
        <p className="status-line" role="status" aria-live="polite">
          {notice}
        </p>
      </main>
    </div>
  )
}
