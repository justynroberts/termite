import { contextBridge, ipcRenderer } from 'electron'
import type {
  AIRequest, AIResponse, AppSettings, FileEntry, Host, PortForward,
  Runbook, RunbookEvent, SSHKey, SessionInfo, Snippet, TransferProgress
} from '../shared/types'

export interface TermiteAPI {
  hosts: {
    list(): Promise<Host[]>
    save(host: Host): Promise<void>
    delete(id: string): Promise<void>
    importSSHConfig(): Promise<number>
  }
  keys: {
    list(): Promise<SSHKey[]>
    save(key: SSHKey): Promise<void>
    delete(id: string): Promise<void>
    generate(type: 'ed25519' | 'rsa', name: string): Promise<{ id: string; publicKey: string }>
    importFile(name: string): Promise<{ id: string } | null>
  }
  snippets: {
    list(): Promise<Snippet[]>
    save(s: Snippet): Promise<void>
    delete(id: string): Promise<void>
  }
  settings: {
    get(): Promise<AppSettings>
    save(s: AppSettings): Promise<void>
  }
  ssh: {
    connect(hostId: string, cols: number, rows: number): Promise<string>
    write(sessionId: string, data: string): void
    resize(sessionId: string, cols: number, rows: number): void
    disconnect(sessionId: string): Promise<void>
    trustHostKey(host: string, fingerprint: string): Promise<void>
    onData(sessionId: string, cb: (data: string) => void): () => void
    onStatus(cb: (info: SessionInfo) => void): () => void
    onHostKeyMismatch(cb: (info: { host: string; fingerprint: string; known?: string }) => void): () => void
  }
  sftp: {
    open(hostId: string): Promise<string>
    close(sftpId: string): Promise<void>
    home(sftpId: string): Promise<string>
    list(sftpId: string, path: string): Promise<FileEntry[]>
    mkdir(sftpId: string, path: string): Promise<void>
    rename(sftpId: string, from: string, to: string): Promise<void>
    chmod(sftpId: string, path: string, mode: number): Promise<void>
    delete(sftpId: string, path: string, isDirectory: boolean): Promise<void>
    download(sftpId: string, remotePath: string, localPath: string, isDirectory: boolean): Promise<void>
    upload(sftpId: string, localPath: string, remotePath: string, isDirectory: boolean): Promise<void>
    onProgress(cb: (p: TransferProgress) => void): () => void
  }
  fs: {
    home(): Promise<string>
    list(path: string): Promise<FileEntry[]>
    reveal(path: string): Promise<void>
    pickSaveDir(): Promise<string | null>
    pickFiles(): Promise<string[]>
  }
  forwards: {
    list(): Promise<{ saved: PortForward[]; active: string[] }>
    save(f: PortForward): Promise<void>
    delete(id: string): Promise<void>
    start(id: string): Promise<void>
    stop(id: string): Promise<void>
    onClosed(cb: (id: string) => void): () => void
  }
  runbooks: {
    list(): Promise<Runbook[]>
    save(r: Runbook): Promise<void>
    delete(id: string): Promise<void>
    run(id: string): Promise<string>
    cancel(runId: string): Promise<void>
    onEvent(cb: (ev: RunbookEvent) => void): () => void
  }
  ai: {
    run(req: AIRequest, sessionId?: string): Promise<AIResponse>
  }
  windowFx: {
    capabilities(): Promise<{ material: boolean; platform: string }>
    setMaterial(effect: 'mica' | 'acrylic' | 'solid'): Promise<void>
    setOverlay(symbolColor: string): Promise<void>
    setFullscreen(on: boolean): Promise<void>
  }
  clipboard: {
    readText(): string
    writeText(text: string): void
  }
  appInfo(): Promise<{ version: string; electron: string; node: string; platform: string }>
  openExternal(url: string): Promise<void>
  platform: string
}

