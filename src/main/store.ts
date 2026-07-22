import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { AppSettings, Host, KnownHost, PortForward, SSHKey, Snippet } from '../shared/types'
import { DEFAULT_SETTINGS } from '../shared/types'

interface StoreShape {
  hosts: Host[]
  keys: SSHKey[]
  snippets: Snippet[]
  forwards: PortForward[]
  knownHosts: KnownHost[]
  settings: AppSettings
}

const EMPTY: StoreShape = {
  hosts: [],
  keys: [],
  snippets: [],
  forwards: [],
  knownHosts: [],
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
