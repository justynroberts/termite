import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { AppSettings, Host, KnownHost, PortForward, Runbook, SSHKey, Snippet } from '../shared/types'
import { DEFAULT_SETTINGS } from '../shared/types'

interface StoreShape {
  hosts: Host[]
  keys: SSHKey[]
  snippets: Snippet[]
  forwards: PortForward[]
  knownHosts: KnownHost[]
  runbooks: Runbook[]
  runbooksSeeded?: boolean
  settings: AppSettings
}

const EMPTY: StoreShape = {
  hosts: [],
  keys: [],
  snippets: [],
  forwards: [],
  knownHosts: [],
  runbooks: [],
  settings: { ...DEFAULT_SETTINGS }
}

/** Fields encrypted at rest with the OS keychain (DPAPI on Windows, Keychain on macOS). */
const ENC_PREFIX = 'enc:v1:'

function encrypt(plain: string): string {
  if (!plain) return plain
  if (safeStorage.isEncryptionAvailable()) {
    return ENC_PREFIX + safeStorage.encryptString(plain).toString('base64')
  }
  return plain
}

function decrypt(value: string | undefined): string | undefined {
  if (!value) return value
  if (value.startsWith(ENC_PREFIX) && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(value.slice(ENC_PREFIX.length), 'base64'))
    } catch {
      return undefined
    }
  }
  return value
}

export class Store {
  private data: StoreShape
  private file: string

  constructor() {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.file = join(dir, 'termite-store.json')
    this.data = this.load()
    this.seedSampleRunbooks()
  }

  /** One-time starter runbooks — safe maintenance/diagnostic templates (no hosts assigned). */
  private seedSampleRunbooks(): void {
    if (this.data.runbooksSeeded) return
    const step = (
      name: string, command: string,
      opts: { parallel?: boolean; continueOnError?: boolean; timeoutSec?: number } = {}
    ): import('../shared/types').RunbookStep => ({
      id: `seed-${Math.random().toString(36).slice(2, 10)}`,
      name,
      command,
      hostIds: [],
      parallel: opts.parallel ?? true,
      continueOnError: opts.continueOnError ?? false,
      timeoutSec: opts.timeoutSec,
      shell: 'default'
    })

    const samples: Runbook[] = [
      {
        id: 'sample-health-check',
        name: 'Health check',
        description: 'Read-only fleet snapshot: load, disk, memory, failed services',
        createdAt: Date.now(),
        steps: [
          step('Uptime & load', 'uptime && echo --- && free -h 2>/dev/null || vm_stat', { continueOnError: true }),
          step('Disk usage', 'df -h | grep -vE "tmpfs|devfs|overlay"', { continueOnError: true }),
          step('Failed services', 'systemctl --failed --no-pager 2>/dev/null || echo "(no systemd)"', { continueOnError: true })
        ]
      },
      {
        id: 'sample-apt-update',
        name: 'System update (apt)',
        description: 'Debian/Ubuntu: check, apply security-safe upgrades one host at a time, verify',
        createdAt: Date.now(),
        steps: [
          step('Pre-check: disk & pending updates', 'df -h / && sudo -n apt-get update -qq && apt list --upgradable 2>/dev/null | head -25', { timeoutSec: 180 }),
          step('Apply upgrades (rolling)', 'sudo -n DEBIAN_FRONTEND=noninteractive apt-get upgrade -y', { parallel: false, timeoutSec: 1200 }),
          step('Verify', 'uname -r && (test -f /var/run/reboot-required && cat /var/run/reboot-required) || echo "No reboot required"', { continueOnError: true })
        ]
      },
      {
        id: 'sample-yum-update',
        name: 'System update (dnf/yum)',
        description: 'RHEL/Fedora/Amazon Linux: check, apply updates one host at a time, verify',
        createdAt: Date.now(),
        steps: [
          step('Pre-check: disk & pending updates', 'df -h / && (sudo -n dnf -q check-update || sudo -n yum -q check-update || true) | head -25', { timeoutSec: 300 }),
          step('Apply updates (rolling)', 'sudo -n dnf upgrade -y 2>/dev/null || sudo -n yum update -y', { parallel: false, timeoutSec: 1800 }),
          step('Verify', 'uname -r && (command -v needs-restarting >/dev/null && sudo -n needs-restarting -r || echo "reboot check unavailable")', { continueOnError: true })
        ]
      },
      {
        id: 'sample-docker-prune',
        name: 'Docker cleanup (safe prune)',
        description: 'Reclaim space: stopped containers, dangling images, unused networks/build cache',
        createdAt: Date.now(),
        steps: [
          step('Before: usage', 'docker system df', { timeoutSec: 60 }),
          step('Prune (no volumes, no in-use images)', 'docker system prune -f', { parallel: false, timeoutSec: 600 }),
          step('After: usage', 'docker system df', { continueOnError: true })
        ]
      }
    ]

    // don't duplicate if the user already made runbooks with these ids
    const existing = new Set(this.data.runbooks.map((r) => r.id))
    for (const s of samples) if (!existing.has(s.id)) this.data.runbooks.push(s)
    this.data.runbooksSeeded = true
    this.persist()
  }

