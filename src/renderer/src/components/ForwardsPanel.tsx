import { useEffect, useState, type JSX } from 'react'
import { v4 as uuid } from 'uuid'
import type { PortForward } from '../../../shared/types'
import { useApp } from '../state'
import { IconEdit, IconForward, IconPlay, IconPlus, IconStop, IconTrash } from '../icons'

export default function ForwardsPanel(): JSX.Element {
  const { forwards, activeForwards, hosts, refreshForwards, toast } = useApp()
  const [editing, setEditing] = useState<PortForward | null>(null)

  useEffect(() => {
    if (!editing) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setEditing(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing])

  const start = async (f: PortForward): Promise<void> => {
    try {
      await window.termite.forwards.start(f.id)
      await refreshForwards()
      toast(`Forward "${f.label}" started`)
    } catch (err) {
      toast(`Start failed: ${err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : err}`, 'error')
    }
  }

  const stop = async (f: PortForward): Promise<void> => {
    await window.termite.forwards.stop(f.id)
    await refreshForwards()
  }

  const remove = async (f: PortForward): Promise<void> => {
    if (!confirm(`Delete forward "${f.label}"?`)) return
    await window.termite.forwards.delete(f.id)
    await refreshForwards()
  }

  const describe = (f: PortForward): string => {
    if (f.type === 'local') return `localhost:${f.srcPort} → ${f.dstHost}:${f.dstPort}`
    if (f.type === 'remote') return `remote:${f.srcPort} → ${f.dstHost}:${f.dstPort}`
    return `SOCKS5 on localhost:${f.srcPort}`
  }

  return (
    <>
      <div className="sidebar-header">
        <span className="sidebar-title">Port forwarding</span>
        <button
          className="icon-btn"
          title="New forward"
          onClick={() =>
            setEditing({
              id: uuid(), hostId: hosts[0]?.id ?? '', type: 'local', label: '',
              srcHost: '127.0.0.1', srcPort: 8080, dstHost: '127.0.0.1', dstPort: 80
            })
          }
        >
          <IconPlus size={16} />
        </button>
      </div>
      <div className="sidebar-body">
        {forwards.length === 0 && (
          <div style={{ padding: '20px 10px', color: 'var(--text-2)', fontSize: 12, textAlign: 'center' }}>
            Tunnel ports through SSH: local, remote, or a dynamic SOCKS5 proxy.
          </div>
        )}
        {forwards.map((f) => {
          const active = activeForwards.includes(f.id)
          const host = hosts.find((h) => h.id === f.hostId)
          return (
            <div key={f.id} className="panel-list-item">
              <IconForward size={15} />
              <div className="info">
                <div className="name">
                  {f.label || describe(f)} {active && <span className="badge green">active</span>}
                </div>
                <div className="meta">
                  {f.type} · {describe(f)} · via {host?.label ?? '?'}
                </div>
              </div>
              <div className="actions">
                {active ? (
                  <button className="icon-btn" title="Stop" onClick={() => stop(f)}>
                    <IconStop size={13} />
                  </button>
                ) : (
                  <button className="icon-btn" title="Start" onClick={() => start(f)}>
                    <IconPlay size={13} />
                  </button>
                )}
                <button className="icon-btn" title="Edit" onClick={() => setEditing(f)}>
                  <IconEdit size={13} />
                </button>
                <button className="icon-btn danger" title="Delete" onClick={() => remove(f)}>
                  <IconTrash size={13} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
      {editing && (
        <div className="modal-backdrop">
          <div className="modal" style={{ width: 460 }}>
            <div className="modal-header">Port forward</div>
            <div className="modal-body">
              <div className="form-grid">
                <label>Label</label>
                <input type="text" value={editing.label} placeholder="Postgres tunnel" onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
                <label>Via host</label>
                <select value={editing.hostId} onChange={(e) => setEditing({ ...editing, hostId: e.target.value })}>
                  {hosts.map((h) => (
                    <option key={h.id} value={h.id}>{h.label}</option>
                  ))}
                </select>
                <label>Type</label>
                <select value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value as PortForward['type'] })}>
                  <option value="local">Local (access remote service locally)</option>
                  <option value="remote">Remote (expose local service remotely)</option>
                  <option value="dynamic">Dynamic (SOCKS5 proxy)</option>
                </select>
                <label>{editing.type === 'remote' ? 'Remote port' : 'Local port'}</label>
                <input type="number" value={editing.srcPort} onChange={(e) => setEditing({ ...editing, srcPort: parseInt(e.target.value, 10) || 0 })} />
                {editing.type !== 'dynamic' && (
                  <>
                    <label>Target host</label>
                    <input type="text" value={editing.dstHost} placeholder="127.0.0.1" onChange={(e) => setEditing({ ...editing, dstHost: e.target.value })} />
                    <label>Target port</label>
                    <input type="number" value={editing.dstPort} onChange={(e) => setEditing({ ...editing, dstPort: parseInt(e.target.value, 10) || 0 })} />
                  </>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button
                className="btn primary"
                disabled={!editing.hostId || !editing.srcPort}
                onClick={async () => {
                  await window.termite.forwards.save(editing)
                  await refreshForwards()
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
