import { Component } from 'react'

/**
 * Last line of defence against a white screen.
 *
 * The client's hard requirement is that no screen ever traps the user with
 * nothing but a refresh. If a render throws anyway, they get a readable message
 * and a way out instead of a blank page.
 *
 * The third button matters more than it looks. This app installs a service
 * worker, and a browser can hold on to an old one for a long time — a phone
 * with the tab left open for days, or one that has been offline. When it does,
 * it keeps serving a stale copy of the app against a backend that has moved on,
 * and the result is exactly this screen, over and over, for a person whose
 * "Try again" never helps because it reloads the same stale copy. Clearing the
 * worker and its caches is the fix, and nobody should have to know that.
 */

/** Throw away every cached copy of the app and the worker serving them. */
async function clearEverythingCached() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
  } catch {
    /* nothing to unregister, or the browser will not allow it */
  }

  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch {
    /* cache storage unavailable — the unregister above is the important half */
  }
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, clearing: false }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('MTONYO+ crashed:', error, info?.componentStack)
  }

  reset = async () => {
    this.setState({ clearing: true })
    await clearEverythingCached()
    // Bypass the back/forward cache so the next load is genuinely fresh.
    window.location.replace('/')
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="crash">
        <div className="crash-card">
          <div className="crash-mark">
            MTONYO<span className="logo-plus">+</span>
          </div>
          <h1>Something went wrong</h1>
          <p>
            Sorry — that screen failed to load. Nothing you&apos;ve bought is affected; your
            purchases stay in your library.
          </p>
          <div className="crash-actions">
            <button className="btn btn-gold" onClick={() => window.location.reload()}>
              Try again
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                window.location.href = '/'
              }}
            >
              Go to home
            </button>
          </div>

          <p className="crash-hint">
            Still happening?{' '}
            <button className="crash-link" onClick={this.reset} disabled={this.state.clearing}>
              {this.state.clearing ? 'Clearing…' : 'Clear this device and start fresh'}
            </button>
            <br />
            <small>
              This only clears what your browser has stored. Your account, purchases and library
              are on the server and are untouched.
            </small>
          </p>

          <details className="crash-detail">
            <summary>Technical details</summary>
            <code>{String(this.state.error?.message || this.state.error)}</code>
          </details>
        </div>
      </div>
    )
  }
}
