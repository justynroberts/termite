import type { Client, ClientChannel } from 'ssh2'
import { v4 as uuid } from 'uuid'
import type { Runbook, RunbookEvent, RunbookStep } from '../shared/types'
import type { Store } from './store'
import type { SSHManager } from './ssh/SSHManager'

interface ActiveRun {
  cancelled: boolean
  clients: Set<Client>
  channels: Set<ClientChannel>
}

/** Wrap a step command for the chosen remote interpreter. */
function wrapCommand(step: RunbookStep): string {
  const cmd = step.command
  if (step.shell === 'bash') {
    // single-quote escape for bash -lc
    return `bash -lc '${cmd.replace(/'/g, `'\\''`)}'`
  }
  if (step.shell === 'powershell') {
    // -EncodedCommand takes base64(UTF-16LE) — immune to quoting/newline issues
    const encoded = Buffer.from(cmd, 'utf16le').toString('base64')
    return `powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`
  }
  return cmd
}

/**
 * Executes runbooks: steps run in order; within a step, hosts run in
 * parallel or sequentially. Emits RunbookEvents for live UI updates.
 */
export class RunbookRunner {
  private runs = new Map<string, ActiveRun>()

  constructor(
    private store: Store,
    private ssh: SSHManager,
    private send: (event: RunbookEvent) => void
  ) {}

  /** Starts the run and returns its id immediately; execution continues async. */
  start(runbookId: string): string {
    const runbook = this.store.getRunbook(runbookId)
    if (!runbook) throw new Error('Runbook not found')
    const runId = uuid()
    const state: ActiveRun = { cancelled: false, clients: new Set(), channels: new Set() }
    this.runs.set(runId, state)
    void this.execute(runId, runbook, state)
    return runId
  }

  /** Runs still in flight. Restarting mid-run abandons it halfway across a fleet. */
  activeCount(): number {
    let live = 0
    for (const state of this.runs.values()) if (!state.cancelled) live++
    return live
  }

  cancel(runId: string): void {
    const state = this.runs.get(runId)
    if (!state) return
    state.cancelled = true
    for (const ch of state.channels) {
      try {
        ch.close()
      } catch {
        /* already closed */
      }
    }
    for (const c of state.clients) c.end()
  }

  /**
   * The hosts a step targets: those named individually, plus every host
   * carrying any of its tags.
   *
   * Resolved at run time on purpose. "Run this against everything tagged
   * production" has to mean the fleet as it stands now, not as it stood when
   * the runbook was written — otherwise a host added later is quietly missed,
   * which is the failure mode tags exist to prevent.
   */
  private resolveTargets(step: RunbookStep): string[] {
    const targets = new Set(step.hostIds)
    const tags = step.targetTags ?? []
    if (tags.length > 0) {
      const wanted = new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))
      for (const host of this.store.listHosts()) {
        if (host.tags?.some((t) => wanted.has(t.trim().toLowerCase()))) targets.add(host.id)
      }
    }
    return [...targets]
  }

  private async execute(runId: string, runbook: Runbook, state: ActiveRun): Promise<void> {
    this.send({ runId, kind: 'run-start' })
    let runOk = true

    for (const step of runbook.steps) {
      if (state.cancelled) break

      const targets = this.resolveTargets(step)

      // A step that resolves to nothing used to pass silently: an empty target
      // list made `every` vacuously true. With tag targeting that is a trap —
      // a typo in a tag, or the last host losing it, would report a clean run
      // of a change that reached no machine at all.
      if (targets.length === 0) {
        const detail = step.targetTags?.length
          ? `no hosts are tagged ${step.targetTags.join(' or ')}`
          : 'no target hosts'
        this.send({ runId, kind: 'step-start', stepId: step.id, hostIds: [] })
        this.send({ runId, kind: 'step-done', stepId: step.id, ok: false, error: detail })
        runOk = false
        if (!step.continueOnError) break
        continue
      }

      // Resolved here rather than at save time, so the renderer shows the hosts
      // this run actually touched rather than the ones named when it was written.
      this.send({ runId, kind: 'step-start', stepId: step.id, hostIds: targets })

      const runHost = (hostId: string): Promise<boolean> => this.runOnHost(runId, step, hostId, state)

      let results: boolean[]
      if (step.parallel) {
        results = await Promise.all(targets.map(runHost))
      } else {
        results = []
        for (const hostId of targets) {
          if (state.cancelled) break
          const ok = await runHost(hostId)
          results.push(ok)
          // sequential mode stops at the first failing host unless continue-on-error
          if (!ok && !step.continueOnError) break
        }
      }

      const stepOk = results.length === targets.length && results.every(Boolean)
      this.send({ runId, kind: 'step-done', stepId: step.id, ok: stepOk, cancelled: state.cancelled })
      if (!stepOk) {
        runOk = false
        if (!step.continueOnError) break
      }
    }

    // hard teardown: no SSH connection may outlive its run, regardless of how it ended
    for (const ch of state.channels) {
      try {
        ch.close()
      } catch {
        /* already closed */
      }
    }
    state.channels.clear()
    for (const c of state.clients) {
      try {
        c.end()
        // if the socket doesn't close gracefully within 3s, sever it
        setTimeout(() => {
          try {
            ;(c as unknown as { destroy?: () => void }).destroy?.()
          } catch {
            /* gone */
          }
        }, 3000)
      } catch {
        /* already gone */
      }
    }
    state.clients.clear()

    this.send({ runId, kind: 'run-done', ok: runOk && !state.cancelled, cancelled: state.cancelled })
    this.runs.delete(runId)
  }

  private runOnHost(runId: string, step: RunbookStep, hostId: string, state: ActiveRun): Promise<boolean> {
    return new Promise((resolve) => {
      const done = (ok: boolean, exitCode?: number, error?: string): void => {
        this.send({ runId, kind: 'host-done', stepId: step.id, hostId, exitCode, ok, error })
        resolve(ok)
      }

      this.send({ runId, kind: 'host-start', stepId: step.id, hostId })
      if (state.cancelled) return done(false, undefined, 'cancelled')

      this.ssh
        .connectForHost(hostId)
        .then(({ client }) => {
          state.clients.add(client)
          const finish = (ok: boolean, code?: number, error?: string): void => {
            state.clients.delete(client)
            client.end()
            done(ok, code, error)
          }
          if (state.cancelled) return finish(false, undefined, 'cancelled')

          // pty merges stderr and keeps tools that expect a terminal happy
          client.exec(wrapCommand(step), { pty: true }, (err, channel) => {
            if (err) return finish(false, undefined, err.message)
            state.channels.add(channel)

            let timer: NodeJS.Timeout | undefined
            if (step.timeoutSec && step.timeoutSec > 0) {
              timer = setTimeout(() => {
                this.send({
                  runId, kind: 'data', stepId: step.id, hostId,
                  data: `\r\n[termite] timeout after ${step.timeoutSec}s — closing channel\r\n`
                })
                channel.close()
              }, step.timeoutSec * 1000)
            }

            channel.on('data', (d: Buffer) =>
              this.send({ runId, kind: 'data', stepId: step.id, hostId, data: d.toString('utf8') })
            )
            channel.stderr?.on('data', (d: Buffer) =>
              this.send({ runId, kind: 'data', stepId: step.id, hostId, data: d.toString('utf8') })
            )
            channel.on('close', (code: number | null) => {
              if (timer) clearTimeout(timer)
              state.channels.delete(channel)
              const exit = code ?? (state.cancelled ? 130 : 0)
              finish(exit === 0 && !state.cancelled, exit, state.cancelled ? 'cancelled' : undefined)
            })
          })
        })
        .catch((err: Error) => {
          this.send({
            runId, kind: 'data', stepId: step.id, hostId,
            data: `\r\n[termite] connection failed: ${err.message}\r\n`
          })
          done(false, undefined, err.message)
        })
    })
  }
}
