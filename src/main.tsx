import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { initTheme } from './lib/theme'
import './styles/tokens.css'
import './styles/base.css'
import './styles/forms.css'
import './styles/print.css'

// Apply the mirrored theme before first paint (CSP forbids an inline script).
initTheme()

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('Root element #root not found in index.html')
}

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
