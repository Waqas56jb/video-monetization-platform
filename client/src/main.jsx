import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import ErrorBoundary from './components/layout/ErrorBoundary.jsx'
import './styles/global.css'
import './styles/realdata.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
)

/**
 * Register the service worker in production only — in dev it would serve stale
 * bundles and make hot reload confusing.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')

      // Check for a newer worker on every visit, so a redeploy reaches testers
      // straight away instead of them sitting on a cached old build.
      reg.update().catch(() => {})

      // On the very first visit the worker claims the page, which also fires
      // `controllerchange` — reloading there would blank the screen for no
      // reason. Only reload when a worker REPLACES an existing one, i.e. a real
      // update. The flag additionally prevents a reload loop.
      const hadController = !!navigator.serviceWorker.controller
      let reloading = false
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || reloading) return
        reloading = true
        window.location.reload()
      })

      // A waiting worker means an update is ready — let it activate now.
      const activateWaiting = () => reg.waiting?.postMessage('SKIP_WAITING')
      if (reg.waiting) activateWaiting()
      reg.addEventListener('updatefound', () => {
        reg.installing?.addEventListener('statechange', function () {
          if (this.state === 'installed' && navigator.serviceWorker.controller) activateWaiting()
        })
      })
    } catch {
      /* offline support is a progressive enhancement; never block the app */
    }
  })
}
