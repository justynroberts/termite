import { app } from 'electron'
import { appendFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, type WriteStream } from 'fs'
import { join } from 'path'
import { hostname, userInfo } from 'os'
import { v4 as uuid } from 'uuid'
import type { AuditEvent, SessionLogSummary } from '../shared/types'

export class ActivityStore {
  private static readonly RETENTION_MS = 30 * 24 * 60 * 60 * 1000
  private readonly root = join(app.getPath('userData'), 'activity')
  private readonly logDir = join(this.root, 'sessions')
  private readonly indexPath = join(this.root, 'sessions.json')
  private readonly auditPath = join(this.root, 'audit.jsonl')
  private sessions: SessionLogSummary[]
  private readonly actor = `${userInfo().username}@${hostname()}`
  private lastAuditPrune = 0
  private readonly streams = new Map<string, WriteStream>()

  constructor() {
    mkdirSync(this.logDir, { recursive: true })
    try { this.sessions = JSON.parse(readFileSync(this.indexPath, 'utf8')) } catch { this.sessions = [] }
    this.pruneAudit()
  }

  start(id: string, hostId: string, hostLabel: string): void {
    this.sessions.unshift({ id, hostId, hostLabel, startedAt: Date.now(), bytes: 0 })
    this.persist()
    this.audit('session.connect', hostLabel, undefined, 'ok')
  }

  /**
   * Append to a session's transcript.
   *
   * Called for every chunk the remote sends, which for an interactive session
   * means once per echoed keystroke. It used to be `appendFileSync`, so each
   * character cost an open/write/close in the main process — on the same thread
   * that has to forward the byte to the renderer. Writes now go through a
   * per-session stream that buffers and flushes on its own.
   */
  append(id: string, text: string): void {
    let stream = this.streams.get(id)
    if (!stream) {
      stream = createWriteStream(join(this.logDir, `${id}.log`), { flags: 'a' })
      // A transcript that cannot be written is not worth taking the app down for.
      stream.on('error', () => this.streams.delete(id))
      this.streams.set(id, stream)
    }
    stream.write(text)
    const item = this.sessions.find((entry) => entry.id === id)
    if (item) item.bytes += Buffer.byteLength(text)
  }

  /** Close a session's transcript stream, flushing whatever is still buffered. */
  private closeStream(id: string): void {
    const stream = this.streams.get(id)
    if (!stream) return
    this.streams.delete(id)
    stream.end()
  }

  /** Flush every open transcript — called before the app quits. */
  flush(): void {
    for (const id of [...this.streams.keys()]) this.closeStream(id)
  }

  end(id: string, outcome: AuditEvent['outcome'] = 'ok'): void {
    this.closeStream(id)
    const item = this.sessions.find((entry) => entry.id === id)
    if (!item || item.endedAt) return
    item.endedAt = Date.now()
    this.persist()
    this.audit('session.disconnect', item.hostLabel, undefined, outcome)
  }

  list(query = ''): SessionLogSummary[] {
    const needle = query.trim().toLowerCase()
    return this.sessions.filter((item) => !needle || item.hostLabel.toLowerCase().includes(needle) || this.read(item.id).toLowerCase().includes(needle)).slice(0, 500)
  }

  read(id: string): string {
    const path = join(this.logDir, `${id}.log`)
    return existsSync(path) ? readFileSync(path, 'utf8') : ''
  }

  audit(action: string, target?: string, detail?: string, outcome: AuditEvent['outcome'] = 'info'): void {
    this.pruneAudit()
    appendFileSync(this.auditPath, JSON.stringify({ id: uuid(), at: Date.now(), actor: this.actor, action, target, detail, outcome } satisfies AuditEvent) + '\n')
  }

  listAudit(query = ''): AuditEvent[] {
    this.pruneAudit()
    if (!existsSync(this.auditPath)) return []
    const needle = query.trim().toLowerCase()
    return readFileSync(this.auditPath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as AuditEvent)
      .filter((item) => !needle || JSON.stringify(item).toLowerCase().includes(needle)).reverse().slice(0, 1000)
  }

  private persist(): void {
    writeFileSync(this.indexPath, JSON.stringify(this.sessions.slice(0, 2000), null, 2))
  }

  private pruneAudit(): void {
    const now = Date.now()
    if (now - this.lastAuditPrune < 60 * 60 * 1000) return
    this.lastAuditPrune = now
    if (!existsSync(this.auditPath)) return
    const cutoff = now - ActivityStore.RETENTION_MS
    const retained = readFileSync(this.auditPath, 'utf8').split(/\r?\n/).filter(Boolean).filter((line) => {
      try { return (JSON.parse(line) as AuditEvent).at >= cutoff } catch { return false }
    })
    writeFileSync(this.auditPath, retained.length ? `${retained.join('\n')}\n` : '')
  }
}
