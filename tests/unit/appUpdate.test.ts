import { describe, expect, it, vi } from 'vitest'
import { updateApp } from '../../src/lib/appUpdate'

type Fake = { waiting: ServiceWorker | null; installing: ServiceWorker | null; update: () => Promise<void> }

function fakeWorker(state: ServiceWorkerState) {
  return { state, postMessage: vi.fn(), addEventListener: vi.fn() } as unknown as ServiceWorker & {
    postMessage: ReturnType<typeof vi.fn>
  }
}

function fakeContainer(registration: Fake | undefined) {
  return {
    getRegistration: vi.fn(async () => registration),
    addEventListener: vi.fn(),
  } as unknown as ServiceWorkerContainer & { addEventListener: ReturnType<typeof vi.fn> }
}

describe('updateApp', () => {
  it('reports the latest version when the check finds nothing new', async () => {
    const update = vi.fn(async () => {})
    const reload = vi.fn()
    const result = await updateApp(fakeContainer({ waiting: null, installing: null, update }), reload)
    expect(result).toBe('latest')
    expect(update).toHaveBeenCalledOnce()
    expect(reload).not.toHaveBeenCalled()
  })

  it('activates a waiting version and reloads once it takes control', async () => {
    const worker = fakeWorker('installed')
    const container = fakeContainer({ waiting: worker, installing: null, update: async () => {} })
    const reload = vi.fn()
    expect(await updateApp(container, reload)).toBe('updating')
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    expect(container.addEventListener).toHaveBeenCalledWith('controllerchange', reload, { once: true })
  })

  it('says unavailable without a service worker and offline without a network', async () => {
    expect(await updateApp(undefined)).toBe('unavailable')
    expect(await updateApp(fakeContainer(undefined))).toBe('unavailable')
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const update = vi.fn(async () => {})
    expect(await updateApp(fakeContainer({ waiting: null, installing: null, update }))).toBe('offline')
    expect(update).not.toHaveBeenCalled()
    online.mockRestore()
  })
})
