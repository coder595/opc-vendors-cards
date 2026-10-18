import type { ReactNode } from 'react'

interface LoadingSpinnerProps {
  label?: string
  children?: ReactNode
}

/**
 * Branded loading state: the OPC seal marking time. Replaces bare-text loaders.
 * When used as a wrapper (children passed), the children replace the default message.
 */
export function LoadingSpinner({ label = 'Loading…', children }: LoadingSpinnerProps) {
  return (
    <p className="loading-spinner" role="status" aria-live="polite">
      <svg className="loading-spinner__seal" viewBox="0 0 96 96" fill="none" aria-hidden="true">
        <circle
          cx="48"
          cy="48"
          r="44"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeDasharray="6 5"
        />
        <circle cx="48" cy="48" r="34" stroke="currentColor" strokeWidth="1.5" opacity="0.45" />
        <path d="M48 30v36M30 48h36" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </svg>
      <span className="loading-spinner__label">{children ?? label}</span>
    </p>
  )
}
