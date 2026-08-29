import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type JSX, type ReactNode
} from 'react'
import type {
  AppSettings, Host, PortForward, Runbook, RunbookEvent, SSHKey, SessionInfo, Snippet, TransferProgress
} from '../../shared/types'
import { DEFAULT_SETTINGS } from '../../shared/types'

export type View = 'hosts' | 'keys' | 'snippets' | 'forwards' | 'runbooks' | 'audit' | 'settings'

// ---- runbook run tracking ----
export interface RunHostState {
  hostId: string
  status: 'pending' | 'running' | 'ok' | 'failed'
  exitCode?: number
  error?: string
  output: string
}
export interface RunStepState {
  stepId: string
  name: string
  status: 'pending' | 'running' | 'ok' | 'failed' | 'skipped'
  hosts: RunHostState[]
}
export interface RunState {
  runId: string
  runbookName: string
  status: 'running' | 'ok' | 'failed' | 'cancelled'
  steps: RunStepState[]
  startedAt: number
}

const MAX_HOST_OUTPUT = 200_000

export interface TermPane {
  paneId: string
  sessionId?: string
  status: SessionInfo['status']
}

export interface Tab {
  id: string
  kind: 'terminal' | 'sftp' | 'runbook'
  hostId: string
  title: string
  sftpId?: string
  /** sftp connection status; terminal tabs aggregate their panes */
  status: SessionInfo['status']
  /** terminal tabs: columns of stacked panes */
  columns?: TermPane[][]
  /** runbook tabs */
  runId?: string
}

export interface Toast {
  id: number
  kind: 'info' | 'error' | 'warn'
  text: string
}

export function tabStatus(tab: Tab): SessionInfo['status'] {
  if (tab.kind === 'runbook') return tab.status
  if (tab.kind !== 'terminal' || !tab.columns) return tab.status
  const panes = tab.columns.flat()
  if (panes.some((p) => p.status === 'connected')) return 'connected'
  if (panes.some((p) => p.status === 'connecting')) return 'connecting'
  if (panes.some((p) => p.status === 'error')) return 'error'
  return 'disconnected'
}

interface AppState {
  view: View
  setView(v: View): void
  hosts: Host[]
  keys: SSHKey[]
  snippets: Snippet[]
  forwards: PortForward[]
  runbooks: Runbook[]
  runs: Record<string, RunState>
  refreshRunbooks(): Promise<void>
  runRunbook(rb: Runbook): Promise<void>
  cancelRun(runId: string): void
  activeForwards: string[]
  settings: AppSettings
  tabs: Tab[]
  activeTabId: string | null
  setActiveTabId(id: string): void
  aiOpen: boolean
  setAiOpen(open: boolean | ((v: boolean) => boolean)): void
  transfers: TransferProgress[]
  toasts: Toast[]
  toast(text: string, kind?: Toast['kind']): void
  refreshHosts(): Promise<void>
  refreshKeys(): Promise<void>
  refreshSnippets(): Promise<void>
  refreshForwards(): Promise<void>
  saveSettings(s: AppSettings): Promise<void>
  openTerminal(host: Host): void
  duplicateTerminal(tabId: string): void
  broadcastTabs: Set<string>
  toggleBroadcast(tabId: string): void
  broadcastTerminalInput(tabId: string, sourcePaneId: string, data: string): void
  openSftp(host: Host): void
  closeTab(id: string): void
  updateTab(id: string, patch: Partial<Tab>): void
  /** pane management */
  updatePane(tabId: string, paneId: string, patch: Partial<TermPane>): void
  splitPane(tabId: string, direction: 'right' | 'down'): void
  closePane(tabId: string, paneId: string): void
  activePaneId: Record<string, string>
  setActivePane(tabId: string, paneId: string): void
  /** session id of the focused pane in the active terminal tab */
  activeSessionId: string | undefined
  /** write into the focused terminal (used by snippets & AI) */
  sendToActiveTerminal(text: string): void
  activeTab: Tab | null
}

const Ctx = createContext<AppState | null>(null)

let toastSeq = 0
let tabSeq = 0
let paneSeq = 0

const MAX_PANES = 8
const MAX_COLS = 4
const MAX_ROWS = 4
const WORKSPACE_KEY = 'termite.workspace.v1'

interface SavedWorkspaceTab {
  hostId: string
  title: string
  columns: number[]
}

function newPane(): TermPane {
  return { paneId: `pane-${++paneSeq}`, status: 'connecting' }
}

