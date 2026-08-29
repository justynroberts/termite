import { useEffect, useRef, useState, type JSX } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebglAddon } from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'
import { useApp, type Tab, type TermPane } from '../state'
import { getTerminalTheme } from '../themes'
import { IconCopy, IconExternalLink, IconPaste, IconSearch, IconX } from '../icons'

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

function startupInput(host: ReturnType<typeof useApp>['hosts'][number] | undefined): string {
  if (!host) return ''
  const pairs = (host.environment ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
  const windows = host.os === 'windows'
  const env = pairs.map((line) => {
    const at = line.indexOf('=')
    const key = line.slice(0, at).trim().replace(/[^A-Za-z0-9_]/g, '')
    const value = line.slice(at + 1)
    return windows ? `$env:${key}='${value.replace(/'/g, "''")}'` : `export ${key}='${value.replace(/'/g, "'\\''")}'`
  })
  const commands = [...env, host.startupCommand?.trim() ?? ''].filter(Boolean)
  return commands.length ? `${commands.join(windows ? '; ' : '\n')}\r` : ''
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
  const copyRef = useRef<() => void>(() => undefined)
  const pasteRef = useRef<(submit?: boolean) => void>(() => undefined)
  const searchRef = useRef<() => void>(() => undefined)
  const [selectionLength, setSelectionLength] = useState(0)
  const [authUrl, setAuthUrl] = useState('')
  const { settings, hosts, updatePane, setActivePane, closePane, broadcastTerminalInput, toast } = useApp()
  const settingsRef = useRef(settings)
  settingsRef.current = settings

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
      allowProposedApi: true,
      // draw Powerline glyphs (U+E0B0–E0B7 triangles/half-circles) and box-drawing
      // characters pixel-perfectly regardless of font — needs the WebGL renderer
      customGlyphs: true
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    // Custom link provider that sees URLs across wrapped rows — soft-wrapped OR
    // hard-wrapped (CLIs like `claude login` print long OAuth URLs with real
    // newlines). Contiguous full-width rows are treated as one paragraph, so the
    // whole multi-line URL underlines as a single link and opens joined.
    const URL_RE = /https?:\/\/[^\s"'`<>()[\]{}]+/g
    term.registerLinkProvider({
      provideLinks: (rowNum, cb) => {
        try {
          const buf = term.buffer.active
          const row0 = rowNum - 1
          let start = row0
          while (start > 0 && (buf.getLine(start - 1)?.translateToString(true).length ?? 0) === term.cols) {
            start--
          }
          let end = row0
          while (end < buf.length - 1 && (buf.getLine(end)?.translateToString(true).length ?? 0) === term.cols) {
            end++
          }
          let joined = ''
          const offsets: number[] = []
          for (let r = start; r <= end; r++) {
            offsets.push(joined.length)
            joined += buf.getLine(r)?.translateToString(true) ?? ''
          }
          const toCoord = (off: number): { x: number; y: number } => {
            let i = offsets.length - 1
            while (i > 0 && offsets[i] > off) i--
            return { x: off - offsets[i] + 1, y: start + i + 1 }
          }
          const links: {
            range: { start: { x: number; y: number }; end: { x: number; y: number } }
            text: string
            activate: (e: MouseEvent, text: string) => void
          }[] = []
          for (const m of joined.matchAll(URL_RE)) {
            const s = m.index ?? 0
            const sc = toCoord(s)
            const ec = toCoord(s + m[0].length - 1)
            if (rowNum < sc.y || rowNum > ec.y) continue
            links.push({
              range: { start: sc, end: ec },
              text: m[0],
              activate: (_e, text) => window.termite.openExternal(text)
            })
          }
          cb(links.length ? links : undefined)
        } catch {
          cb(undefined)
        }
      }
    })
    const search = new SearchAddon()
    term.loadAddon(search)
    term.open(containerRef.current)
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose()) // falls back to DOM renderer
      term.loadAddon(webgl)
    } catch {
      /* GPU unavailable — DOM renderer still works, minus drawn glyphs */
    }
    fit.fit()
    termRef.current = term
    fitRef.current = fit

    // --- clipboard: Windows Terminal semantics ---
    // Ctrl+C with a selection → copy (no SIGINT); without → SIGINT as normal.
    // Ctrl+V / Ctrl+Shift+V → paste. Ctrl+Shift+C → copy. Cmd variants on macOS.
    // TUI apps (ink spinners, htop, vim) redraw the rows under a selection several
    // times a second, which can invalidate the selection's text between mouse-up and
    // Ctrl+C. Stash the text the moment the selection is made so copy always has it.
    let stashedSelection = ''
    let stashedAt = 0
    const STASH_TTL = 15_000
    const effectiveSelection = (): string => {
      const live = term.getSelection()
      if (live.trim().length > 0) return live
      if (stashedSelection && Date.now() - stashedAt < STASH_TTL) return stashedSelection
      return ''
    }
    const copySelection = (): void => {
      try {
        const sel = effectiveSelection()
        // never clobber the clipboard with an empty/whitespace-only selection
        if (sel.trim().length > 0) {
          window.termite.clipboard.writeText(sel)
          // visible confirmation — also our diagnostic signal: copy without a
          // toast means the keystroke never reached the terminal at all
          toast(`Copied ${sel.length} characters`)
          setSelectionLength(0)
        }
        // consume the stash so a later Ctrl+C without a visible selection
        // sends SIGINT as expected instead of silently re-copying
        stashedSelection = ''
        // selection stays visible after copy (Windows Terminal behavior)
      } catch (err) {
        toast(`Copy failed: ${err instanceof Error ? err.message : err}`, 'error')
      }
    }
    const pasteClipboard = (submit = false): void => {
      try {
        const text = window.termite.clipboard.readText()
        if (!text) {
          toast('Clipboard is empty', 'warn')
          return
        }
        const lines = text.replace(/\r\n/g, '\n').split('\n')
        if (lines.length > 2 && !confirm(`Paste ${lines.length} lines into ${tab.title}?\n\nThe remote shell may execute them immediately.`)) {
          term.focus()
          return
        }
        term.paste(submit ? text.trim() : text)
        if (submit) term.input('\r')
        term.focus()
      } catch (err) {
        toast(`Paste failed: ${err instanceof Error ? err.message : err}`, 'error')
      }
    }
    copyRef.current = copySelection
    pasteRef.current = pasteClipboard
    searchRef.current = () => {
      const query = prompt('Find in terminal')
      if (query) {
        const found = search.findNext(query, { caseSensitive: false, incremental: false })
        if (!found) toast(`No terminal matches for “${query}”`, 'warn')
      }
      term.focus()
    }
    term.attachCustomKeyEventHandler((ev) => {
      if (ev.type !== 'keydown') return true
      const mod = ev.ctrlKey || ev.metaKey
      if (!mod) return true
      if (ev.code === 'KeyC' && (ev.shiftKey || effectiveSelection().length > 0)) {
        ev.preventDefault()
        copySelection()
        return false
      }
      if (ev.code === 'KeyV') {
        ev.preventDefault() // stop the native paste so it doesn't double up
        pasteClipboard()
        return false
      }
      if (ev.code === 'KeyF') {
        ev.preventDefault()
        searchRef.current()
        return false
      }
      return true
    })

    term.onSelectionChange(() => {
      const sel = term.getSelection()
      if (sel.trim().length > 0) {
        stashedSelection = sel
        stashedAt = Date.now()
        setSelectionLength(sel.length)
        if (settingsRef.current.copyOnSelect) window.termite.clipboard.writeText(sel)
      }
    })

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
        unsubData = window.termite.ssh.onData(sessionId, (data) => {
          term.write(data, () => {
            // Read rendered rows rather than raw chunks: xterm has already handled
            // cursor movement and TUI repainting, so this reconstructs exactly what
            // the user sees—including hard-wrapped OAuth URLs.
            const buf = term.buffer.active
            const first = Math.max(0, buf.length - 80)
            const paragraphs: string[] = []
            let paragraph = ''
            for (let row = first; row < buf.length; row++) {
              const line = buf.getLine(row)?.translateToString(true) ?? ''
              paragraph += line
              if (line.length < term.cols) {
                paragraphs.push(paragraph)
                paragraph = ''
              }
            }
            if (paragraph) paragraphs.push(paragraph)
            const urls = paragraphs.flatMap((text) => text.match(/https?:\/\/[^\s"'`<>]+/g) ?? [])
            const candidate = [...urls].reverse().find((url) => /oauth|authorize|login|device/i.test(url))
            if (candidate) setAuthUrl(candidate.replace(/[),.;]+$/, ''))
          })
        })
        void window.termite.ssh.subscribe(sessionId).then((initialOutput) => {
          if (initialOutput) term.write(initialOutput)
        })
        term.onData((data) => {
          window.termite.ssh.write(sessionId, data)
          broadcastTerminalInput(tab.id, pane.paneId, data)
        })
        term.onResize(({ cols, rows }) => window.termite.ssh.resize(sessionId, cols, rows))
        const startup = startupInput(hosts.find((host) => host.id === tab.hostId))
        if (startup) {
          window.termite.ssh.write(sessionId, startup)
          toast(`Startup command sent to ${tab.title}`)
        }
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

    // right-click: copy selection if there is one, otherwise paste
    const onContextMenu = (e: MouseEvent): void => {
      e.preventDefault()
      if (effectiveSelection().length > 0) copySelection()
      else pasteClipboard()
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
      copyRef.current = () => undefined
      pasteRef.current = () => undefined
      searchRef.current = () => undefined
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
      {active && (
        <div className="terminal-actions" onMouseDown={(e) => e.preventDefault()}>
          <button
            className="terminal-action"
            title={selectionLength ? `Copy ${selectionLength} selected characters` : 'Select terminal text to copy'}
            disabled={!selectionLength}
            onClick={() => copyRef.current()}
          >
            <IconCopy size={13} /> Copy
          </button>
          <button className="terminal-action" title="Paste from clipboard" onClick={() => pasteRef.current()}>
            <IconPaste size={13} /> Paste
          </button>
          <button className="terminal-action" title="Find in terminal (Ctrl+F)" onClick={() => searchRef.current()}>
            <IconSearch size={13} /> Find
          </button>
        </div>
      )}
      {active && authUrl && (
        <div className="auth-handoff">
          <div className="auth-handoff-copy">
            <strong>Authentication link detected</strong>
            <span>Open it in your browser, finish signing in, then paste the returned code here.</span>
          </div>
          <button
            className="btn primary"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => window.termite.openExternal(authUrl)}
          >
            <IconExternalLink size={14} /> Open browser
          </button>
          <button
            className="btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pasteRef.current(true)}
          >
            <IconPaste size={14} /> Paste &amp; submit
          </button>
          <button className="icon-btn" title="Dismiss" onClick={() => setAuthUrl('')}>
            <IconX size={13} />
          </button>
        </div>
      )}
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
