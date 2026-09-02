import { Component, type ErrorInfo, type JSX, type ReactNode } from 'react'

/**
 * A render throw anywhere in the tree unmounts the whole tree, leaving an empty
 * window. From the outside that is indistinguishable from the process dying —
 * it gets reported as "it crashed" — and nothing is written down, so there is
 * nothing to diagnose afterwards.
 *
 * This keeps the window populated, puts the stack somewhere it can be copied,
 * and forwards the error to the main process so it also lands in the log.
 */
export default class CrashBoundary extends Component<
  { children: ReactNode },
  { error: Error | null; stack: string }
> {
  state = { error: null as Error | null, stack: '' }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ stack: info.componentStack ?? '' })
    void window.termite?.reportError?.({
      message: error.message,
      stack: error.stack ?? '',
      componentStack: info.componentStack ?? '',
      source: 'render'
    })
  }

  private report(): string {
    const { error, stack } = this.state
    return [`${error?.name}: ${error?.message}`, error?.stack ?? '', stack].join('\n\n').trim()
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="crash">
        <div className="crash-card">
          <h1>Termite hit an error</h1>
          <p>
            The window stayed open so the details are not lost. Reloading keeps your hosts and
            settings — they live outside the window.
          </p>
          <pre className="crash-stack">{this.report()}</pre>
          <div className="crash-actions">
            <button className="btn primary" onClick={() => window.location.reload()}>
              Reload
            </button>
            <button className="btn" onClick={() => window.termite?.clipboard?.writeText(this.report())}>
              Copy details
            </button>
          </div>
        </div>
      </div>
    )
  }
}

/**
 * Errors outside React's reach — event handlers that escape, rejected promises,
 * async callbacks. These do not blank the window, so they are logged rather than
 * shown; a silent failure with no record is the thing worth avoiding.
 */
export function installGlobalErrorLogging(): void {
  window.addEventListener('error', (e) => {
    void window.termite?.reportError?.({
      message: e.message,
      stack: e.error?.stack ?? `${e.filename}:${e.lineno}:${e.colno}`,
      componentStack: '',
      source: 'window'
    })
  })
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason as { message?: string; stack?: string } | undefined
    void window.termite?.reportError?.({
      message: reason?.message ?? String(e.reason),
      stack: reason?.stack ?? '',
      componentStack: '',
      source: 'promise'
    })
  })
}
