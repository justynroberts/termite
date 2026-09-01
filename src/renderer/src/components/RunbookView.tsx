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
  const { runs, cancelRun, hosts, askAI, setAiSubject } = useApp()
  const run = tab.runId ? runs[tab.runId] : undefined

  if (!run) return <div className="runbook-view empty">Run not found (it may predate an app restart).</div>

  const hostLabel = (id: string): string => hosts.find((h) => h.id === id)?.label ?? id

  const elapsed = Math.round((Date.now() - run.startedAt) / 1000)
  const failedHosts = run.steps.reduce(
    (n, step) => n + step.hosts.filter((h) => h.status === 'failed').length,
    0
  )

  // Offer this run to the AI drawer for as long as it is on screen, so the
  // drawer is useful when opened directly rather than only through the buttons
  // above. Built lazily — a run transcript is not cheap to assemble.
  useEffect(() => {
    setAiSubject({
      label: `run · ${run.runbookName}`,
      kind: 'explain-run',
      context: () => runTranscript(run, hostLabel),
      actions: [
        { label: 'Summarise this run', prompt: 'Summarise this run across the fleet.' },
        { label: 'Explain failures', prompt: 'Which hosts failed and why, and how do I fix them?' },
        { label: 'Is the fleet consistent?', prompt: 'Did this run leave the fleet in a consistent state, or did it apply to some hosts and not others?' }
      ]
    })
    return () => setAiSubject(null)
  }, [run, setAiSubject])

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
        {/* Available while the run is still going: the transcript is a snapshot
            of what has happened so far, and a run that is failing part way is
            exactly when the question gets asked. */}
        {(
          <>
            {failedHosts > 0 && (
              <button
                className="btn"
                title="Send this run's output to the AI copilot"
                onClick={() =>
                  askAI({
                    kind: 'explain-run',
                    prompt:
                      run.status === 'running'
                        ? 'This run is still going. What is failing so far, and should I let it continue?'
                        : 'Why did this run fail, and how do I fix it?',
                    context: runTranscript(run, hostLabel),
                    label: `${run.runbookName} (run)`
                  })
                }
              >
                {run.status === 'running' ? 'Explain failures so far' : 'Explain failure'}
              </button>
            )}
            <button
              className="btn"
              title="Send this run's output to the AI copilot"
              onClick={() =>
                askAI({
                  kind: 'explain-run',
                  prompt:
                    run.status === 'running'
                      ? 'Summarise what this run has done across the fleet so far. It is still in progress.'
                      : 'Summarise this run across the fleet.',
                  context: runTranscript(run, hostLabel),
                  label: `${run.runbookName} (run)`
                })
              }
            >
              {run.status === 'running' ? 'Summarise so far' : 'Summarise run'}
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
