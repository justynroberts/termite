import { useEffect, useRef, useState, type JSX } from 'react'
import { useApp, type RunHostState, type Tab } from '../state'
import { IconChevronDown, IconChevronUp, IconX } from '../icons'

const STATUS_LABEL: Record<string, string> = {
  pending: '· waiting',
  running: '⟳ running',
  ok: '✓ ok',
  failed: '✗ failed',
  skipped: '– skipped',
  cancelled: '✗ cancelled'
}

export default function RunbookView({ tab }: { tab: Tab; visible: boolean }): JSX.Element {
  const { runs, cancelRun, hosts } = useApp()
  const run = tab.runId ? runs[tab.runId] : undefined

  if (!run) return <div className="runbook-view empty">Run not found (it may predate an app restart).</div>

  const hostLabel = (id: string): string => hosts.find((h) => h.id === id)?.label ?? id

  const elapsed = Math.round((Date.now() - run.startedAt) / 1000)

  return (
    <div className="runbook-view">
      <div className="run-header">
        <span className={`run-status ${run.status}`}>{STATUS_LABEL[run.status] ?? run.status}</span>
        <span className="run-title">{run.runbookName}</span>
        <span className="run-meta">
          {run.steps.filter((s) => s.status === 'ok').length}/{run.steps.length} steps
          {run.status !== 'running' ? '' : ` · ${elapsed}s`}
        </span>
        {run.status === 'running' && (
          <button className="btn danger-outline" onClick={() => cancelRun(run.runId)}>
            <IconX size={13} /> Cancel run
          </button>
        )}
      </div>
      <div className="run-steps">
        {run.steps.map((step, i) => (
          <div key={step.stepId} className={`run-step ${step.status}`}>
            <div className="run-step-header">
              <span className="step-number">{i + 1}</span>
              <span className="run-step-name">{step.name || '(unnamed step)'}</span>
              <span className={`run-badge ${step.status}`}>{STATUS_LABEL[step.status]}</span>
            </div>
            <div className="run-hosts">
              {step.hosts.map((h) => (
                <HostOutput key={h.hostId} host={h} label={hostLabel(h.hostId)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function HostOutput({ host, label }: { host: RunHostState; label: string }): JSX.Element {
  const [open, setOpen] = useState(true)
  const preRef = useRef<HTMLPreElement>(null)
  const stick = useRef(true)

  // autoscroll while pinned to bottom
  useEffect(() => {
    const el = preRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [host.output])

  return (
    <div className={`run-host ${host.status}`}>
      <button className="run-host-header" onClick={() => setOpen((o) => !o)}>
        {open ? <IconChevronUp size={13} /> : <IconChevronDown size={13} />}
        <span className="run-host-label">{label}</span>
        <span className={`run-badge ${host.status}`}>
          {STATUS_LABEL[host.status]}
          {host.exitCode !== undefined && host.status === 'failed' ? ` (exit ${host.exitCode})` : ''}
        </span>
      </button>
      {open && (
        <pre
          ref={preRef}
          className="run-output"
          onScroll={(e) => {
            const el = e.currentTarget
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
          }}
        >
          {host.output || (host.status === 'pending' ? '…' : '')}
          {host.error && !host.output.includes(host.error) ? `\n[${host.error}]` : ''}
        </pre>
      )}
    </div>
  )
}
