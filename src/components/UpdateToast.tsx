import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export function UpdateToast() {
  const [hash, setHash] = useState(window.location.hash)

  useEffect(() => {
    const handleHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const isOnFormRoute = hash.startsWith('#/vendors/new') || hash.includes('/edit')

  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onNeedRefresh() {},
    onOfflineReady() {},
  })

  if (!needRefresh || isOnFormRoute) return null

  return (
    <div className="update-toast" role="status" aria-live="polite">
      <span>Update ready — Reload</span>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => void updateServiceWorker(true)}
      >
        Reload
      </button>
    </div>
  )
}