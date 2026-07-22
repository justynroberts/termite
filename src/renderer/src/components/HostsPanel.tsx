import { useMemo, useState, type JSX } from 'react'
import { v4 as uuid } from 'uuid'
import type { Host } from '../../../shared/types'
import { useApp } from '../state'
import { IconEdit, IconFolder, IconPlus, IconTerminal, IconTrash } from '../icons'

const COLORS = ['#34d399', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#fb923c', '#22d3ee', '#f87171']

export default function HostsPanel(): JSX.Element {
  const { hosts, keys, refreshHosts, openTerminal, openSftp, toast } = useApp()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Host | null>(null)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return hosts.filter(
      (h) =>
        !q ||
        h.label.toLowerCase().includes(q) ||
        h.hostname.toLowerCase().includes(q) ||
        h.tags.some((t) => t.toLowerCase().includes(q))
    )
  }, [hosts, search])

  const groups = useMemo(() => {
    const map = new Map<string, Host[]>()
    for (const h of filtered) {
      const g = h.group || 'Hosts'
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(h)
    }
    for (const list of map.values()) list.sort((a, b) => a.label.localeCompare(b.label))
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  const newHost = (): void =>
    setEditing({
      id: uuid(),
      label: '',
      hostname: '',
      port: 22,
      username: '',
      authMethod: 'password',
      tags: [],
      color: COLORS[hosts.length % COLORS.length],
      createdAt: Date.now()
    })

  const importConfig = async (): Promise<void> => {
    const added = await window.termite.hosts.importSSHConfig()
    await refreshHosts()
    toast(added > 0 ? `Imported ${added} host${added === 1 ? '' : 's'} from ~/.ssh/config` : 'No new hosts found in ~/.ssh/config')
  }

  const remove = async (h: Host): Promise<void> => {
    if (!confirm(`Delete host "${h.label}"?`)) return
    await window.termite.hosts.delete(h.id)
    await refreshHosts()
  }

  return (
    <>
      <div className="sidebar-header">
        <span className="sidebar-title">Hosts</span>
        <div style={{ display: 'flex', gap: 2 }}>
          <button className="icon-btn" title="Import from ~/.ssh/config" onClick={importConfig}>
            <IconFolder size={15} />
          </button>
          <button className="icon-btn" title="New host" onClick={newHost}>
            <IconPlus size={16} />
          </button>
        </div>
      </div>
      <div className="search-box">
        <input placeholder="Search hosts…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="sidebar-body">
        {groups.length === 0 && (
          <div style={{ padding: '20px 10px', color: 'var(--text-2)', fontSize: 12, textAlign: 'center' }}>
            No hosts yet.
            <br />
            <button className="btn sm" style={{ marginTop: 10 }} onClick={newHost}>
              <IconPlus size={13} /> Add your first host
            </button>
          </div>
        )}
        {groups.map(([group, list]) => (
          <div key={group}>
            <div className="group-label">{group}</div>
            {list.map((h) => (
              <div
                key={h.id}
                className="host-item"
                style={{ ['--host-color' as string]: h.color }}
                onDoubleClick={() => openTerminal(h)}
                title={`${h.username}@${h.hostname}:${h.port}\nDouble-click to connect`}
              >
                <span className="host-dot" />
                <div className="host-info">
                  <div className="host-label">{h.label}</div>
                  <div className="host-addr">
                    {h.username ? `${h.username}@` : ''}
                    {h.hostname}
                    {h.jumpHostId ? ' ⤳' : ''}
                  </div>
                </div>
                <div className="host-actions">
                  <button className="icon-btn" title="Open terminal" onClick={() => openTerminal(h)}>
                    <IconTerminal size={14} />
                  </button>
                  <button className="icon-btn" title="Browse files (SFTP)" onClick={() => openSftp(h)}>
                    <IconFolder size={14} />
                  </button>
                  <button className="icon-btn" title="Edit" onClick={() => setEditing(h)}>
                    <IconEdit size={13} />
                  </button>
                  <button className="icon-btn danger" title="Delete" onClick={() => remove(h)}>
                    <IconTrash size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      {editing && (
        <HostEditor
          host={editing}
          allHosts={hosts}
          keyList={keys.map((k) => ({ id: k.id, name: k.name }))}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await refreshHosts()
          }}
        />
      )}
    </>
  )
}

function HostEditor({
  host, allHosts, keyList, onClose, onSaved
}: {
  host: Host
  allHosts: Host[]
  keyList: { id: string; name: string }[]
  onClose: () => void
  onSaved: () => void
}): JSX.Element {
  const [form, setForm] = useState<Host>({ ...host })
  const set = <K extends keyof Host>(k: K, v: Host[K]): void => setForm((f) => ({ ...f, [k]: v }))
  const isNew = !allHosts.some((h) => h.id === host.id)

  const save = async (): Promise<void> => {
    if (!form.hostname) return
    const label = form.label || `${form.username || 'user'}@${form.hostname}`
    await window.termite.hosts.save({ ...form, label })
    onSaved()
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">{isNew ? 'New host' : `Edit ${host.label}`}</div>
        <div className="modal-body">
          <div className="form-grid">
            <label>Label</label>
            <input type="text" value={form.label} placeholder="My server" onChange={(e) => set('label', e.target.value)} />
            <label>Hostname</label>
            <input type="text" value={form.hostname} placeholder="example.com or 10.0.0.5" onChange={(e) => set('hostname', e.target.value)} autoFocus />
            <label>Port</label>
            <input type="number" value={form.port} onChange={(e) => set('port', parseInt(e.target.value, 10) || 22)} />
            <label>Username</label>
            <input type="text" value={form.username} placeholder="root" onChange={(e) => set('username', e.target.value)} />
            <label>Auth</label>
            <select value={form.authMethod} onChange={(e) => set('authMethod', e.target.value as Host['authMethod'])}>
              <option value="password">Password</option>
              <option value="key">SSH key</option>
              <option value="agent">SSH agent</option>
            </select>
            {form.authMethod === 'password' && (
              <>
                <label>Password</label>
                <input
                  type="password"
                  value={form.password ?? ''}
                  placeholder={host.password ? '(unchanged)' : ''}
                  onChange={(e) => set('password', e.target.value)}
                />
              </>
            )}
            {form.authMethod === 'key' && (
              <>
                <label>Key</label>
                <select value={form.keyId ?? ''} onChange={(e) => set('keyId', e.target.value || undefined)}>
                  <option value="">— select a key —</option>
                  {keyList.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            <label>Group</label>
            <input type="text" value={form.group ?? ''} placeholder="Production" onChange={(e) => set('group', e.target.value || undefined)} />
            <label>Tags</label>
            <input
              type="text"
              value={form.tags.join(', ')}
              placeholder="web, prod"
              onChange={(e) =>
                set('tags', e.target.value.split(',').map((t) => t.trim()).filter(Boolean))
              }
            />
            <label>Jump host</label>
            <select value={form.jumpHostId ?? ''} onChange={(e) => set('jumpHostId', e.target.value || undefined)}>
              <option value="">— none —</option>
              {allHosts
                .filter((h) => h.id !== form.id)
                .map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.label}
                  </option>
                ))}
            </select>
            <label>Color</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => set('color', c)}
                  style={{
                    width: 20, height: 20, borderRadius: '50%', background: c, cursor: 'pointer',
                    border: form.color === c ? '2px solid var(--text-0)' : '2px solid transparent'
                  }}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={!form.hostname}>
            {isNew ? 'Add host' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
