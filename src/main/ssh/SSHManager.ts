import { Client, type ClientChannel, type ConnectConfig, type SFTPWrapper } from 'ssh2'
import { createHash } from 'crypto'
import { createServer, type Server, type Socket } from 'net'
import { EventEmitter } from 'events'
import { v4 as uuid } from 'uuid'
import type { Host, PortForward } from '../../shared/types'
import type { Store } from '../store'
import type { ActivityStore } from '../activityStore'

export interface ShellSession {
  sessionId: string
  hostId: string
  client: Client
  channel: ClientChannel
  /** ring buffer of recent output for AI context */
  recentOutput: string[]
}

export interface SftpSession {
  sftpId: string
  hostId: string
  client: Client
  sftp: SFTPWrapper
}

interface ActiveForward {
  forward: PortForward
  client: Client
  server?: Server
  sockets: Set<Socket>
}

export interface HostKeyPrompt {
  host: string
  fingerprint: string
  known?: string
}

/**
 * Owns all ssh2 connections. One Client per shell/sftp session (simple + robust);
 * jump hosts are chained via forwardOut.
 */
export class SSHManager extends EventEmitter {
  private shells = new Map<string, ShellSession>()
  private sftps = new Map<string, SftpSession>()
  private forwards = new Map<string, ActiveForward>()

  constructor(private store: Store, private activity?: ActivityStore) {
    super()
  }

  // ------------------------------------------------------------------
  // connection building
  // ------------------------------------------------------------------

  private async buildConfig(host: Host): Promise<ConnectConfig> {
    const cfg: ConnectConfig = {
      host: host.hostname,
      port: host.port || 22,
      username: host.username,
      readyTimeout: 20000,
      keepaliveInterval: 15000,
      keepaliveCountMax: 3,
      hostVerifier: (key: Buffer, verify: (ok: boolean) => void) => {
        this.verifyHostKey(host, key)
          .then(verify)
          .catch(() => verify(false))
      }
    }
    if (host.authMethod === 'password') {
      cfg.password = host.password ?? ''
      // also handle keyboard-interactive servers
      cfg.tryKeyboard = true
    } else if (host.authMethod === 'key' && host.keyId) {
      const key = this.store.getKeyRaw(host.keyId)
      if (!key?.privateKey) throw new Error(`SSH key not found for host ${host.label}`)
      cfg.privateKey = key.privateKey
      if (key.passphrase) cfg.passphrase = key.passphrase
    } else if (host.authMethod === 'agent') {
      cfg.agent = process.platform === 'win32' ? '\\\\.\\pipe\\openssh-ssh-agent' : process.env.SSH_AUTH_SOCK
    }
    return cfg
  }

  private async verifyHostKey(host: Host, key: Buffer): Promise<boolean> {
    const fingerprint = 'SHA256:' + createHash('sha256').update(key).digest('base64').replace(/=+$/, '')
    const id = `${host.hostname}:${host.port || 22}`
    const known = this.store.getKnownHost(id)
    if (!known) {
      // trust on first use, record it
      this.store.saveKnownHost({ host: id, fingerprint, addedAt: Date.now() })
      this.emit('hostkey:new', { host: id, fingerprint } satisfies HostKeyPrompt)
      return true
    }
    if (known.fingerprint === fingerprint) return true
    // mismatch — refuse and surface to UI
    this.emit('hostkey:mismatch', { host: id, fingerprint, known: known.fingerprint } satisfies HostKeyPrompt)
    return false
  }

  /** Connect a Client, chaining through the jump host if configured. */
  private connectClient(host: Host, depth = 0): Promise<Client> {
    if (depth > 3) return Promise.reject(new Error('Jump host chain too deep'))

    return new Promise((resolve, reject) => {
      const attempt = async (): Promise<void> => {
        const cfg = await this.buildConfig(host)
        const client = new Client()

        const onError = (err: Error): void => {
          client.removeAllListeners()
          reject(err)
        }

        client.on('keyboard-interactive', (_name, _instr, _lang, prompts, finish) => {
          // answer every prompt with the stored password (typical single-prompt case)
          finish(prompts.map(() => host.password ?? ''))
        })

        if (host.jumpHostId) {
          const jumpHost = this.store.getHostRaw(host.jumpHostId)
          if (!jumpHost) return reject(new Error('Jump host not found'))
          const jumpClient = await this.connectClient(jumpHost, depth + 1)
          jumpClient.forwardOut('127.0.0.1', 0, host.hostname, host.port || 22, (err, stream) => {
            if (err) {
              jumpClient.end()
              return reject(err)
            }
            client
              .on('ready', () => {
                client.removeListener('error', onError)
                client.on('close', () => jumpClient.end())
                resolve(client)
              })
              .on('error', onError)
              .connect({ ...cfg, sock: stream, host: undefined })
          })
        } else {
          client
            .on('ready', () => {
              client.removeListener('error', onError)
              resolve(client)
            })
            .on('error', onError)
            .connect(cfg)
        }
      }
      attempt().catch(reject)
    })
  }

