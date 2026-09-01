import { useCallback, useEffect, useState, type JSX } from 'react'
import type { AuditEvent } from '../../../shared/types'
import { IconCopy, IconRefresh, IconSearch, IconX } from '../icons'
import { useApp } from '../state'

export default function AuditPanel(): JSX.Element {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<AuditEvent | null>(null)
  const { toast } = useApp()

  // Escape closes the detail view, matching every other panel in the app.
  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  const load = useCallback(async (search = query): Promise<void> => {
    setLoading(true)
    try { setEvents(await window.termite.activity.audit(search)) } finally { setLoading(false) }
  }, [query])

  useEffect(() => {
    const timer = setTimeout(() => void load(query), 180)
    return () => clearTimeout(timer)
  }, [query, load])

  return (
    <div className="audit-page">
      <div className="audit-heading">
        <div>
          <h1>Audit log</h1>
          <p>Who did what, where, and when. Events are retained locally for 30 days.</p>
        </div>
        <button className="btn" onClick={() => void load()}><IconRefresh size={14} /> Refresh</button>
      </div>
      <label className="audit-search">
        <IconSearch size={15} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search actor, action, host, command…" />
      </label>
      <div className="audit-table-wrap">
        <table className="audit-table">
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>Result</th><th>What</th></tr></thead>
          <tbody>
            {events.map((event) => (
              <tr
                key={event.id}
                className={`audit-row ${selected?.id === event.id ? 'selected' : ''}`}
                tabIndex={0}
                role="button"
                onClick={() => setSelected(event)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelected(event)
                  }
                }}
              >
                <td className="audit-when" title={new Date(event.at).toISOString()}>{new Date(event.at).toLocaleString()}</td>
                <td>{event.actor ?? 'local user'}</td>
                <td><code>{event.action}</code></td>
                <td>{event.target ?? '—'}</td>
                <td><span className={`audit-outcome ${event.outcome}`}>{event.outcome}</span></td>
                <td className="audit-detail" title={event.detail}>{event.detail ?? '—'}</td>
              </tr>
            ))}
            {!loading && events.length === 0 && <tr><td colSpan={6} className="audit-empty">No matching events in the last 30 days.</td></tr>}
          </tbody>
        </table>
        {loading && <div className="audit-loading">Loading audit events…</div>}
      </div>

      {selected && (
        <div className="audit-detail-pane">
          <div className="audit-detail-head">
            <span className="audit-detail-title"><code>{selected.action}</code></span>
            <span className={`audit-outcome ${selected.outcome}`}>{selected.outcome}</span>
            <span className="titlebar-spacer" />
            <button
              className="icon-btn"
              title="Copy as JSON"
              onClick={() => {
                window.termite.clipboard.writeText(JSON.stringify(selected, null, 2))
                toast('Event copied')
              }}
            >
              <IconCopy size={14} />
            </button>
            <button className="icon-btn" title="Close (Esc)" onClick={() => setSelected(null)}>
              <IconX size={14} />
            </button>
          </div>
          <dl className="audit-detail-rows">
            <div><dt>When</dt><dd>{new Date(selected.at).toLocaleString()}<span className="hint"> · {new Date(selected.at).toISOString()}</span></dd></div>
            <div><dt>Who</dt><dd>{selected.actor ?? 'local user'}</dd></div>
            <div><dt>Action</dt><dd><code>{selected.action}</code></dd></div>
            <div><dt>Target</dt><dd>{selected.target ?? '—'}</dd></div>
            <div><dt>Event ID</dt><dd className="mono select-text">{selected.id}</dd></div>
          </dl>
          {/* The table truncates this to one line; the whole point of opening a
              row is to read a command or a path that did not fit. */}
          <div className="audit-detail-label">Detail</div>
          <pre className="audit-detail-body select-text">{selected.detail?.trim() || 'No further detail recorded.'}</pre>
        </div>
      )}
    </div>
  )
}
