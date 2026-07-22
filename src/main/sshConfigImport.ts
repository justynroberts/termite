import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { v4 as uuid } from 'uuid'
import type { Host } from '../shared/types'

/** Parse ~/.ssh/config into Host entries (best-effort, common directives only). */
export function importSSHConfig(): Host[] {
  const path = join(homedir(), '.ssh', 'config')
  if (!existsSync(path)) return []
  const lines = readFileSync(path, 'utf8').split(/\r?\n/)

  const hosts: Host[] = []
  let current: Partial<Host> & { pattern?: string } = {}

  const flush = (): void => {
    if (current.pattern && !current.pattern.includes('*') && !current.pattern.includes('?')) {
      hosts.push({
        id: uuid(),
        label: current.pattern,
        hostname: current.hostname ?? current.pattern,
        port: current.port ?? 22,
        username: current.username ?? '',
        authMethod: 'key',
        tags: ['imported'],
        group: 'Imported',
        createdAt: Date.now()
      })
    }
    current = {}
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^(\S+)\s+(?:=\s*)?(.+)$/)
    if (!match) continue
    const key = match[1].toLowerCase()
    const value = match[2].trim()
    if (key === 'host') {
      flush()
      current.pattern = value.split(/\s+/)[0]
    } else if (key === 'hostname') current.hostname = value
    else if (key === 'port') current.port = parseInt(value, 10) || 22
    else if (key === 'user') current.username = value
  }
  flush()
  return hosts
}