function sub(channel: string, cb: (...args: unknown[]) => void): () => void {
  const listener = (_e: unknown, ...args: unknown[]): void => cb(...args)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: TermiteAPI = {
  hosts: {
    list: () => ipcRenderer.invoke('hosts:list'),
    save: (host) => ipcRenderer.invoke('hosts:save', host),
    delete: (id) => ipcRenderer.invoke('hosts:delete', id),
    importSSHConfig: () => ipcRenderer.invoke('hosts:import-ssh-config')
  },
  keys: {
    list: () => ipcRenderer.invoke('keys:list'),
    save: (key) => ipcRenderer.invoke('keys:save', key),
    delete: (id) => ipcRenderer.invoke('keys:delete', id),
    generate: (type, name) => ipcRenderer.invoke('keys:generate', type, name),
    importFile: (name) => ipcRenderer.invoke('keys:import-file', name)
  },
  snippets: {
    list: () => ipcRenderer.invoke('snippets:list'),
    save: (s) => ipcRenderer.invoke('snippets:save', s),
    delete: (id) => ipcRenderer.invoke('snippets:delete', id)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (s) => ipcRenderer.invoke('settings:save', s)
  },
  ssh: {
    connect: (hostId, cols, rows) => ipcRenderer.invoke('ssh:connect', hostId, cols, rows),
    write: (sessionId, data) => ipcRenderer.send('ssh:write', sessionId, data),
    resize: (sessionId, cols, rows) => ipcRenderer.send('ssh:resize', sessionId, cols, rows),
    disconnect: (sessionId) => ipcRenderer.invoke('ssh:disconnect', sessionId),
    trustHostKey: (host, fingerprint) => ipcRenderer.invoke('ssh:trust-hostkey', host, fingerprint),
    onData: (sessionId, cb) => sub(`ssh:data:${sessionId}`, cb as (...args: unknown[]) => void),
    onStatus: (cb) => sub('ssh:status', cb as (...args: unknown[]) => void),
    onHostKeyMismatch: (cb) => sub('ssh:hostkey-mismatch', cb as (...args: unknown[]) => void)
  },
  sftp: {
    open: (hostId) => ipcRenderer.invoke('sftp:open', hostId),
    close: (sftpId) => ipcRenderer.invoke('sftp:close', sftpId),
    home: (sftpId) => ipcRenderer.invoke('sftp:home', sftpId),
    list: (sftpId, path) => ipcRenderer.invoke('sftp:list', sftpId, path),
    mkdir: (sftpId, path) => ipcRenderer.invoke('sftp:mkdir', sftpId, path),
    rename: (sftpId, from, to) => ipcRenderer.invoke('sftp:rename', sftpId, from, to),
    chmod: (sftpId, path, mode) => ipcRenderer.invoke('sftp:chmod', sftpId, path, mode),
    delete: (sftpId, path, isDirectory) => ipcRenderer.invoke('sftp:delete', sftpId, path, isDirectory),
    download: (sftpId, remotePath, localPath, isDirectory) =>
      ipcRenderer.invoke('sftp:download', sftpId, remotePath, localPath, isDirectory),
    upload: (sftpId, localPath, remotePath, isDirectory) =>
      ipcRenderer.invoke('sftp:upload', sftpId, localPath, remotePath, isDirectory),
    onProgress: (cb) => sub('transfer:progress', cb as (...args: unknown[]) => void)
  },
  fs: {
    home: () => ipcRenderer.invoke('fs:home'),
    list: (path) => ipcRenderer.invoke('fs:list', path),
    reveal: (path) => ipcRenderer.invoke('fs:reveal', path),
    pickSaveDir: () => ipcRenderer.invoke('fs:pick-save-dir'),
    pickFiles: () => ipcRenderer.invoke('fs:pick-files')
  },
  forwards: {
    list: () => ipcRenderer.invoke('forwards:list'),
    save: (f) => ipcRenderer.invoke('forwards:save', f),
    delete: (id) => ipcRenderer.invoke('forwards:delete', id),
    start: (id) => ipcRenderer.invoke('forwards:start', id),
    stop: (id) => ipcRenderer.invoke('forwards:stop', id),
    onClosed: (cb) => sub('forward:closed', cb as (...args: unknown[]) => void)
  },
  runbooks: {
    list: () => ipcRenderer.invoke('runbooks:list'),
    save: (r) => ipcRenderer.invoke('runbooks:save', r),
    delete: (id) => ipcRenderer.invoke('runbooks:delete', id),
    run: (id) => ipcRenderer.invoke('runbooks:run', id),
    cancel: (runId) => ipcRenderer.invoke('runbooks:cancel', runId),
    onEvent: (cb) => sub('runbook:event', cb as (...args: unknown[]) => void)
  },
  ai: {
    run: (req, sessionId) => ipcRenderer.invoke('ai:run', req, sessionId)
  },
  windowFx: {
    capabilities: () => ipcRenderer.invoke('window:capabilities'),
    setMaterial: (effect) => ipcRenderer.invoke('window:set-material', effect),
    setOverlay: (symbolColor) => ipcRenderer.invoke('window:set-overlay', symbolColor),
    setFullscreen: (on) => ipcRenderer.invoke('window:set-fullscreen', on)
  },
  clipboard: {
    readText: () => ipcRenderer.sendSync('clipboard:read'),
    writeText: (text) => ipcRenderer.send('clipboard:write', text)
  },
  appInfo: () => ipcRenderer.invoke('app:info'),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  platform: process.platform
}

contextBridge.exposeInMainWorld('termite', api)