  /** One-off client connection for a host (runbooks, ad-hoc exec). Caller must end() it. */
  async connectForHost(hostId: string): Promise<{ client: Client; host: Host }> {
    const host = this.store.getHostRaw(hostId)
    if (!host) throw new Error('Host not found')
    const client = await this.connectClient(host)
    return { client, host }
  }

  // ------------------------------------------------------------------
  // shell sessions
  // ------------------------------------------------------------------

  async openShell(hostId: string, cols: number, rows: number): Promise<string> {
    const host = this.store.getHostRaw(hostId)
    if (!host) throw new Error('Host not found')
    const sessionId = uuid()
    this.emit('session:status', { sessionId, hostId, hostLabel: host.label, status: 'connecting' })

    try {
      const client = await this.connectClient(host)
      const channel = await new Promise<ClientChannel>((resolve, reject) => {
        client.shell({ term: 'xterm-256color', cols, rows }, (err, stream) =>
          err ? reject(err) : resolve(stream)
        )
      })

      const session: ShellSession = { sessionId, hostId, client, channel, recentOutput: [] }
      this.shells.set(sessionId, session)
      this.store.touchHost(hostId)
      this.activity?.start(sessionId, hostId, host.label)

      channel.on('data', (data: Buffer) => {
        const text = data.toString('utf8')
        this.activity?.append(sessionId, text)
        session.recentOutput.push(text)
        // keep roughly the last 64KB for AI context
        while (session.recentOutput.reduce((n, s) => n + s.length, 0) > 65536) {
          session.recentOutput.shift()
        }
        this.emit('session:data', sessionId, data)
      })
      channel.stderr?.on('data', (data: Buffer) => this.emit('session:data', sessionId, data))
      channel.on('close', () => {
        this.activity?.end(sessionId)
        this.emit('session:status', { sessionId, hostId, hostLabel: host.label, status: 'disconnected' })
        this.shells.delete(sessionId)
        client.end()
      })
      client.on('error', (err) => {
        this.activity?.end(sessionId, 'error')
        this.emit('session:status', {
          sessionId, hostId, hostLabel: host.label, status: 'error', error: err.message
        })
      })

      this.emit('session:status', { sessionId, hostId, hostLabel: host.label, status: 'connected' })
      return sessionId
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.emit('session:status', { sessionId, hostId, hostLabel: host.label, status: 'error', error: message })
      throw new Error(message)
    }
  }

  write(sessionId: string, data: string): void {
    this.shells.get(sessionId)?.channel.write(data)
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.shells.get(sessionId)?.channel.setWindow(rows, cols, 0, 0)
  }

  closeShell(sessionId: string): void {
    const s = this.shells.get(sessionId)
    if (s) {
      s.channel.close()
      s.client.end()
      this.shells.delete(sessionId)
    }
  }

  getRecentOutput(sessionId: string): string {
    const s = this.shells.get(sessionId)
    if (!s) return ''
    return s.recentOutput.join('')
  }