  private load(): StoreShape {
    try {
      if (existsSync(this.file)) {
        const parsed = JSON.parse(readFileSync(this.file, 'utf8'))
        return { ...EMPTY, ...parsed, settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) } }
      }
    } catch (err) {
      console.error('store load failed', err)
    }
    return structuredClone(EMPTY)
  }

  private persist(): void {
    writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8')
  }

  // ---- hosts ----
  listHosts(): Host[] {
    // never leak encrypted blobs to renderer; strip secrets
    return this.data.hosts.map((h) => ({ ...h, password: h.password ? '•••' : undefined }))
  }

  getHostRaw(id: string): Host | undefined {
    const h = this.data.hosts.find((x) => x.id === id)
    if (!h) return undefined
    return { ...h, password: decrypt(h.password) }
  }

  saveHost(host: Host): void {
    const idx = this.data.hosts.findIndex((h) => h.id === host.id)
    const prev = idx >= 0 ? this.data.hosts[idx] : undefined
    const stored = { ...host }
    // '•••' sentinel means "unchanged"
    if (stored.password === '•••' && prev) stored.password = prev.password
    else if (stored.password) stored.password = encrypt(stored.password)
    if (idx >= 0) this.data.hosts[idx] = stored
    else this.data.hosts.push(stored)
    this.persist()
  }

  deleteHost(id: string): void {
    this.data.hosts = this.data.hosts.filter((h) => h.id !== id)
    this.persist()
  }

  touchHost(id: string): void {
    const h = this.data.hosts.find((x) => x.id === id)
    if (h) {
      h.lastConnected = Date.now()
      this.persist()
    }
  }

  // ---- keys ----
  listKeys(): SSHKey[] {
    return this.data.keys.map((k) => ({ ...k, privateKey: undefined, passphrase: undefined }))
  }

  getKeyRaw(id: string): SSHKey | undefined {
    const k = this.data.keys.find((x) => x.id === id)
    if (!k) return undefined
    return { ...k, privateKey: decrypt(k.privateKey), passphrase: decrypt(k.passphrase) }
  }

  saveKey(key: SSHKey): void {
    const stored = { ...key }
    if (stored.privateKey) stored.privateKey = encrypt(stored.privateKey)
    if (stored.passphrase) stored.passphrase = encrypt(stored.passphrase)
    const idx = this.data.keys.findIndex((k) => k.id === key.id)
    if (idx >= 0) {
      // keep existing secrets if not re-supplied
      if (!key.privateKey) stored.privateKey = this.data.keys[idx].privateKey
      if (!key.passphrase) stored.passphrase = this.data.keys[idx].passphrase
      this.data.keys[idx] = stored
    } else this.data.keys.push(stored)
    this.persist()
  }

  deleteKey(id: string): void {
    this.data.keys = this.data.keys.filter((k) => k.id !== id)
    this.persist()
  }

  // ---- snippets ----
  listSnippets(): Snippet[] {
    return this.data.snippets
  }

  saveSnippet(s: Snippet): void {
    const idx = this.data.snippets.findIndex((x) => x.id === s.id)
    if (idx >= 0) this.data.snippets[idx] = s
    else this.data.snippets.push(s)
    this.persist()
  }

  deleteSnippet(id: string): void {
    this.data.snippets = this.data.snippets.filter((s) => s.id !== id)
    this.persist()
  }

  // ---- runbooks ----
  listRunbooks(): Runbook[] {
    return this.data.runbooks
  }

  getRunbook(id: string): Runbook | undefined {
    return this.data.runbooks.find((r) => r.id === id)
  }

  saveRunbook(r: Runbook): void {
    const idx = this.data.runbooks.findIndex((x) => x.id === r.id)
    if (idx >= 0) this.data.runbooks[idx] = r
    else this.data.runbooks.push(r)
    this.persist()
  }

  deleteRunbook(id: string): void {
    this.data.runbooks = this.data.runbooks.filter((r) => r.id !== id)
    this.persist()
  }

  // ---- forwards ----
  listForwards(): PortForward[] {
    return this.data.forwards
  }

  saveForward(f: PortForward): void {
    const idx = this.data.forwards.findIndex((x) => x.id === f.id)
    if (idx >= 0) this.data.forwards[idx] = f
    else this.data.forwards.push(f)
    this.persist()
  }

  deleteForward(id: string): void {
    this.data.forwards = this.data.forwards.filter((f) => f.id !== id)
    this.persist()
  }

  // ---- known hosts ----
  listKnownHosts(): KnownHost[] {
    return [...this.data.knownHosts].sort((a, b) => a.host.localeCompare(b.host))
  }

  getKnownHost(host: string): KnownHost | undefined {
    return this.data.knownHosts.find((k) => k.host === host)
  }

  saveKnownHost(entry: KnownHost): void {
    const idx = this.data.knownHosts.findIndex((k) => k.host === entry.host)
    if (idx >= 0) this.data.knownHosts[idx] = entry
    else this.data.knownHosts.push(entry)
    this.persist()
  }

  removeKnownHost(host: string): void {
    this.data.knownHosts = this.data.knownHosts.filter((k) => k.host !== host)
    this.persist()
  }

  // ---- settings ----
  getSettings(): AppSettings {
    const s = { ...this.data.settings }
    // migrate pre-0.4 font stacks so Nerd Font fallbacks apply without re-picking
    if (s.fontFamily && !s.fontFamily.includes('Nerd Font')) {
      const legacyDefaults = [
        'Cascadia Code, Menlo, Consolas, monospace',
        `'JetBrains Mono', Consolas, monospace`
      ]
      if (legacyDefaults.includes(s.fontFamily)) {
        s.fontFamily = DEFAULT_SETTINGS.fontFamily
        this.data.settings.fontFamily = s.fontFamily
        this.persist()
      }
    }
    // renderer gets a masked key indicator only
    if (s.anthropicApiKey) s.anthropicApiKey = '•••'
    return s
  }

  getApiKey(): string | undefined {
    return decrypt(this.data.settings.anthropicApiKey)
  }

  saveSettings(settings: AppSettings): void {
    const stored = { ...settings }
    if (stored.anthropicApiKey === '•••') {
      stored.anthropicApiKey = this.data.settings.anthropicApiKey
    } else if (stored.anthropicApiKey) {
      stored.anthropicApiKey = encrypt(stored.anthropicApiKey)
    }
    this.data.settings = stored
    this.persist()
  }
}
