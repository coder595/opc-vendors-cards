import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Last-resort UI guard. There is no telemetry: the error is logged locally only.
 * Data stays in IndexedDB, so a reload recovers it.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    // React may throw any value; normalize so the fallback can always render.
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled UI error', error, info.componentStack)
  }

  override render(): ReactNode {
    const { error } = this.state
    if (error === null) return this.props.children

    return (
      <section className="empty" aria-labelledby="error-title">
        <h1 id="error-title" className="empty__title">
          Something went wrong
        </h1>
        <p className="empty__body">
          The app hit an unexpected error. Your data is still saved on this device — reload to carry
          on, or export a backup first.
        </p>
        <div className="empty__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              window.location.hash = '#/share'
              window.location.reload()
            }}
          >
            Export a backup
          </button>
        </div>
        <p className="empty__note mono">{error.message}</p>
      </section>
    )
  }
}
