import { useEffect, useRef, type JSX } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'
import { useApp, type Tab } from '../state'
import { getTerminalTheme } from '../themes'

interface Props {
  tab: Tab
  visible: boolean
}

export default function TerminalView({ tab, visible }: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const startedRef = useRef(false)
  const { settings, updateTab, toast } = useApp()

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
      theme: getTerminalTheme(settings.terminalTheme).theme,
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
        updateTab(tab.id, { sessionId, status: 'connected' })
        unsubData = window.termite.ssh.onData(sessionId, (data) => term.write(data))
        term.onData((data) => window.termite.ssh.write(sessionId, data))
        term.onResize(({ cols, rows }) => window.termite.ssh.resize(sessionId, cols, rows))
        term.focus()
      })
      .catch((err) => {
        const msg = err?.message?.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') ?? String(err)
        term.writeln(`\r\n\x1b[31m✗ Connection failed:\x1b[0m ${msg}`)
        updateTab(tab.id, { status: 'error' })
        toast(`Connection to ${tab.title} failed: ${msg}`, 'error')
      })

    // copy on Ctrl+Shift+C / paste on Ctrl+Shift+V handled natively by Electron menu;
    // add right-click paste convenience
    const el = containerRef.current
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
      unsubData?.()
      term.dispose()
      termRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // refit when becoming visible or on window resize
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
    termRef.current?.focus()
    window.addEventListener('resize', doFit)
    const observer = new ResizeObserver(doFit)
    if (containerRef.current) observer.observe(containerRef.current)
    return () => {
      window.removeEventListener('resize', doFit)
      observer.disconnect()
    }
  }, [visible])

  // live-apply font + theme settings
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.fontSize = settings.fontSize
    term.options.fontFamily = settings.fontFamily
    term.options.cursorStyle = settings.cursorStyle
    term.options.cursorBlink = settings.cursorBlink
    term.options.theme = getTerminalTheme(settings.terminalTheme).theme
    fitRef.current?.fit()
  }, [settings.fontSize, settings.fontFamily, settings.cursorStyle, settings.cursorBlink, settings.terminalTheme])

  const termBg = getTerminalTheme(settings.terminalTheme).theme.background
  return (
    <div
      className="terminal-container"
      style={{ ['--term-bg' as string]: termBg }}
      ref={containerRef}
    />
  )
}
