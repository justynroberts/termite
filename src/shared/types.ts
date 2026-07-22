// Shared types between main and renderer processes

export interface Host {
  id: string
  label: string
  hostname: string
  port: number
  username: string
  authMethod: 'password' | 'key' | 'agent'
  /** encrypted at rest, decrypted only in main process */
  password?: string
  keyId?: string
  group?: string
  tags: string[]
  color?: string
  jumpHostId?: string
  os?: 'linux' | 'macos' | 'windows' | 'unknown'
  notes?: string
  lastConnected?: number
  createdAt: number
}

export interface SSHKey {
  id: string
  name: string
  type: 'ed25519' | 'rsa'
  publicKey: string
  /** encrypted at rest */
  privateKey?: string
  passphrase?: string
  createdAt: number
}

export interface Snippet {
  id: string
  name: string
  command: string
  description?: string
  tags: string[]
  createdAt: number
}

export interface PortForward {
  id: string
  hostId: string
  type: 'local' | 'remote' | 'dynamic'
  label: string
  srcHost: string
  srcPort: number
  dstHost: string
  dstPort: number
  active?: boolean
}

export interface AppSettings {
  theme: 'dark' | 'light'
  fontSize: number
  fontFamily: string
  cursorStyle: 'block' | 'underline' | 'bar'
  cursorBlink: boolean
  scrollback: number
  aiEnabled: boolean
  /** stored encrypted */
  anthropicApiKey?: string
  aiModel: string
  terminalTheme: string
  confirmOnClose: boolean
  /** Windows 11 backdrop material (macOS always uses vibrancy) */
  windowEffect: 'mica' | 'acrylic' | 'solid'
  /** PuTTY-style: selecting text immediately copies it */
  copyOnSelect: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  fontSize: 13,
  fontFamily: `'JetBrains Mono', Consolas, monospace`,
  cursorStyle: 'block',
  cursorBlink: true,
  scrollback: 10000,
  aiEnabled: true,
  aiModel: 'claude-sonnet-5',
  terminalTheme: 'termite-dark',
  confirmOnClose: true,
  windowEffect: 'mica',
  copyOnSelect: false
}

export interface SessionInfo {
  sessionId: string
  hostId: string
  hostLabel: string
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  error?: string
}

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  isSymlink: boolean
  size: number
  mtime: number
  mode: number
  owner?: string
}

export interface TransferProgress {
  transferId: string
  kind: 'upload' | 'download'
  filename: string
  transferred: number
  total: number
  done: boolean
  error?: string
}

export interface KnownHost {
  host: string
  fingerprint: string
  addedAt: number
}

export interface AIRequest {
  kind: 'nl2cmd' | 'explain-error' | 'explain-output' | 'summarize' | 'chat'
  prompt: string
  /** recent terminal output for context */
  terminalContext?: string
  osHint?: string
}

export interface AIResponse {
  ok: boolean
  text?: string
  command?: string
  error?: string
}
