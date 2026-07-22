import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type JSX, type ReactNode
} from 'react'
import type {
  AppSettings, Host, PortForward, SSHKey, SessionInfo, Snippet, TransferProgress
} from '../../shared/types'
import { DEFAULT_SETTINGS } from '../../shared/types'

export type View = 'hosts' | 'keys' | 'snippets' | 'forwards' | 'settings'

export interface Tab {
  id: string
  kind: 'terminal' | 'sftp'
  hostId: string
  title: string
  sessionId?: string
  sftpId?: string
  status: SessionInfo['status']
}

export interface Toast {
  id: number
  kind: 'info' | 'error' | 'warn'
  text: string
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
  /** write into the active terminal (used by snippets & AI) */
  sendToActiveTerminal(text: string): void
  activeTab: Tab | null
}

const Ctx = createContext<AppState | null>(null)

let toastSeq = 0
let tabSeq = 0

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
  const [aiOpen, setAiOpen] = useState(false)
  const [transfers, setTransfers] = useState<TransferProgress[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const tabsRef = useRef<Tab[]>([])
  tabsRef.current = tabs

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

  // session status updates
  useEffect(() => {
    return window.termite.ssh.onStatus((info) => {
      setTabs((t) =>
        t.map((tab) =>
          tab.sessionId === info.sessionId || (tab.status === 'connecting' && tab.hostId === info.hostId && !tab.sessionId)
            ? { ...tab, status: info.status, sessionId: info.sessionId }
            : tab
        )
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
        const next = idx >= 0 ? [...prev.slice(0, idx), p, ...prev.slice(idx + 1)] : [...prev, p]
        return next
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
    setTabs((t) => [...t, { id, kind: 'terminal', hostId: host.id, title: host.label, status: 'connecting' }])
    setActiveTabId(id)
  }, [])

  const openSftp = useCallback((host: Host) => {
    const id = `tab-${++tabSeq}`
    setTabs((t) => [...t, { id, kind: 'sftp', hostId: host.id, title: `${host.label} — files`, status: 'connecting' }])
    setActiveTabId(id)
  }, [])

  const closeTab = useCallback((id: string) => {
    const tab = tabsRef.current.find((t) => t.id === id)
    if (tab?.sessionId) window.termite.ssh.disconnect(tab.sessionId)
    if (tab?.sftpId) window.termite.sftp.close(tab.sftpId)
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

  const sendToActiveTerminal = useCallback((text: string) => {
    const tab = tabsRef.current.find((t) => t.id === activeTabId)
    if (tab?.kind === 'terminal' && tab.sessionId) {
      window.termite.ssh.write(tab.sessionId, text)
    }
  }, [activeTabId])

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId) ?? null, [tabs, activeTabId])

  const value: AppState = {
    view, setView,
    hosts, keys, snippets, forwards, activeForwards, settings,
    tabs, activeTabId, setActiveTabId,
    aiOpen, setAiOpen,
    transfers, toasts, toast,
    refreshHosts, refreshKeys, refreshSnippets, refreshForwards,
    saveSettings,
    openTerminal, openSftp, closeTab, updateTab,
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
