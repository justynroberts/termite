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
  /** Non-secret KEY=value lines applied after shell connection. */
  environment?: string
  /** Command or script sent after the environment is applied. */
  startupCommand?: string
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
  /** Check GitHub Releases for a newer build in the background */
  autoUpdate: boolean
  /** Left panel collapsed, giving the width back to the terminal */
  sidebarHidden: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  fontSize: 13,
  fontFamily: `'JetBrains Mono', 'Symbols Nerd Font Mono', 'Symbols Nerd Font', 'JetBrainsMono Nerd Font', 'JetBrainsMono NF', Consolas, monospace`,
  cursorStyle: 'block',
  cursorBlink: true,
  scrollback: 10000,
  aiEnabled: true,
  aiModel: 'claude-sonnet-4-5-20250929',
  terminalTheme: 'termite-dark',
  confirmOnClose: true,
  windowEffect: 'mica',
  copyOnSelect: false,
  autoUpdate: true,
  sidebarHidden: false
}

/** Outcome of an explicit "check for updates" from Settings. */
export interface UpdateCheck {
  status: 'up-to-date' | 'available' | 'downloading' | 'unsupported' | 'error'
  version?: string
  message?: string
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

export interface SessionLogSummary {
  id: string
  hostId: string
  hostLabel: string
  startedAt: number
  endedAt?: number
  bytes: number
}

export interface AuditEvent {
  id: string
  at: number
  actor?: string
  action: string
  target?: string
  detail?: string
  outcome: 'ok' | 'error' | 'info'
}

// ---- runbooks: multi-host, multi-step command orchestration ----

export interface RunbookStep {
  id: string
  name: string
  /** shell script; runs via exec with a pty on each target host */
  command: string
  /** target hosts for this step, named individually */
  hostIds: string[]
  /**
   * Target every host carrying any of these tags, resolved when the run starts
   * rather than when the runbook is saved — so a host tagged `production`
   * tomorrow is included without editing the runbook. Combined with `hostIds`.
   */
  targetTags?: string[]
  /** run across hosts concurrently (true) or one host at a time (false) */
  parallel: boolean
  /** keep going to the next step even if a host fails */
  continueOnError: boolean
  /** kill the command after N seconds (0/undefined = no timeout) */
  timeoutSec?: number
  /**
   * Interpreter on the remote host. 'default' = the SSH user's login shell
   * (bash/sh on Linux/macOS, cmd/PowerShell on Windows OpenSSH).
   * 'bash' wraps in bash -lc; 'powershell' uses -EncodedCommand (quote-safe).
   */
  shell?: 'default' | 'bash' | 'powershell'
}

export interface Runbook {
  id: string
  name: string
  description?: string
  steps: RunbookStep[]
  createdAt: number
}

export interface RunbookEvent {
  runId: string
  kind:
    | 'run-start'
    | 'step-start'
    | 'host-start'
    | 'data'
    | 'host-done'
    | 'step-done'
    | 'run-done'
  stepId?: string
  hostId?: string
  /** the hosts a step actually resolved to (kind: step-start) */
  hostIds?: string[]
  /** terminal output chunk (kind: data) */
  data?: string
  /** exit code (kind: host-done) */
  exitCode?: number
  /** step/run success (kind: step-done | run-done) */
  ok?: boolean
  error?: string
  cancelled?: boolean
}

export interface AIRequest {
  kind: 'nl2cmd' | 'explain-error' | 'explain-output' | 'summarize' | 'chat' | 'draft-runbook' | 'explain-run'
  prompt: string
  /** recent terminal output for context */
  terminalContext?: string
  osHint?: string
  /** bounded conversation history for the active host/session */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  hostLabel?: string
}

export interface AIResponse {
  ok: boolean
  text?: string
  command?: string
  error?: string
}
