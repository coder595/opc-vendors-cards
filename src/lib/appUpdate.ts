/**
 * Manual "Update app". Only the service worker's code cache is replaced; IndexedDB
 * (vendors, photos, drafts) and localStorage are never touched by an update.
 */
export type UpdateResult = 'latest' | 'updating' | 'offline' | 'unavailable'

function waitUntilInstalled(worker: ServiceWorker): Promise<void> {
  if (worker.state === 'installed' || worker.state === 'activated') return Promise.resolve()
  return new Promise((resolve, reject) => {
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' || worker.state === 'activated') resolve()
      else if (worker.state === 'redundant') reject(new Error('The new version failed to install.'))
    })
  })
}

export async function updateApp(
  container: ServiceWorkerContainer | undefined = navigator.serviceWorker,
  reload: () => void = () => window.location.reload(),
): Promise<UpdateResult> {
  const registration = await container?.getRegistration()
  if (!container || !registration) return 'unavailable'
  if (!navigator.onLine) return 'offline'

  await registration.update()
  const worker = registration.waiting ?? registration.installing
  if (!worker) return 'latest'

  await waitUntilInstalled(worker)
  // The new worker takes over, then the page reloads onto the new code.
  container.addEventListener('controllerchange', reload, { once: true })
  ;(registration.waiting ?? worker).postMessage({ type: 'SKIP_WAITING' })
  return 'updating'
}
