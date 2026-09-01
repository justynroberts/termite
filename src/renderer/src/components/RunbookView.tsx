import { useEffect, useRef, useState, type JSX } from 'react'
import { useApp, type RunHostState, type Tab } from '../state'
import { runTranscript } from '../runContext'
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
  const { runs, cancelRun, hosts, askAI } = useApp()
  const run = tab.runId ? runs[tab.runId] : undefined

  if (!run) return <div className="runbook-view empty">Run not found (it may predate an app restart).</div>

  const hostLabel = (id: string): string => hosts.find((h) => h.id === id)?.label ?? id

  const elapsed = Math.round((Date.now() - run.startedAt) / 1000)
  const failedHosts = run.steps.reduce(
    (n, step) => n + step.hosts.filter((h) => h.status === 'failed').length,
    0
  )

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
        {/* Only once the run has stopped: asking about a half-finished run gives
            the model a transcript that is about to change under it. */}
        {run.status !== 'running' && (
          <>
            {failedHosts > 0 && (
              <button
                className="btn"
                title="Send this run's output to the AI copilot"
                onClick={() =>
                  askAI({
                    kind: 'explain-run',
                    prompt: `Why did this run fail, and how do I fix it?`,
                    context: runTranscript(run, hostLabel),
                    label: `${run.runbookName} (run)`
                  })
                }
              >
                Explain failure
              </button>
            )}
            <button
              className="btn"
              title="Send this run's output to the AI copilot"
              onClick={() =>
                askAI({
                  kind: 'explain-run',
                  prompt: 'Summarise this run across the fleet.',
                  context: runTranscript(run, hostLabel),
                  label: `${run.runbookName} (run)`
                })
              }
            >
              Summarise run
            </button>
          </>
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
            {/* A step can fail before reaching a host — most often because its
                tags matched nothing — and then there is no host row to carry
                the reason. */}
            {step.error && <div className="run-step-error">{step.error}</div>}
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