  /** Run a one-off command on an existing session's host (new exec channel). */
  exec(sessionId: string, command: string, timeoutMs = 15000): Promise<{ stdout: string; stderr: string; code: number }> {
    const s = this.shells.get(sessionId)
    if (!s) return Promise.reject(new Error('Session not found'))
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('exec timeout')), timeoutMs)
      s.client.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer)
          return reject(err)
        }
        let stdout = ''
        let stderr = ''
        stream.on('data', (d: Buffer) => (stdout += d.toString()))
        stream.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
        stream.on('close', (code: number) => {
          clearTimeout(timer)
          resolve({ stdout, stderr, code: code ?? 0 })
        })
      })
    })
  }

  // ------------------------------------------------------------------
  // sftp
  // ------------------------------------------------------------------

  async openSftp(hostId: string): Promise<string> {
    const host = this.store.getHostRaw(hostId)
    if (!host) throw new Error('Host not found')
    const client = await this.connectClient(host)
    const sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
      client.sftp((err, s) => (err ? reject(err) : resolve(s)))
    })
    const sftpId = uuid()
    this.sftps.set(sftpId, { sftpId, hostId, client, sftp })
    client.on('close', () => this.sftps.delete(sftpId))
    return sftpId
  }

  getSftp(sftpId: string): SftpSession {
    const s = this.sftps.get(sftpId)
    if (!s) throw new Error('SFTP session not found')
    return s
  }

  closeSftp(sftpId: string): void {
    const s = this.sftps.get(sftpId)
    if (s) {
      s.client.end()
      this.sftps.delete(sftpId)
    }
  }

  // ------------------------------------------------------------------
  // port forwarding
  // ------------------------------------------------------------------

  async startForward(forward: PortForward): Promise<void> {
    if (this.forwards.has(forward.id)) throw new Error('Forward already active')
    const host = this.store.getHostRaw(forward.hostId)
    if (!host) throw new Error('Host not found')
    const client = await this.connectClient(host)
    const active: ActiveForward = { forward, client, sockets: new Set() }

    if (forward.type === 'local') {
      const server = createServer((socket) => {
        active.sockets.add(socket)
        socket.on('close', () => active.sockets.delete(socket))
        client.forwardOut(socket.remoteAddress ?? '127.0.0.1', socket.remotePort ?? 0,
          forward.dstHost, forward.dstPort, (err, stream) => {
            if (err) return socket.destroy()
            socket.pipe(stream).pipe(socket)
          })
      })
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(forward.srcPort, forward.srcHost || '127.0.0.1', () => resolve())
      })
      active.server = server
    } else if (forward.type === 'remote') {
      await new Promise<void>((resolve, reject) => {
        client.forwardIn(forward.srcHost || '0.0.0.0', forward.srcPort, (err) =>
          err ? reject(err) : resolve()
        )
      })
      client.on('tcp connection', (_info, accept) => {
        const stream = accept()
        const socket = new (require('net').Socket)()
        active.sockets.add(socket)
        socket.connect(forward.dstPort, forward.dstHost || '127.0.0.1', () => {
          stream.pipe(socket).pipe(stream)
        })
        socket.on('error', () => stream.close())
        socket.on('close', () => active.sockets.delete(socket))
      })
    } else {
      // dynamic: minimal SOCKS5 (no-auth, CONNECT only)
      const server = createServer((socket) => {
        active.sockets.add(socket)
        socket.on('close', () => active.sockets.delete(socket))
        socket.once('data', (greeting) => {
          if (greeting[0] !== 0x05) return socket.destroy()
          socket.write(Buffer.from([0x05, 0x00])) // no auth
          socket.once('data', (req) => {
            if (req[0] !== 0x05 || req[1] !== 0x01) return socket.destroy()
            let dstHost = ''
            let dstPort = 0
            const atyp = req[3]
            if (atyp === 0x01) {
              dstHost = `${req[4]}.${req[5]}.${req[6]}.${req[7]}`
              dstPort = req.readUInt16BE(8)
            } else if (atyp === 0x03) {
              const len = req[4]
              dstHost = req.subarray(5, 5 + len).toString('utf8')
              dstPort = req.readUInt16BE(5 + len)
            } else {
              // IPv6 unsupported in minimal impl
              socket.write(Buffer.from([0x05, 0x08, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
              return socket.destroy()
            }
            client.forwardOut('127.0.0.1', 0, dstHost, dstPort, (err, stream) => {
              if (err) {
                socket.write(Buffer.from([0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
                return socket.destroy()
              }
              socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
              socket.pipe(stream).pipe(socket)
            })
          })
        })
      })
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(forward.srcPort, forward.srcHost || '127.0.0.1', () => resolve())
      })
      active.server = server
    }

    this.forwards.set(forward.id, active)
    client.on('close', () => {
      this.stopForward(forward.id)
      this.emit('forward:closed', forward.id)
    })
  }

  stopForward(id: string): void {
    const active = this.forwards.get(id)
    if (!active) return
    active.server?.close()
    for (const sock of active.sockets) sock.destroy()
    active.client.end()
    this.forwards.delete(id)
  }

  listActiveForwards(): string[] {
    return [...this.forwards.keys()]
  }

  shutdown(): void {
    for (const id of [...this.shells.keys()]) this.closeShell(id)
    for (const id of [...this.sftps.keys()]) this.closeSftp(id)
    for (const id of [...this.forwards.keys()]) this.stopForward(id)
  }
}
