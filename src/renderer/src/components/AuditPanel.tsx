import { useCallback, useEffect, useState, type JSX } from 'react'
import type { AuditEvent, SessionLogSummary } from '../../../shared/types'
import { IconCopy, IconRefresh, IconSearch, IconX } from '../icons'
import { useApp } from '../state'

export default function AuditPanel(): JSX.Element {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<AuditEvent | null>(null)
  // The event log records that a session happened; the transcript records what
  // was typed in it. Both are already captured — only the events were shown.
  const [tab, setTab] = useState<'events' | 'sessions'>('events')
  const [sessions, setSessions] = useState<SessionLogSummary[]>([])
  const [openSession, setOpenSession] = useState<SessionLogSummary | null>(null)
  const [transcript, setTranscript] = useState<string>('')
  const [transcriptLoading, setTranscriptLoading] = useState(false)
  const { toast, setAiSubject } = useApp()

  // Escape closes the detail view, matching every other panel in the app.
  useEffect(() => {
    if (!selected && !openSession) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      setSelected(null)
      setOpenSession(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, openSession])

  const load = useCallback(async (search = query): Promise<void> => {
    setLoading(true)
    try { setEvents(await window.termite.activity.audit(search)) } finally { setLoading(false) }
  }, [query])

  const loadSessions = useCallback(async (search = query): Promise<void> => {
    setLoading(true)
    try { setSessions(await window.termite.activity.sessions(search)) } finally { setLoading(false) }
  }, [query])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (tab === 'events') void load(query)
      else void loadSessions(query)
    }, 180)
    return () => clearTimeout(timer)
  }, [query, tab, load, loadSessions])

  const showSession = async (item: SessionLogSummary): Promise<void> => {
    setSelected(null)
    setOpenSession(item)
    setTranscriptLoading(true)
    try { setTranscript(await window.termite.activity.session(item.id)) } finally { setTranscriptLoading(false) }
  }

  // Offer the open transcript, or the open event, to the AI drawer. Withdrawn
  // when nothing is open or the page is left, so the drawer never claims context
  // it no longer has.
  useEffect(() => {
    if (openSession) {
      setAiSubject({
        label: `session · ${openSession.hostLabel}`,
        kind: 'summarize',
        context: () => transcript,
        actions: [
          { label: 'What happened here', prompt: 'Summarise this session: what was run, what the results were, and anything notable.' },
          { label: 'Explain any errors', prompt: 'Are there errors in this session? Explain them and how to fix them.' },
          { label: 'What commands ran', prompt: 'List the commands that were run in this session, in order, with a one-line note on what each did.' }
        ]
      })
    } else if (selected) {
      setAiSubject({
        label: `event · ${selected.action}`,
        kind: 'explain-output',
        context: () => JSON.stringify(selected, null, 2),
        actions: [{ label: 'Explain this event', prompt: 'Explain this audit event in plain language, and whether it is worth attention.' }]
      })
    } else {
      // Closing the detail here is deliberate, so the subject goes with it.
      setAiSubject(null)
    }
    // No unmount cleanup: leaving this page for a terminal should keep whatever
    // was open as the thing the AI is talking about.
  }, [openSession, selected, transcript, setAiSubject])

  return (
    <div className="audit-page">
      <div className="audit-heading">
        <div>
          <h1>Audit log</h1>
          <p>Who did what, where, and when. Events are retained locally for 30 days.</p>
        </div>
        <button className="btn" onClick={() => void (tab === 'events' ? load() : loadSessions())}>
          <IconRefresh size={14} /> Refresh
        </button>
      </div>
      <div className="audit-tabs">
        <button className={`audit-tab ${tab === 'events' ? 'on' : ''}`} onClick={() => { setTab('events'); setOpenSession(null) }}>
          Events
        </button>
        <button className={`audit-tab ${tab === 'sessions' ? 'on' : ''}`} onClick={() => { setTab('sessions'); setSelected(null) }}>
          Session transcripts
        </button>
      </div>
      <label className="audit-search">
        <IconSearch size={15} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tab === 'events' ? 'Search actor, action, host, command…' : 'Search host or transcript contents…'} />
      </label>
      <div className="audit-body">
      {tab === 'sessions' ? (
        <div className="audit-table-wrap">
          <table className="audit-table">
            <thead><tr><th>Host</th><th>Started</th><th>Ended</th><th>Recorded</th></tr></thead>
            <tbody>
              {sessions.map((item) => (
                <tr
                  key={item.id}
                  className={`audit-row ${openSession?.id === item.id ? 'selected' : ''}`}
                  tabIndex={0}
                  role="button"
                  onClick={() => void showSession(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void showSession(item) }
                  }}
                >
                  <td>{item.hostLabel}</td>
                  <td className="audit-when">{new Date(item.startedAt).toLocaleString()}</td>
                  <td className="audit-when">{item.endedAt ? new Date(item.endedAt).toLocaleTimeString() : 'still open'}</td>
                  <td>{item.bytes.toLocaleString()} bytes</td>
                </tr>
              ))}
              {!loading && sessions.length === 0 && (
                <tr><td colSpan={4} className="audit-empty">No session transcripts in the last 30 days.</td></tr>
              )}
            </tbody>
          </table>
          {loading && <div className="audit-loading">Loading sessions…</div>}
        </div>
      ) : (
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
      )}

      {openSession && (
        <div className="audit-detail-pane">
          <div className="audit-detail-head">
            <span className="audit-detail-title">{openSession.hostLabel}</span>
            <span className="hint">{new Date(openSession.startedAt).toLocaleString()}</span>
            <span className="titlebar-spacer" />
            <button
              className="icon-btn"
              title="Copy transcript"
              onClick={() => { window.termite.clipboard.writeText(transcript); toast('Transcript copied') }}
            >
              <IconCopy size={14} />
            </button>
            <button className="icon-btn" title="Close (Esc)" onClick={() => setOpenSession(null)}>
              <IconX size={14} />
            </button>
          </div>
          <div className="audit-detail-label">Everything sent and received in this session</div>
          <pre className="audit-detail-body audit-transcript select-text">
            {transcriptLoading ? 'Loading transcript…' : transcript.trim() || 'Nothing was recorded for this session.'}
          </pre>
        </div>
      )}

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
    </div>
  )
}
