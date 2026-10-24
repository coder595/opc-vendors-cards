import { useEffect, useRef, useState } from 'react'

export type MutationStatus = 'idle' | 'busy' | 'done'

/** How long a button reads "Saved ✓" after a mutation succeeds. */
export const DONE_MS = 1500

/**
 * Runs a mutation and surfaces a single inline error instead of swallowing it. `status`
 * is `busy` while it runs and `done` for DONE_MS after it succeeds, for button labels.
 */
export function useMutation(): {
  error: string
  status: MutationStatus
  run: (promise: Promise<unknown>) => Promise<void>
} {
  const [error, setError] = useState('')
  const [status, setStatus] = useState<MutationStatus>('idle')
  const doneTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(doneTimer.current), [])

  const run = async (promise: Promise<unknown>) => {
    clearTimeout(doneTimer.current)
    setError('')
    setStatus('busy')
    try {
      await promise
      setStatus('done')
      doneTimer.current = setTimeout(() => setStatus('idle'), DONE_MS)
    } catch {
      setError('Could not save. Try again.')
      setStatus('idle')
    }
  }

  return { error, status, run }
}
