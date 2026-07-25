import { useEffect, useState, type JSX } from 'react'
import { v4 as uuid } from 'uuid'
import type { Runbook, RunbookStep } from '../../../shared/types'
import { useApp } from '../state'
import {
  IconChevronDown, IconChevronUp, IconEdit, IconPlay, IconPlus, IconRunbook, IconSparkle, IconTrash
} from '../icons'

function newStep(): RunbookStep {
  return {
    id: uuid(),
    name: '',
    command: '',
    hostIds: [],
    parallel: true,
    continueOnError: false,
    shell: 'default'
  }
}

export default function RunbooksPanel(): JSX.Element {
  const { runbooks, refreshRunbooks, runRunbook, hosts, toast } = useApp()
  const [editing, setEditing] = useState<Runbook | null>(null)

  useEffect(() => {
    if (!editing) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setEditing(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing])

  const run = (rb: Runbook): void => {
    const bad = rb.steps.find((s) => s.hostIds.length === 0)
    if (rb.steps.length === 0 || bad) {
      toast(bad ? `Step "${bad.name || '?'}" has no target hosts` : 'Runbook has no steps', 'warn')
      return
    }
    runRunbook(rb)
  }

  const remove = async (rb: Runbook): Promise<void> => {
    if (!confirm(`Delete runbook "${rb.name}"?`)) return
    await window.termite.runbooks.delete(rb.id)
    refreshRunbooks()
  }

  return (
    <>
      <div className="sidebar-header">
        <span className="sidebar-title">Runbooks</span>
        <button
          className="icon-btn"
          title="New runbook"
          onClick={() =>
            setEditing({ id: uuid(), name: '', description: '', steps: [newStep()], createdAt: Date.now() })
          }
        >
          <IconPlus size={16} />
        </button>
      </div>
      <div className="sidebar-body">
        {runbooks.length === 0 && (
          <div style={{ padding: '20px 10px', color: 'var(--text-2)', fontSize: 13, textAlign: 'center' }}>
            Orchestrate commands across hosts in ordered steps — updates, deploys, health checks.
            Create one with ＋ or draft it with AI.
          </div>
        )}
        {runbooks.map((rb) => (
          <div key={rb.id} className="panel-list-item" onDoubleClick={() => run(rb)} title="Double-click to run">
            <IconRunbook size={15} />
            <div className="info">
              <div className="name">{rb.name || '(unnamed)'}</div>
              <div className="meta">
                {rb.steps.length} step{rb.steps.length === 1 ? '' : 's'}
                {rb.description ? ` · ${rb.description}` : ''}
              </div>
            </div>
            <div className="actions">
              <button className="icon-btn" title="Run" onClick={() => run(rb)}>
                <IconPlay size={15} />
              </button>
              <button className="icon-btn" title="Edit" onClick={() => setEditing(structuredClone(rb))}>
                <IconEdit size={15} />
              </button>
              <button className="icon-btn danger" title="Delete" onClick={() => remove(rb)}>
                <IconTrash size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
      {editing && (
        <RunbookEditor
          runbook={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            refreshRunbooks()
          }}
        />
      )}
    </>
  )
}

function RunbookEditor({
  runbook, onClose, onSaved
}: {
  runbook: Runbook
  onClose: () => void
  onSaved: () => void
}): JSX.Element {
  const { hosts, toast, settings } = useApp()
  const [form, setForm] = useState<Runbook>(runbook)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiBusy, setAiBusy] = useState(false)

  const setStep = (id: string, patch: Partial<RunbookStep>): void =>
    setForm((f) => ({ ...f, steps: f.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) }))

  const moveStep = (idx: number, dir: -1 | 1): void =>
    setForm((f) => {
      const steps = [...f.steps]
      const j = idx + dir
      if (j < 0 || j >= steps.length) return f
      ;[steps[idx], steps[j]] = [steps[j], steps[idx]]
      return { ...f, steps }
    })

  const toggleHost = (step: RunbookStep, hostId: string): void =>
    setStep(step.id, {
      hostIds: step.hostIds.includes(hostId)
        ? step.hostIds.filter((h) => h !== hostId)
        : [...step.hostIds, hostId]
    })

  const draftWithAI = async (): Promise<void> => {
    if (!aiPrompt.trim()) return
    setAiBusy(true)
    try {
      const res = await window.termite.ai.run({ kind: 'draft-runbook', prompt: aiPrompt })
      if (!res.ok || !res.text) throw new Error(res.error ?? 'no response')
      const raw = res.text.replace(/^```\w*\s*/m, '').replace(/```\s*$/m, '').trim()
      const parsed = JSON.parse(raw) as { name: string; command: string; parallel?: boolean; continueOnError?: boolean }[]
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('unexpected AI response shape')
      const defaultHosts = form.steps[0]?.hostIds ?? []
      setForm((f) => ({
        ...f,
        name: f.name || aiPrompt.slice(0, 48),
        steps: parsed.map((p) => ({
          id: uuid(),
          name: p.name ?? '',
          command: p.command ?? '',
          hostIds: defaultHosts,
          parallel: p.parallel ?? true,
          continueOnError: p.continueOnError ?? false,
          shell: 'default' as const
        }))
      }))
      toast(`AI drafted ${parsed.length} steps — review commands and assign hosts`)
    } catch (err) {
      toast(`AI draft failed: ${err instanceof Error ? err.message : err}`, 'error')
    } finally {
      setAiBusy(false)
    }
  }

  const save = async (): Promise<void> => {
    if (!form.name.trim()) {
      toast('Give the runbook a name', 'warn')
      return
    }
    await window.termite.runbooks.save(form)
    onSaved()
  }

  return (
    <div className="modal-backdrop">
      <div className="modal modal-wide">
        <div className="modal-header">{runbook.name ? `Edit ${runbook.name}` : 'New runbook'}</div>
        <div className="modal-body">
          <div className="form-grid">
            <label>Name</label>
            <input type="text" value={form.name} autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <label>Description</label>
            <input
              type="text"
              value={form.description ?? ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          {settings.aiEnabled && (
            <div className="ai-draft-row">
              <IconSparkle size={15} />
              <input
                type="text"
                placeholder='Describe the job, e.g. "update all Debian servers with a reboot check"…'
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && draftWithAI()}
              />
              <button className="btn" disabled={aiBusy} onClick={draftWithAI}>
                {aiBusy ? 'Drafting…' : 'Draft steps'}
              </button>
            </div>
          )}

          {form.steps.map((step, idx) => (
            <div key={step.id} className="step-card">
              <div className="step-card-header">
                <span className="step-number">{idx + 1}</span>
                <input
                  type="text"
                  placeholder="Step name"
                  value={step.name}
                  onChange={(e) => setStep(step.id, { name: e.target.value })}
                />
                <button className="icon-btn" title="Move up" onClick={() => moveStep(idx, -1)}>
                  <IconChevronUp size={14} />
                </button>
                <button className="icon-btn" title="Move down" onClick={() => moveStep(idx, 1)}>
                  <IconChevronDown size={14} />
                </button>
                <button
                  className="icon-btn danger"
                  title="Remove step"
                  onClick={() => setForm((f) => ({ ...f, steps: f.steps.filter((s) => s.id !== step.id) }))}
                >
                  <IconTrash size={14} />
                </button>
              </div>
              <textarea
                className="step-command"
                placeholder={'commands to run, e.g.\nsudo DEBIAN_FRONTEND=noninteractive apt-get update -y'}
                value={step.command}
                rows={3}
                spellCheck={false}
                onChange={(e) => setStep(step.id, { command: e.target.value })}
              />
              <div className="step-hosts">
                {hosts.map((h) => (
                  <label key={h.id} className={`host-chip ${step.hostIds.includes(h.id) ? 'on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={step.hostIds.includes(h.id)}
                      onChange={() => toggleHost(step, h.id)}
                    />
                    {h.label}
                  </label>
                ))}
                {hosts.length === 0 && <span className="hint">No hosts yet — add some in the Hosts panel.</span>}
              </div>
              <div className="step-opts">
                <label>
                  <input
                    type="checkbox"
                    checked={step.parallel}
                    onChange={(e) => setStep(step.id, { parallel: e.target.checked })}
                  />
                  hosts in parallel
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={step.continueOnError}
                    onChange={(e) => setStep(step.id, { continueOnError: e.target.checked })}
                  />
                  continue on error
                </label>
                <label>
                  shell
                  <select
                    value={step.shell ?? 'default'}
                    onChange={(e) => setStep(step.id, { shell: e.target.value as RunbookStep['shell'] })}
                  >
                    <option value="default">default (login shell)</option>
                    <option value="bash">bash</option>
                    <option value="powershell">PowerShell</option>
                  </select>
                </label>
                <label>
                  timeout&nbsp;
                  <input
                    type="number"
                    className="timeout-input"
                    min={0}
                    placeholder="∞"
                    value={step.timeoutSec || ''}
                    onChange={(e) => setStep(step.id, { timeoutSec: parseInt(e.target.value, 10) || 0 })}
                  />
                  s
                </label>
              </div>
            </div>
          ))}

          <button
            className="btn add-step"
            onClick={() => setForm((f) => ({ ...f, steps: [...f.steps, newStep()] }))}
          >
            <IconPlus size={14} /> Add step
          </button>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  )
}
