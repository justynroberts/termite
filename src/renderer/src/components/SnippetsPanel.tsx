import { useState, type JSX } from 'react'
import { v4 as uuid } from 'uuid'
import type { Snippet } from '../../../shared/types'
import { useApp } from '../state'
import { IconEdit, IconPlay, IconPlus, IconSnippet, IconTrash } from '../icons'

export default function SnippetsPanel(): JSX.Element {
  const { snippets, refreshSnippets, sendToActiveTerminal, activeSessionId, toast } = useApp()
  const [editing, setEditing] = useState<Snippet | null>(null)

  const run = (s: Snippet): void => {
    if (!activeSessionId) {
      toast('Open a terminal tab first', 'warn')
      return
    }
    sendToActiveTerminal(s.command.endsWith('\n') ? s.command : s.command + '\n')
  }

  const remove = async (s: Snippet): Promise<void> => {
    if (!confirm(`Delete snippet "${s.name}"?`)) return
    await window.termite.snippets.delete(s.id)
    await refreshSnippets()
  }

  return (
    <>
      <div className="sidebar-header">
        <span className="sidebar-title">Snippets</span>
        <button
          className="icon-btn"
          title="New snippet"
          onClick={() =>
            setEditing({ id: uuid(), name: '', command: '', tags: [], createdAt: Date.now() })
          }
        >
          <IconPlus size={16} />
        </button>
      </div>
      <div className="sidebar-body">
        {snippets.length === 0 && (
          <div style={{ padding: '20px 10px', color: 'var(--text-2)', fontSize: 12, textAlign: 'center' }}>
            Save frequently-used commands and run them in any session with one click.
          </div>
        )}
        {snippets.map((s) => (
          <div key={s.id} className="panel-list-item" onDoubleClick={() => run(s)} title="Double-click to run in active terminal">
            <IconSnippet size={15} />
            <div className="info">
              <div className="name">{s.name}</div>
              <div className="meta mono">{s.command}</div>
            </div>
            <div className="actions">
              <button className="icon-btn" title="Run in active terminal" onClick={() => run(s)}>
                <IconPlay size={13} />
              </button>
              <button className="icon-btn" title="Edit" onClick={() => setEditing(s)}>
                <IconEdit size={13} />
              </button>
              <button className="icon-btn danger" title="Delete" onClick={() => remove(s)}>
                <IconTrash size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
      {editing && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setEditing(null)}>
          <div className="modal">
            <div className="modal-header">{editing.name ? `Edit ${editing.name}` : 'New snippet'}</div>
            <div className="modal-body">
              <div className="form-grid">
                <label>Name</label>
                <input
                  type="text"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Restart nginx"
                  autoFocus
                />
                <label>Command</label>
                <textarea
                  rows={4}
                  value={editing.command}
                  onChange={(e) => setEditing({ ...editing, command: e.target.value })}
                  placeholder="sudo systemctl restart nginx"
                />
                <label>Description</label>
                <input
                  type="text"
                  value={editing.description ?? ''}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button
                className="btn primary"
                disabled={!editing.name || !editing.command}
                onClick={async () => {
                  await window.termite.snippets.save(editing)
                  await refreshSnippets()
                  setEditing(null)
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