export function AppStateProvider({ children }: { children: ReactNode }): JSX.Element {
  const [view, setView] = useState<View>('hosts')
  const [hosts, setHosts] = useState<Host[]>([])
  const [keys, setKeys] = useState<SSHKey[]>([])
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [forwards, setForwards] = useState<PortForward[]>([])
  const [runbooks, setRunbooks] = useState<Runbook[]>([])
  const [runs, setRuns] = useState<Record<string, RunState>>({})
  const [activeForwards, setActiveForwards] = useState<string[]>([])
  const [settings, setSettings] = useState<AppSettings>({ ...DEFAULT_SETTINGS })
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [activePaneId, setActivePaneId] = useState<Record<string, string>>({})
  const [aiOpen, setAiOpen] = useState(false)
  const [transfers, setTransfers] = useState<TransferProgress[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const [broadcastTabs, setBroadcastTabs] = useState<Set<string>>(new Set())
  const broadcastTabsRef = useRef<Set<string>>(new Set())
  broadcastTabsRef.current = broadcastTabs
  const tabsRef = useRef<Tab[]>([])
  const workspaceRestoredRef = useRef(false)
  tabsRef.current = tabs
  const activeTabIdRef = useRef<string | null>(null)
  activeTabIdRef.current = activeTabId
  const activePaneIdRef = useRef<Record<string, string>>({})
  activePaneIdRef.current = activePaneId

  const toast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = ++toastSeq
    setToasts((t) => [...t, { id, kind, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 8000 : 4000)
  }, [])

  const refreshHosts = useCallback(async () => setHosts(await window.termite.hosts.list()), [])
  const refreshKeys = useCallback(async () => setKeys(await window.termite.keys.list()), [])
  const refreshSnippets = useCallback(async () => setSnippets(await window.termite.snippets.list()), [])
  const refreshForwards = useCallback(async () => {
    const { saved, active } = await window.termite.forwards.list()
    setForwards(saved)
    setActiveForwards(active)
  }, [])
  const refreshRunbooks = useCallback(async () => setRunbooks(await window.termite.runbooks.list()), [])

  useEffect(() => {
    refreshHosts()
    refreshKeys()
    refreshSnippets()
    refreshForwards()
    refreshRunbooks()
    window.termite.settings.get().then(setSettings)
  }, [refreshHosts, refreshKeys, refreshSnippets, refreshForwards, refreshRunbooks])

  // Restore terminal topology only (never session IDs or terminal contents).
  // Each restored pane establishes a fresh SSH connection using the saved host.
  useEffect(() => {
    if (workspaceRestoredRef.current || hosts.length === 0) return
    workspaceRestoredRef.current = true
    try {
      const saved = JSON.parse(localStorage.getItem(WORKSPACE_KEY) ?? '[]') as SavedWorkspaceTab[]
      const restored: Tab[] = []
      const active: Record<string, string> = {}
      for (const item of saved.slice(0, 12)) {
        const host = hosts.find((candidate) => candidate.id === item.hostId)
        if (!host) continue
        const id = `tab-${++tabSeq}`
        const columns = (item.columns.length ? item.columns : [1]).slice(0, MAX_COLS).map((count) =>
          Array.from({ length: Math.max(1, Math.min(MAX_ROWS, count)) }, () => newPane())
        )
        restored.push({ id, kind: 'terminal', hostId: host.id, title: item.title || host.label, status: 'connecting', columns })
        active[id] = columns[0][0].paneId
      }
      if (restored.length) {
        setTabs(restored)
        setActivePaneId(active)
        setActiveTabId(restored[0].id)
        toast(`Restored ${restored.length} terminal workspace${restored.length === 1 ? '' : 's'}`)
      }
    } catch {
      localStorage.removeItem(WORKSPACE_KEY)
    }
  }, [hosts, toast])

  useEffect(() => {
    if (!workspaceRestoredRef.current) return
    const saved: SavedWorkspaceTab[] = tabs
      .filter((tab) => tab.kind === 'terminal' && tab.columns)
      .map((tab) => ({ hostId: tab.hostId, title: tab.title, columns: tab.columns!.map((column) => column.length) }))
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(saved))
  }, [tabs])

  // runbook execution events → run state + tab status
  useEffect(() => {
    return window.termite.runbooks.onEvent((ev: RunbookEvent) => {
      setRuns((prev) => {
        const run = prev[ev.runId]
        if (!run) return prev
        const next: RunState = { ...run, steps: run.steps.map((s) => ({ ...s, hosts: s.hosts.map((h) => ({ ...h })) })) }
        const step = next.steps.find((s) => s.stepId === ev.stepId)
        const host = step?.hosts.find((h) => h.hostId === ev.hostId)
        switch (ev.kind) {
          case 'step-start':
            if (step) step.status = 'running'
            break
          case 'host-start':
            if (host) host.status = 'running'
            break
          case 'data':
            if (host) {
              host.output = (host.output + (ev.data ?? '')).slice(-MAX_HOST_OUTPUT)
            }
            break
          case 'host-done':
            if (host) {
              host.status = ev.ok ? 'ok' : 'failed'
              host.exitCode = ev.exitCode
              host.error = ev.error
            }
            break
          case 'step-done':
            if (step) step.status = ev.ok ? 'ok' : 'failed'
            break
          case 'run-done':
            next.status = ev.cancelled ? 'cancelled' : ev.ok ? 'ok' : 'failed'
            for (const s of next.steps) if (s.status === 'pending') s.status = 'skipped'
            setTabs((t) =>
              t.map((tab) =>
                tab.runId === ev.runId
                  ? { ...tab, status: ev.ok && !ev.cancelled ? 'connected' : 'error' }
                  : tab
              )
            )
            break
        }
        return { ...prev, [ev.runId]: next }
      })
    })
  }, [])

  // session status updates → panes
  const closePaneRef = useRef<(tabId: string, paneId: string) => void>(() => undefined)
  useEffect(() => {
    return window.termite.ssh.onStatus((info) => {
      setTabs((t) =>
        t.map((tab) => {
          if (tab.kind !== 'terminal' || !tab.columns) return tab
          let changed = false
          const columns = tab.columns.map((col) =>
            col.map((p) => {
              if (p.sessionId === info.sessionId && p.status !== info.status) {
                changed = true
                return { ...p, status: info.status }
              }
              return p
            })
          )
          return changed ? { ...tab, columns } : tab
        })
      )
      // shell exited (user typed `exit`): collapse the pane if the tab is split,
      // so dead panes never linger. A lone pane keeps its scrollback visible.
      if (info.status === 'disconnected') {
        const tab = tabsRef.current.find(
          (x) => x.kind === 'terminal' && x.columns?.flat().some((p) => p.sessionId === info.sessionId)
        )
        const pane = tab?.columns?.flat().find((p) => p.sessionId === info.sessionId)
        if (tab && pane && (tab.columns?.flat().length ?? 0) > 1) {
          closePaneRef.current(tab.id, pane.paneId)
        }
      }
      if (info.status === 'error' && info.error) toast(`${info.hostLabel}: ${info.error}`, 'error')
    })
  }, [toast])

  // host key mismatch warnings
  useEffect(() => {
    return window.termite.ssh.onHostKeyMismatch((info) => {
      toast(
        `HOST KEY CHANGED for ${info.host}! Possible MITM attack. Connection refused. ` +
          `New fingerprint: ${info.fingerprint}. If this is expected, remove the host from known hosts in Settings.`,
        'error'
      )
    })
  }, [toast])

  // transfer progress
  useEffect(() => {
    return window.termite.sftp.onProgress((p) => {
      setTransfers((prev) => {
        const idx = prev.findIndex((x) => x.transferId === p.transferId)
        return idx >= 0 ? [...prev.slice(0, idx), p, ...prev.slice(idx + 1)] : [...prev, p]
      })
      if (p.done) {
        setTimeout(
          () => setTransfers((prev) => prev.filter((x) => x.transferId !== p.transferId)),
          2500
        )
      }
    })
  }, [])

  useEffect(() => {
    return window.termite.forwards.onClosed(() => refreshForwards())
  }, [refreshForwards])

  const saveSettings = useCallback(async (s: AppSettings) => {
    await window.termite.settings.save(s)
    setSettings(await window.termite.settings.get())
  }, [])

  const openTerminal = useCallback((host: Host) => {
    const id = `tab-${++tabSeq}`
    const pane = newPane()
    setTabs((t) => [
      ...t,
      { id, kind: 'terminal', hostId: host.id, title: host.label, status: 'connecting', columns: [[pane]] }
    ])
    setActivePaneId((m) => ({ ...m, [id]: pane.paneId }))
    setActiveTabId(id)
  }, [])

  const duplicateTerminal = useCallback((tabId: string) => {
    const source = tabsRef.current.find((t) => t.id === tabId)
    if (!source || source.kind !== 'terminal') return
    const host = hosts.find((h) => h.id === source.hostId)
    if (!host) {
      toast('The host for this session no longer exists', 'error')
      return
    }
    const id = `tab-${++tabSeq}`
    const pane = newPane()
    setTabs((current) => [
      ...current,
      {
        id,
        kind: 'terminal',
        hostId: host.id,
        title: `${source.title} copy`,
        status: 'connecting',
        columns: [[pane]]
      }
    ])
    setActivePaneId((current) => ({ ...current, [id]: pane.paneId }))
    setActiveTabId(id)
    toast(`Duplicated ${source.title}`)
  }, [hosts, toast])

  const toggleBroadcast = useCallback((tabId: string) => {
    setBroadcastTabs((current) => {
      const next = new Set(current)
      if (next.has(tabId)) {
        next.delete(tabId)
        toast('Synchronized input off')
      } else {
        const tab = tabsRef.current.find((candidate) => candidate.id === tabId)
        if (!tab || (tab.columns?.flat().length ?? 0) < 2) {
          toast('Split the terminal before enabling synchronized input', 'warn')
          return current
        }
        next.add(tabId)
        toast('Synchronized input on — typing goes to every pane', 'warn')
      }
      return next
    })
  }, [toast])

  const broadcastTerminalInput = useCallback((tabId: string, sourcePaneId: string, data: string) => {
    if (!broadcastTabsRef.current.has(tabId)) return
    const tab = tabsRef.current.find((candidate) => candidate.id === tabId)
    for (const pane of tab?.columns?.flat() ?? []) {
      if (pane.paneId !== sourcePaneId && pane.sessionId && pane.status === 'connected') {
        window.termite.ssh.write(pane.sessionId, data)
      }
    }
  }, [])

  const runRunbook = useCallback(async (rb: Runbook) => {
    const runId = await window.termite.runbooks.run(rb.id)
    const runState: RunState = {
      runId,
      runbookName: rb.name,
      status: 'running',
      startedAt: Date.now(),
      steps: rb.steps.map((s) => ({
        stepId: s.id,
        name: s.name,
        status: 'pending',
        hosts: s.hostIds.map((hostId) => ({ hostId, status: 'pending', output: '' }))
      }))
    }
    setRuns((prev) => ({ ...prev, [runId]: runState }))
    const id = `tab-${++tabSeq}`
    setTabs((t) => [
      ...t,
      { id, kind: 'runbook', hostId: '', title: `▶ ${rb.name}`, status: 'connecting', runId }
    ])
    setActiveTabId(id)
  }, [])

  const cancelRun = useCallback((runId: string) => {
    window.termite.runbooks.cancel(runId)
  }, [])

  const openSftp = useCallback((host: Host) => {
    const id = `tab-${++tabSeq}`
    setTabs((t) => [...t, { id, kind: 'sftp', hostId: host.id, title: `${host.label} — files`, status: 'connecting' }])
    setActiveTabId(id)
  }, [])

  const closeTab = useCallback((id: string) => {
    const tab = tabsRef.current.find((t) => t.id === id)
    if (tab?.columns) {
      for (const p of tab.columns.flat()) {
        if (p.sessionId) window.termite.ssh.disconnect(p.sessionId)
      }
    }
    if (tab?.sftpId) window.termite.sftp.close(tab.sftpId)
    setActivePaneId((m) => {
      const next = { ...m }
      delete next[id]
      return next
    })
    setTabs((t) => {
      const next = t.filter((x) => x.id !== id)
      setActiveTabId((current) => {
        if (current !== id) return current
        return next.length ? next[next.length - 1].id : null
      })
      return next
    })
    setBroadcastTabs((current) => {
      if (!current.has(id)) return current
      const next = new Set(current)
      next.delete(id)
      return next
    })
  }, [])

  const updateTab = useCallback((id: string, patch: Partial<Tab>) => {
    setTabs((t) => t.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab)))
  }, [])

  const updatePane = useCallback((tabId: string, paneId: string, patch: Partial<TermPane>) => {
    setTabs((t) =>
      t.map((tab) => {
        if (tab.id !== tabId || !tab.columns) return tab
        return {
          ...tab,
          columns: tab.columns.map((col) => col.map((p) => (p.paneId === paneId ? { ...p, ...patch } : p)))
        }
      })
    )
  }, [])

  const setActivePane = useCallback((tabId: string, paneId: string) => {
    setActivePaneId((m) => (m[tabId] === paneId ? m : { ...m, [tabId]: paneId }))
  }, [])

  const splitPane = useCallback(
    (tabId: string, direction: 'right' | 'down') => {
      const tab = tabsRef.current.find((t) => t.id === tabId)
      if (!tab || tab.kind !== 'terminal' || !tab.columns) return
      const total = tab.columns.flat().length
      if (total >= MAX_PANES) {
        toast(`Maximum of ${MAX_PANES} panes per tab`, 'warn')
        return
      }
      const currentPaneId = activePaneIdRef.current[tabId] ?? tab.columns[0][0]?.paneId
      let colIdx = tab.columns.findIndex((col) => col.some((p) => p.paneId === currentPaneId))
      if (colIdx < 0) colIdx = 0
      const pane = newPane()

      if (direction === 'right') {
        if (tab.columns.length >= MAX_COLS) {
          toast(`Maximum of ${MAX_COLS} columns`, 'warn')
          return
        }
        const columns = [...tab.columns]
        columns.splice(colIdx + 1, 0, [pane])
        updateTab(tabId, { columns })
      } else {
        if (tab.columns[colIdx].length >= MAX_ROWS) {
          toast(`Maximum of ${MAX_ROWS} rows per column`, 'warn')
          return
        }
        const rowIdx = tab.columns[colIdx].findIndex((p) => p.paneId === currentPaneId)
        const columns = tab.columns.map((col, i) => {
          if (i !== colIdx) return col
          const next = [...col]
          next.splice(rowIdx + 1, 0, pane)
          return next
        })
        updateTab(tabId, { columns })
      }
      setActivePane(tabId, pane.paneId)
    },
    [toast, updateTab, setActivePane]
  )

  const closePane = useCallback(
    (tabId: string, paneId: string) => {
      const tab = tabsRef.current.find((t) => t.id === tabId)
      if (!tab || !tab.columns) return
      const pane = tab.columns.flat().find((p) => p.paneId === paneId)
      if (tab.columns.flat().length <= 1) {
        closeTab(tabId)
        return
      }
      if (pane?.sessionId) window.termite.ssh.disconnect(pane.sessionId)
      const columns = tab.columns.map((col) => col.filter((p) => p.paneId !== paneId)).filter((col) => col.length > 0)
      updateTab(tabId, { columns })
      if (columns.flat().length < 2 && broadcastTabsRef.current.has(tabId)) {
        setBroadcastTabs((current) => {
          const next = new Set(current)
          next.delete(tabId)
          return next
        })
        toast('Synchronized input off')
      }
      if (activePaneIdRef.current[tabId] === paneId) {
        const first = columns[0]?.[0]
        if (first) setActivePane(tabId, first.paneId)
      }
    },
    [closeTab, updateTab, setActivePane, toast]
  )

  closePaneRef.current = closePane

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId) ?? null, [tabs, activeTabId])

  const activeSessionId = useMemo(() => {
    if (!activeTab || activeTab.kind !== 'terminal' || !activeTab.columns) return undefined
    const paneId = activePaneId[activeTab.id]
    const pane = activeTab.columns.flat().find((p) => p.paneId === paneId) ?? activeTab.columns.flat()[0]
    return pane?.status === 'connected' ? pane.sessionId : pane?.sessionId
  }, [activeTab, activePaneId])

  const sendToActiveTerminal = useCallback(
    (text: string) => {
      if (activeSessionId) window.termite.ssh.write(activeSessionId, text)
    },
    [activeSessionId]
  )

  const value: AppState = {
    view, setView,
    hosts, keys, snippets, forwards, activeForwards, settings,
    runbooks, runs, refreshRunbooks, runRunbook, cancelRun,
    tabs, activeTabId, setActiveTabId,
    aiOpen, setAiOpen,
    transfers, toasts, toast,
    refreshHosts, refreshKeys, refreshSnippets, refreshForwards,
    saveSettings,
    openTerminal, duplicateTerminal, broadcastTabs, toggleBroadcast, broadcastTerminalInput,
    openSftp, closeTab, updateTab,
    updatePane, splitPane, closePane, activePaneId, setActivePane,
    activeSessionId,
    sendToActiveTerminal,
    activeTab
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp(): AppState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp outside provider')
  return ctx
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function formatDate(ms: number): string {
  if (!ms) return ''
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
