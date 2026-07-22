import { useEffect, useRef, type JSX } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'
import { useApp, type Tab, type TermPane } from '../state'
import { getTerminalTheme } from '../themes'
import { IconX } from '../icons'

/** #rrggbb → rgba(...) with alpha, for glass mode */
function withAlpha(hex: string | undefined, alpha: number): string {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return hex ?? '#0d1117'
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function isGlass(): boolean {
  return document.documentElement.dataset.glass === 'true'
}

function themedBackground(themeId: string): { theme: ReturnType<typeof getTerminalTheme>['theme']; bg: string } {
  const base = getTerminalTheme(themeId).theme
  if (!isGlass()) return { theme: base, bg: base.background ?? '#0d1117' }
  const bg = withAlpha(base.background, 0.92)
  return { theme: { ...base, background: bg }, bg }
}

interface Props {
  tab: Tab
  pane: TermPane
  visible: boolean
  active: boolean
  showActiveRing: boolean
}

/** One terminal pane — owns its own SSH session to the tab's host. */
export default function TerminalPane({ tab, pane, visible, active, showActiveRing }: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const startedRef = useRef(false)
  const { settings, updatePane, setActivePane, closePane, toast } = useApp()

  // create terminal + connect once
  useEffect(() => {
    if (startedRef.current || !containerRef.current) return
    startedRef.current = true

    const term = new Terminal({
      fontFamily: settings.fontFamily,
      fontSize: settings.fontSize,
      cursorStyle: settings.cursorStyle,
      cursorBlink: settings.cursorBlink,
      scrollback: settings.scrollback,
      theme: themedBackground(settings.terminalTheme).theme,
      allowTransparency: true,
      allowProposedApi: true
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    term.loadAddon(new SearchAddon())
    term.open(containerRef.current)
    fit.fit()
    termRef.current = term
    fitRef.current = fit

    term.writeln(`\x1b[38;5;36m● Termite\x1b[0m connecting to \x1b[1m${tab.title}\x1b[0m ...`)

    let unsubData: (() => void) | null = null
    let disposed = false

    window.termite.ssh
      .connect(tab.hostId, term.cols, term.rows)
      .then((sessionId) => {
        if (disposed) {
          window.termite.ssh.disconnect(sessionId)
          return
        }
        updatePane(tab.id, pane.paneId, { sessionId, status: 'connected' })
        unsubData = window.termite.ssh.onData(sessionId, (data) => term.write(data))
        term.onData((data) => window.termite.ssh.write(sessionId, data))
        term.onResize(({ cols, rows }) => window.termite.ssh.resize(sessionId, cols, rows))
        term.focus()
      })
      .catch((err) => {
        const msg = err?.message?.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') ?? String(err)
        term.writeln(`\r\n\x1b[31m✗ Connection failed:\x1b[0m ${msg}`)
        updatePane(tab.id, pane.paneId, { status: 'error' })
        toast(`Connection to ${tab.title} failed: ${msg}`, 'error')
      })

    // mark pane active + refocus the terminal whenever it's clicked.
    // (Without the explicit focus() call, clicking back into an already-active
    // pane after using a toolbar button left keyboard focus on that button —
    // making Space "click" the button instead of typing into the terminal.)
    const el = containerRef.current
    const onFocusIn = (): void => setActivePane(tab.id, pane.paneId)
    const onMouseDown = (): void => {
      setActivePane(tab.id, pane.paneId)
      // defer so xterm's own mousedown (selection) runs first
      setTimeout(() => termRef.current?.focus(), 0)
    }
    el.addEventListener('focusin', onFocusIn)
    el.addEventListener('mousedown', onMouseDown)

    const onContextMenu = async (e: MouseEvent): Promise<void> => {
      e.preventDefault()
      const sel = term.getSelection()
      if (sel) {
        await navigator.clipboard.writeText(sel)
        term.clearSelection()
      } else {
        const text = await navigator.clipboard.readText()
        if (text) term.paste(text)
      }
    }
    el.addEventListener('contextmenu', onContextMenu)

    return () => {
      disposed = true
      el.removeEventListener('contextmenu', onContextMenu)
      el.removeEventListener('focusin', onFocusIn)
      el.removeEventListener('mousedown', onMouseDown)
      unsubData?.()
      term.dispose()
      termRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // refit when visible / resized (split layout changes trigger the observer)
  useEffect(() => {
    if (!visible) return
    const doFit = (): void => {
      try {
        fitRef.current?.fit()
      } catch {
        /* container may be zero-sized mid-transition */
      }
    }
    doFit()
    if (active) termRef.current?.focus()
    window.addEventListener('resize', doFit)
    const observer = new ResizeObserver(doFit)
    if (containerRef.current) observer.observe(containerRef.current)
    return () => {
      window.removeEventListener('resize', doFit)
      observer.disconnect()
    }
  }, [visible, active])

  // live-apply font + theme settings
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.fontSize = settings.fontSize
    term.options.fontFamily = settings.fontFamily
    term.options.cursorStyle = settings.cursorStyle
    term.options.cursorBlink = settings.cursorBlink
    term.options.theme = themedBackground(settings.terminalTheme).theme
    fitRef.current?.fit()
  }, [settings.fontSize, settings.fontFamily, settings.cursorStyle, settings.cursorBlink, settings.terminalTheme, settings.windowEffect])

  const termBg = themedBackground(settings.terminalTheme).bg
  return (
    <div
      className={`terminal-container term-pane ${active && showActiveRing ? 'active' : ''}`}
      style={{ ['--term-bg' as string]: termBg }}
      ref={containerRef}
    >
      {showActiveRing && (
        <button
          className="pane-close"
          title="Close this pane"
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onClick={(e) => {
            e.stopPropagation()
            closePane(tab.id, pane.paneId)
          }}
        >
          <IconX size={12} />
        </button>
      )}
    </div>
  )
}
