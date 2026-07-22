import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type JSX, type ReactNode
} from 'react'
import type {
  AppSettings, Host, PortForward, SSHKey, SessionInfo, Snippet, TransferProgress
} from '../../shared/types'
import { DEFAULT_SETTINGS } from '../../shared/types'

export type View = 'hosts' | 'keys' | 'snippets' | 'forwards' | 'settings'

export interface TermPane {
  paneId: string
  sessionId?: string
  status: SessionInfo['status']
}

export interface Tab {
  id: string
  kind: 'terminal' | 'sftp'
  hostId: string
  title: string
  sftpId?: string
  /** sftp connection status; terminal tabs aggregate their panes */
  status: SessionInfo['status']
  /** terminal tabs: columns of stacked panes */
  columns?: TermPane[][]
}

export interface Toast {
  id: number
  kind: 'info' | 'error' | 'warn'
  text: string
}

export function tabStatus(tab: Tab): SessionInfo['status'] {
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

function newPane(): TermPane {
  return { paneId: `pane-${++paneSeq}`, status: 'connecting' }
}

export function AppStateProvider({ children }: { children: ReactNode }): JSX.Element {
  const [view, setView] = useState<View>('hosts')
  const [hosts, setHosts] = useState<Host[]>([])
  const [keys, setKeys] = useState<SSHKey[]>([])
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [forwards, setForwards] = useState<PortForward[]>([])
  const [activeForwards, setActiveForwards] = useState<string[]>([])
  const [settings, setSettings] = useState<AppSettings>({ ...DEFAULT_SETTINGS })
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [activePaneId, setActivePaneId] = useState<Record<string, string>>({})
  const [aiOpen, setAiOpen] = useState(false)
  const [transfers, setTransfers] = useState<TransferProgress[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const tabsRef = useRef<Tab[]>([])
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

  useEffect(() => {
    refreshHosts()
    refreshKeys()
    refreshSnippets()
    refreshForwards()
    window.termite.settings.get().then(setSettings)
  }, [refreshHosts, refreshKeys, refreshSnippets, refreshForwards])

  // session status updates → panes
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
      if (activePaneIdRef.current[tabId] === paneId) {
        const first = columns[0]?.[0]
        if (first) setActivePane(tabId, first.paneId)
      }
    },
    [closeTab, updateTab, setActivePane]
  )

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
    tabs, activeTabId, setActiveTabId,
    aiOpen, setAiOpen,
    transfers, toasts, toast,
    refreshHosts, refreshKeys, refreshSnippets, refreshForwards,
    saveSettings,
    openTerminal, openSftp, closeTab, updateTab,
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
