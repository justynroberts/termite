import { useCallback, useEffect, useState, type JSX } from 'react'
import type { AuditEvent } from '../../../shared/types'
import { IconRefresh, IconSearch } from '../icons'

export default function AuditPanel(): JSX.Element {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)

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
              <tr key={event.id}>
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
    </div>
  )
}
