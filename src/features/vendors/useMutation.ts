import { useState } from 'react'

/** Runs a mutation and surfaces a single inline error instead of swallowing it. */
export function useMutation(): {
  error: string
  run: (promise: Promise<unknown>) => Promise<void>
} {
  const [error, setError] = useState('')

  const run = async (promise: Promise<unknown>) => {
    setError('')
    try {
      await promise
    } catch {
      setError('Could not save. Try again.')
    }
  }

  return { error, run }
}
