import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { homedir } from 'os'
import { readFileSync } from 'fs'
import { v4 as uuid } from 'uuid'
import type { AIRequest, AppSettings, Host, PortForward, SSHKey, Snippet } from '../shared/types'
import { Store } from './store'
import { SSHManager } from './ssh/SSHManager'
import {
  localList, sftpChmod, sftpDelete, sftpDownload, sftpDownloadDir, sftpList,
  sftpMkdir, sftpRealpath, sftpRename, sftpUpload, sftpUploadDir
} from './ssh/sftpOps'
import { generateSSHKey } from './keygen'
import { runAI } from './ai'
import { importSSHConfig } from './sshConfigImport'

export function registerIpc(store: Store, ssh: SSHManager, getWindow: () => BrowserWindow | null): void {
  const send = (channel: string, ...args: unknown[]): void => {
    getWindow()?.webContents.send(channel, ...args)
  }

  // relay ssh manager events to renderer
  ssh.on('session:data', (sessionId: string, data: Buffer) => send(`ssh:data:${sessionId}`, data.toString('utf8')))
  ssh.on('session:status', (info) => send('ssh:status', info))
  ssh.on('hostkey:new', (info) => send('ssh:hostkey-new', info))
  ssh.on('hostkey:mismatch', (info) => send('ssh:hostkey-mismatch', info))
  ssh.on('forward:closed', (id) => send('forward:closed', id))

  // ---- hosts ----
  ipcMain.handle('hosts:list', () => store.listHosts())
  ipcMain.handle('hosts:save', (_e, host: Host) => store.saveHost(host))
  ipcMain.handle('hosts:delete', (_e, id: string) => store.deleteHost(id))
  ipcMain.handle('hosts:import-ssh-config', () => {
    const imported = importSSHConfig()
    const existing = new Set(store.listHosts().map((h) => `${h.hostname}:${h.port}:${h.username}`))
    let added = 0
    for (const host of imported) {
      if (!existing.has(`${host.hostname}:${host.port}:${host.username}`)) {
        store.saveHost(host)
        added++
      }
    }
    return added
  })

  // ---- keys ----
  ipcMain.handle('keys:list', () => store.listKeys())
  ipcMain.handle('keys:save', (_e, key: SSHKey) => store.saveKey(key))
  ipcMain.handle('keys:delete', (_e, id: string) => store.deleteKey(id))
  ipcMain.handle('keys:generate', (_e, type: 'ed25519' | 'rsa', name: string) => {
    const generated = generateSSHKey(type, `${name}@termite`)
    const key: SSHKey = {
      id: uuid(),
      name,
      type,
      publicKey: generated.publicKey,
      privateKey: generated.privateKey,
      createdAt: Date.now()
    }
    store.saveKey(key)
    return { id: key.id, publicKey: key.publicKey }
  })
  ipcMain.handle('keys:import-file', async (_e, name: string) => {
    const win = getWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: 'Select private key file',
      defaultPath: homedir(),
      properties: ['openFile', 'showHiddenFiles']
    })
    if (result.canceled || !result.filePaths[0]) return null
    const privateKey = readFileSync(result.filePaths[0], 'utf8')
    const key: SSHKey = {
      id: uuid(),
      name: name || result.filePaths[0].split(/[\\/]/).pop() || 'imported',
      type: privateKey.includes('OPENSSH') ? 'ed25519' : 'rsa',
      publicKey: '',
      privateKey,
      createdAt: Date.now()
    }
    store.saveKey(key)
    return { id: key.id }
  })

  // ---- snippets ----
  ipcMain.handle('snippets:list', () => store.listSnippets())
  ipcMain.handle('snippets:save', (_e, s: Snippet) => store.saveSnippet(s))
  ipcMain.handle('snippets:delete', (_e, id: string) => store.deleteSnippet(id))

  // ---- settings ----
  ipcMain.handle('settings:get', () => store.getSettings())
  ipcMain.handle('settings:save', (_e, s: AppSettings) => store.saveSettings(s))

  // ---- ssh shell ----
  ipcMain.handle('ssh:connect', async (_e, hostId: string, cols: number, rows: number) => {
    return ssh.openShell(hostId, cols, rows)
  })
  ipcMain.on('ssh:write', (_e, sessionId: string, data: string) => ssh.write(sessionId, data))
  ipcMain.on('ssh:resize', (_e, sessionId: string, cols: number, rows: number) => ssh.resize(sessionId, cols, rows))
  ipcMain.handle('ssh:disconnect', (_e, sessionId: string) => ssh.closeShell(sessionId))
  ipcMain.handle('ssh:trust-hostkey', (_e, host: string, fingerprint: string) => {
    store.saveKnownHost({ host, fingerprint, addedAt: Date.now() })
  })

  // ---- sftp ----
  ipcMain.handle('sftp:open', (_e, hostId: string) => ssh.openSftp(hostId))
  ipcMain.handle('sftp:close', (_e, sftpId: string) => ssh.closeSftp(sftpId))
  ipcMain.handle('sftp:home', async (_e, sftpId: string) => {
    const { sftp } = ssh.getSftp(sftpId)
    return sftpRealpath(sftp, '.')
  })
  ipcMain.handle('sftp:list', async (_e, sftpId: string, path: string) => {
    const { sftp } = ssh.getSftp(sftpId)
    return sftpList(sftp, path)
  })
  ipcMain.handle('sftp:mkdir', async (_e, sftpId: string, path: string) => {
    const { sftp } = ssh.getSftp(sftpId)
    return sftpMkdir(sftp, path)
  })
  ipcMain.handle('sftp:rename', async (_e, sftpId: string, from: string, to: string) => {
    const { sftp } = ssh.getSftp(sftpId)
    return sftpRename(sftp, from, to)
  })
  ipcMain.handle('sftp:chmod', async (_e, sftpId: string, path: string, mode: number) => {
    const { sftp } = ssh.getSftp(sftpId)
    return sftpChmod(sftp, path, mode)
  })
  ipcMain.handle('sftp:delete', async (_e, sftpId: string, path: string, isDirectory: boolean) => {
    const { sftp } = ssh.getSftp(sftpId)
    return sftpDelete(sftp, path, isDirectory)
  })
  ipcMain.handle('sftp:download', async (_e, sftpId: string, remotePath: string, localPath: string, isDirectory: boolean) => {
    const { sftp } = ssh.getSftp(sftpId)
    const onProgress = (p: unknown): void => send('transfer:progress', p)
    if (isDirectory) return sftpDownloadDir(sftp, remotePath, localPath, onProgress)
    return sftpDownload(sftp, remotePath, localPath, onProgress)
  })
  ipcMain.handle('sftp:upload', async (_e, sftpId: string, localPath: string, remotePath: string, isDirectory: boolean) => {
    const { sftp } = ssh.getSftp(sftpId)
    const onProgress = (p: unknown): void => send('transfer:progress', p)
    if (isDirectory) return sftpUploadDir(sftp, localPath, remotePath, onProgress)
    return sftpUpload(sftp, localPath, remotePath, onProgress)
  })

  // ---- local fs (for the local pane) ----
  ipcMain.handle('fs:home', () => homedir())
  ipcMain.handle('fs:list', (_e, path: string) => localList(path))
  ipcMain.handle('fs:reveal', (_e, path: string) => shell.showItemInFolder(path))
  ipcMain.handle('fs:pick-save-dir', async () => {
    const win = getWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle('fs:pick-files', async () => {
    const win = getWindow()
    if (!win) return []
    const result = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'] })
    return result.canceled ? [] : result.filePaths
  })

  // ---- port forwards ----
  ipcMain.handle('forwards:list', () => ({
    saved: store.listForwards(),
    active: ssh.listActiveForwards()
  }))
  ipcMain.handle('forwards:save', (_e, f: PortForward) => store.saveForward(f))
  ipcMain.handle('forwards:delete', (_e, id: string) => {
    ssh.stopForward(id)
    store.deleteForward(id)
  })
  ipcMain.handle('forwards:start', async (_e, id: string) => {
    const f = store.listForwards().find((x) => x.id === id)
    if (!f) throw new Error('Forward not found')
    await ssh.startForward(f)
  })
  ipcMain.handle('forwards:stop', (_e, id: string) => ssh.stopForward(id))

  // ---- AI ----
  ipcMain.handle('ai:run', async (_e, req: AIRequest, sessionId?: string) => {
    if (sessionId && !req.terminalContext) {
      req.terminalContext = ssh.getRecentOutput(sessionId)
    }
    return runAI(store, req)
  })
}
