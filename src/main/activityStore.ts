import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { v4 as uuid } from 'uuid'
import type { AuditEvent, SessionLogSummary } from '../shared/types'

export class ActivityStore {
  private readonly root = join(app.getPath('userData'), 'activity')
  private readonly logDir = join(this.root, 'sessions')
  private readonly indexPath = join(this.root, 'sessions.json')
  private readonly auditPath = join(this.root, 'audit.jsonl')
  private sessions: SessionLogSummary[]

  constructor() {
    mkdirSync(this.logDir, { recursive: true })
    try { this.sessions = JSON.parse(readFileSync(this.indexPath, 'utf8')) } catch { this.sessions = [] }
  }

  start(id: string, hostId: string, hostLabel: string): void {
    this.sessions.unshift({ id, hostId, hostLabel, startedAt: Date.now(), bytes: 0 })
    this.persist()
    this.audit('session.connect', hostLabel, undefined, 'ok')
  }

  append(id: string, text: string): void {
    appendFileSync(join(this.logDir, `${id}.log`), text, 'utf8')
    const item = this.sessions.find((entry) => entry.id === id)
    if (item) item.bytes += Buffer.byteLength(text)
  }

  end(id: string, outcome: AuditEvent['outcome'] = 'ok'): void {
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
    appendFileSync(this.auditPath, JSON.stringify({ id: uuid(), at: Date.now(), action, target, detail, outcome } satisfies AuditEvent) + '\n')
  }

  listAudit(query = ''): AuditEvent[] {
    if (!existsSync(this.auditPath)) return []
    const needle = query.trim().toLowerCase()
    return readFileSync(this.auditPath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as AuditEvent)
      .filter((item) => !needle || JSON.stringify(item).toLowerCase().includes(needle)).reverse().slice(0, 1000)
  }

  private persist(): void {
    writeFileSync(this.indexPath, JSON.stringify(this.sessions.slice(0, 2000), null, 2))
  }
}
