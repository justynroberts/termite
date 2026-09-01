// MIT License - Copyright (c) fintonlabs.com
import type { RunState } from './state'

/**
 * Renders a runbook run as text the model can reason about.
 *
 * Not the same problem as terminal scrollback. A run is a grid — steps across
 * hosts — and the interesting part is rarely at the end: a step can fail in the
 * middle and leave later steps skipped, so simply truncating to the last N
 * characters would throw away the failure and keep the silence after it.
 *
 * So the structure is built first and the output is filled in afterwards,
 * failures before successes, until the budget runs out. `runAI` keeps the last
 * 12000 characters of whatever it is given, so staying under that means the
 * summary at the top always survives.
 */
const BUDGET = 11_000
/** Per host, tail-weighted: an error is almost always at the end of its output. */
const PER_HOST = 2_200

function tail(text: string, max: number): string {
  const trimmed = text.trimEnd()
  if (trimmed.length <= max) return trimmed
  return `…(earlier output trimmed)…\n${trimmed.slice(-max)}`
}

export function runTranscript(run: RunState, labelOf: (hostId: string) => string): string {
  const lines: string[] = [
    `Runbook: ${run.runbookName}`,
    `Run status: ${run.status}`,
    `Started: ${new Date(run.startedAt).toISOString()}`,
    ''
  ]

  run.steps.forEach((step, i) => {
    const ok = step.hosts.filter((h) => h.status === 'ok').length
    const failed = step.hosts.filter((h) => h.status === 'failed').length
    const counts = step.hosts.length
      ? ` — ${step.hosts.length} host(s): ${ok} ok, ${failed} failed`
      : ''
    lines.push(`STEP ${i + 1} "${step.name || 'unnamed'}" — ${step.status}${counts}`)
    if (step.error) lines.push(`  step error: ${step.error}`)
    for (const h of step.hosts) {
      const code = h.exitCode === undefined ? '' : ` exit ${h.exitCode}`
      lines.push(`  ${labelOf(h.hostId)}: ${h.status}${code}${h.error ? ` (${h.error})` : ''}`)
    }
    lines.push('')
  })

  // Output second, and failures first: if only some of it fits, it must be the
  // part that explains why the run went wrong.
  const blocks: Array<{ priority: number; text: string }> = []
  run.steps.forEach((step, i) => {
    for (const h of step.hosts) {
      if (!h.output.trim()) continue
      blocks.push({
        priority: h.status === 'failed' ? 0 : 1,
        text: `--- step ${i + 1} "${step.name || 'unnamed'}" · ${labelOf(h.hostId)} (${h.status})\n${tail(h.output, PER_HOST)}`
      })
    }
  })
  blocks.sort((a, b) => a.priority - b.priority)

  let used = lines.join('\n').length
  const out = [...lines, 'OUTPUT']
  used += 7
  let omitted = 0
  for (const block of blocks) {
    if (used + block.text.length + 2 > BUDGET) {
      omitted++
      continue
    }
    out.push(block.text, '')
    used += block.text.length + 2
  }
  if (omitted > 0) out.push(`(${omitted} further host output block(s) omitted for length)`)
  return out.join('\n')
}
