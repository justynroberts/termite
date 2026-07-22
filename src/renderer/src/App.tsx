import { useEffect, useState, type JSX } from 'react'
import { tabStatus, useApp, type View } from './state'
import HostsPanel from './components/HostsPanel'
import KeysPanel from './components/KeysPanel'
import SnippetsPanel from './components/SnippetsPanel'
import ForwardsPanel from './components/ForwardsPanel'
import SettingsPanel from './components/SettingsPanel'
import TerminalPane from './components/TerminalView'
import SftpView from './components/SftpView'
import AIDrawer from './components/AIDrawer'
import {
  IconForward, IconKey, IconServer, IconSettings, IconSnippet, IconSparkle,
  IconSplitDown, IconSplitRight, IconX
} from './icons'
import { formatBytes } from './state'

const NAV: { view: View; icon: JSX.Element; title: string }[] = [
  { view: 'hosts', icon: <IconServer />, title: 'Hosts' },
  { view: 'keys', icon: <IconKey />, title: 'SSH keys' },
  { view: 'snippets', icon: <IconSnippet />, title: 'Snippets' },
  { view: 'forwards', icon: <IconForward />, title: 'Port forwarding' }
]

export default function App(): JSX.Element {
  const {
    view, setView, tabs, activeTabId, setActiveTabId, closeTab, aiOpen, setAiOpen,
    transfers, toasts, settings, activeTab,
    splitPane, closePane, activePaneId
  } = useApp()

  const [materialSupported, setMaterialSupported] = useState(false)

  useEffect(() => {
    window.termite.windowFx.capabilities().then((c) => setMaterialSupported(c.material))
  }, [])

  // apply UI theme + window material to document root / native window
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
    const glass =
      (materialSupported && settings.windowEffect !== 'solid') || window.termite.platform === 'darwin'
    document.documentElement.dataset.glass = String(glass)
    if (materialSupported) {
      window.termite.windowFx.setMaterial(settings.windowEffect)
    }
    window.termite.windowFx.setOverlay(settings.theme === 'light' ? '#3d4a5c' : '#b3c2d4')
  }, [settings.theme, settings.windowEffect, materialSupported])

  // global shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setAiOpen((v) => !v)
      }
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'w' && activeTabId) {
        e.preventDefault()
        maybeCloseTab(activeTabId)
      }
      if (mod && e.shiftKey && activeTab?.kind === 'terminal') {
        const k = e.key.toLowerCase()
        if (k === 'e') {
          e.preventDefault()
          splitPane(activeTab.id, 'right')
        } else if (k === 'o') {
          e.preventDefault()
          splitPane(activeTab.id, 'down')
        } else if (k === 'w') {
          e.preventDefault()
          const paneId = activePaneId[activeTab.id]
          if (paneId) closePane(activeTab.id, paneId)
        }
      }
      if (mod && e.key === 'Tab') {
        e.preventDefault()
        if (tabs.length > 1 && activeTabId) {
          const idx = tabs.findIndex((t) => t.id === activeTabId)
          const next = tabs[(idx + (e.shiftKey ? tabs.length - 1 : 1)) % tabs.length]
          setActiveTabId(next.id)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, activeTabId, activeTab, activePaneId])

  const maybeCloseTab = (id: string): void => {
    const tab = tabs.find((t) => t.id === id)
    if (tab && settings.confirmOnClose && tabStatus(tab) === 'connected') {
      if (!confirm(`Close ${tab.title}? The connection will be terminated.`)) return
    }
    closeTab(id)
  }

  const activeIsSplit =
    activeTab?.kind === 'terminal' && (activeTab.columns?.flat().length ?? 0) > 1

  return (
    <div className="shell">
      <div className={`titlebar ${window.termite.platform === 'darwin' ? 'mac' : ''}`}>
        <span className="titlebar-logo">🐜</span>
        <span className="titlebar-title">Termite</span>
        {activeTab && <span className="titlebar-sub">— {activeTab.title}</span>}
        <span className="titlebar-spacer" />
      </div>
      <div className="app">
      <div
        className="activity-bar"
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) e.preventDefault()
        }}
      >
        {NAV.map((n) => (
          <button
            key={n.view}
            className={`activity-btn ${view === n.view ? 'active' : ''}`}
            title={n.title}
            onClick={() => setView(n.view)}
          >
            {n.icon}
          </button>
        ))}
        <div className="activity-spacer" />
        <button
          className={`activity-btn ${aiOpen ? 'active' : ''}`}
          title="AI Copilot (Ctrl+K)"
          onClick={() => setAiOpen((v) => !v)}
        >
          <IconSparkle />
        </button>
        <button
          className={`activity-btn ${view === 'settings' ? 'active' : ''}`}
          title="Settings"
          onClick={() => setView('settings')}
        >
          <IconSettings />
        </button>
      </div>

      {view !== 'settings' && (
        <div className="sidebar">
          {view === 'hosts' && <HostsPanel />}
          {view === 'keys' && <KeysPanel />}
          {view === 'snippets' && <SnippetsPanel />}
          {view === 'forwards' && <ForwardsPanel />}
        </div>
      )}

      <div className="main">
        {view === 'settings' ? (
          <SettingsPanel />
        ) : (
          <>
            {tabs.length > 0 && (
              <div
                className="tab-strip"
                // never let toolbar clicks steal keyboard focus from the terminal
                onMouseDown={(e) => {
                  if ((e.target as HTMLElement).closest('button')) e.preventDefault()
                }}
              >
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
                    onClick={() => setActiveTabId(tab.id)}
                    onAuxClick={(e) => e.button === 1 && maybeCloseTab(tab.id)}
                  >
                    <span className={`tab-status ${tabStatus(tab)}`} />
                    <span className="tab-title">{tab.title}</span>
                    <span
                      className="tab-close"
                      onClick={(e) => {
                        e.stopPropagation()
                        maybeCloseTab(tab.id)
                      }}
                    >
                      <IconX size={12} />
                    </span>
                  </button>
                ))}
                {activeTab?.kind === 'terminal' && (
                  <div className="tab-strip-actions">
                    <button
                      className="icon-btn"
                      title="Split right (Ctrl+Shift+E)"
                      onClick={() => splitPane(activeTab.id, 'right')}
                    >
                      <IconSplitRight size={15} />
                    </button>
                    <button
                      className="icon-btn"
                      title="Split down (Ctrl+Shift+O)"
                      onClick={() => splitPane(activeTab.id, 'down')}
                    >
                      <IconSplitDown size={15} />
                    </button>
                    {activeIsSplit && (
                      <button
                        className="icon-btn"
                        title="Close pane (Ctrl+Shift+W)"
                        onClick={() => {
                          const paneId = activePaneId[activeTab.id]
                          if (paneId) closePane(activeTab.id, paneId)
                        }}
                      >
                        <IconX size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="content">
              {tabs.length === 0 && (
                <div className="empty-state" style={{ position: 'absolute', inset: 0 }}>
                  <div style={{ fontSize: 44 }}>🐜</div>
                  <h2>Termite</h2>
                  <div>Double-click a host to open a terminal</div>
                  <div className="shortcuts">
                    <div><span>AI Copilot</span><kbd>Ctrl K</kbd></div>
                    <div><span>Split right</span><kbd>Ctrl Shift E</kbd></div>
                    <div><span>Split down</span><kbd>Ctrl Shift O</kbd></div>
                    <div><span>Close pane</span><kbd>Ctrl Shift W</kbd></div>
                    <div><span>Close tab</span><kbd>Ctrl W</kbd></div>
                    <div><span>Next tab</span><kbd>Ctrl Tab</kbd></div>
                  </div>
                </div>
              )}
              {tabs.map((tab) => (
                <div key={tab.id} className={`content-pane ${tab.id === activeTabId ? 'visible' : ''}`}>
                  {tab.kind === 'terminal' ? (
                    <div className="split-root">
                      {(tab.columns ?? []).map((col, ci) => (
                        <div className="split-col" key={ci}>
                          {col.map((pane) => (
                            <TerminalPane
                              key={pane.paneId}
                              tab={tab}
                              pane={pane}
                              visible={tab.id === activeTabId}
                              active={activePaneId[tab.id] === pane.paneId}
                              showActiveRing={(tab.columns?.flat().length ?? 0) > 1}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <SftpView tab={tab} visible={tab.id === activeTabId} />
                  )}
                </div>
              ))}
              {transfers.length > 0 && (
                <div className="transfer-bar">
                  {transfers.slice(-4).map((t) => (
                    <div key={t.transferId} className="transfer-item">
                      <div className="row">
                        <span>
                          {t.kind === 'upload' ? '↑' : '↓'} {t.filename}
                        </span>
                        <span style={{ color: 'var(--text-2)' }}>
                          {t.done ? 'done' : `${formatBytes(t.transferred)} / ${formatBytes(t.total)}`}
                        </span>
                      </div>
                      <div className="progress-track">
                        <div
                          className="progress-fill"
                          style={{ width: `${t.total ? Math.min(100, (t.transferred / t.total) * 100) : 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {aiOpen && settings.aiEnabled && <AIDrawer />}

      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
      </div>
    </div>
  )
}
