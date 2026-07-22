import { useEffect, type JSX } from 'react'
import { useApp, type View } from './state'
import HostsPanel from './components/HostsPanel'
import KeysPanel from './components/KeysPanel'
import SnippetsPanel from './components/SnippetsPanel'
import ForwardsPanel from './components/ForwardsPanel'
import SettingsPanel from './components/SettingsPanel'
import TerminalView from './components/TerminalView'
import SftpView from './components/SftpView'
import AIDrawer from './components/AIDrawer'
import {
  IconForward, IconKey, IconServer, IconSettings, IconSnippet, IconSparkle, IconX
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
    transfers, toasts, settings, activeTab
  } = useApp()

  // apply UI theme to document root
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
  }, [settings.theme])

  // global shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setAiOpen((v) => !v)
      }
      if (mod && e.key.toLowerCase() === 'w' && activeTabId) {
        e.preventDefault()
        maybeCloseTab(activeTabId)
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
  }, [tabs, activeTabId])

  const maybeCloseTab = (id: string): void => {
    const tab = tabs.find((t) => t.id === id)
    if (tab && settings.confirmOnClose && tab.status === 'connected') {
      if (!confirm(`Close ${tab.title}? The connection will be terminated.`)) return
    }
    closeTab(id)
  }

  return (
    <div className="app">
      <div className="activity-bar">
        <div className="logo" title="Termite">🐜</div>
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
              <div className="tab-strip">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
                    onClick={() => setActiveTabId(tab.id)}
                    onAuxClick={(e) => e.button === 1 && maybeCloseTab(tab.id)}
                  >
                    <span className={`tab-status ${tab.status}`} />
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
                    <div><span>Close tab</span><kbd>Ctrl W</kbd></div>
                    <div><span>Next tab</span><kbd>Ctrl Tab</kbd></div>
                  </div>
                </div>
              )}
              {tabs.map((tab) => (
                <div key={tab.id} className={`content-pane ${tab.id === activeTabId ? 'visible' : ''}`}>
                  {tab.kind === 'terminal' ? (
                    <TerminalView tab={tab} visible={tab.id === activeTabId} />
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
  )
}
