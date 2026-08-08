import { Component } from 'react'

/**
 * Last line of defence against a white screen.
 *
 * The client's hard requirement is that no screen ever traps the user with
 * nothing but a refresh. If a render throws anyway, they get a readable message
 * and two ways out instead of a blank page.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('MTONYO+ crashed:', error, info?.componentStack)
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
          <details className="crash-detail">
            <summary>Technical details</summary>
            <code>{String(this.state.error?.message || this.state.error)}</code>
          </details>
        </div>
      </div>
    )
  }
}
