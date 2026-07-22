import { createReadStream, createWriteStream, promises as fsp } from 'fs'
import { basename, join as joinPath } from 'path'
import posix from 'path/posix'
import { v4 as uuid } from 'uuid'
import type { SFTPWrapper } from 'ssh2'
import type { FileEntry, TransferProgress } from '../../shared/types'

type ProgressFn = (p: TransferProgress) => void

export function sftpList(sftp: SFTPWrapper, path: string): Promise<FileEntry[]> {
  return new Promise((resolve, reject) => {
    sftp.readdir(path, (err, list) => {
      if (err) return reject(err)
      resolve(
        list.map((item) => {
          const mode = item.attrs.mode ?? 0
          return {
            name: item.filename,
            path: posix.join(path, item.filename),
            isDirectory: (mode & 0o170000) === 0o040000,
            isSymlink: (mode & 0o170000) === 0o120000,
            size: item.attrs.size ?? 0,
            mtime: (item.attrs.mtime ?? 0) * 1000,
            mode: mode & 0o7777
          }
        })
      )
    })
  })
}

export function sftpRealpath(sftp: SFTPWrapper, path: string): Promise<string> {
  return new Promise((resolve, reject) =>
    sftp.realpath(path, (err, abs) => (err ? reject(err) : resolve(abs)))
  )
}

export function sftpMkdir(sftp: SFTPWrapper, path: string): Promise<void> {
  return new Promise((resolve, reject) => sftp.mkdir(path, (err) => (err ? reject(err) : resolve())))
}

export function sftpRename(sftp: SFTPWrapper, from: string, to: string): Promise<void> {
  return new Promise((resolve, reject) => sftp.rename(from, to, (err) => (err ? reject(err) : resolve())))
}

export function sftpChmod(sftp: SFTPWrapper, path: string, mode: number): Promise<void> {
  return new Promise((resolve, reject) => sftp.chmod(path, mode, (err) => (err ? reject(err) : resolve())))
}

export async function sftpDelete(sftp: SFTPWrapper, path: string, isDirectory: boolean): Promise<void> {
  if (!isDirectory) {
    return new Promise((resolve, reject) => sftp.unlink(path, (err) => (err ? reject(err) : resolve())))
  }
  // recursive rmdir
  const entries = await sftpList(sftp, path)
  for (const entry of entries) {
    await sftpDelete(sftp, entry.path, entry.isDirectory && !entry.isSymlink)
  }
  return new Promise((resolve, reject) => sftp.rmdir(path, (err) => (err ? reject(err) : resolve())))
}

export function sftpStatSize(sftp: SFTPWrapper, path: string): Promise<number> {
  return new Promise((resolve, reject) =>
    sftp.stat(path, (err, stats) => (err ? reject(err) : resolve(stats.size ?? 0)))
  )
}

export async function sftpDownload(
  sftp: SFTPWrapper,
  remotePath: string,
  localPath: string,
  onProgress: ProgressFn
): Promise<void> {
  const transferId = uuid()
  const total = await sftpStatSize(sftp, remotePath)
  const filename = posix.basename(remotePath)
  let transferred = 0

  await new Promise<void>((resolve, reject) => {
    const rs = sftp.createReadStream(remotePath, { highWaterMark: 256 * 1024 })
    const ws = createWriteStream(localPath)
    let lastEmit = 0
    rs.on('data', (chunk: Buffer) => {
      transferred += chunk.length
      const now = Date.now()
      if (now - lastEmit > 100) {
        lastEmit = now
        onProgress({ transferId, kind: 'download', filename, transferred, total, done: false })
      }
    })
    rs.on('error', reject)
    ws.on('error', reject)
    ws.on('close', () => resolve())
    rs.pipe(ws)
  })
  onProgress({ transferId, kind: 'download', filename, transferred: total, total, done: true })
}

export async function sftpUpload(
  sftp: SFTPWrapper,
  localPath: string,
  remotePath: string,
  onProgress: ProgressFn
): Promise<void> {
  const transferId = uuid()
  const stat = await fsp.stat(localPath)
  const total = stat.size
  const filename = basename(localPath)
  let transferred = 0

  await new Promise<void>((resolve, reject) => {
    const rs = createReadStream(localPath, { highWaterMark: 256 * 1024 })
    const ws = sftp.createWriteStream(remotePath)
    let lastEmit = 0
    rs.on('data', (chunk: string | Buffer) => {
      transferred += chunk.length
      const now = Date.now()
      if (now - lastEmit > 100) {
        lastEmit = now
        onProgress({ transferId, kind: 'upload', filename, transferred, total, done: false })
      }
    })
    rs.on('error', reject)
    ws.on('error', reject)
    ws.on('close', () => resolve())
    rs.pipe(ws)
  })
  onProgress({ transferId, kind: 'upload', filename, transferred: total, total, done: true })
}

/** Recursively download a remote directory. */
export async function sftpDownloadDir(
  sftp: SFTPWrapper,
  remotePath: string,
  localPath: string,
  onProgress: ProgressFn
): Promise<void> {
  await fsp.mkdir(localPath, { recursive: true })
  const entries = await sftpList(sftp, remotePath)
  for (const entry of entries) {
    const local = joinPath(localPath, entry.name)
    if (entry.isDirectory && !entry.isSymlink) {
      await sftpDownloadDir(sftp, entry.path, local, onProgress)
    } else if (!entry.isDirectory) {
      await sftpDownload(sftp, entry.path, local, onProgress)
    }
  }
}

/** Recursively upload a local directory. */
export async function sftpUploadDir(
  sftp: SFTPWrapper,
  localPath: string,
  remotePath: string,
  onProgress: ProgressFn
): Promise<void> {
  await sftpMkdir(sftp, remotePath).catch(() => undefined) // may already exist
  const entries = await fsp.readdir(localPath, { withFileTypes: true })
  for (const entry of entries) {
    const local = joinPath(localPath, entry.name)
    const remote = posix.join(remotePath, entry.name)
    if (entry.isDirectory()) {
      await sftpUploadDir(sftp, local, remote, onProgress)
    } else if (entry.isFile()) {
      await sftpUpload(sftp, local, remote, onProgress)
    }
  }
}

/** List a local directory (for the local pane of the file browser). */
export async function localList(path: string): Promise<FileEntry[]> {
  const entries = await fsp.readdir(path, { withFileTypes: true })
  const results: FileEntry[] = []
  for (const entry of entries) {
    const full = joinPath(path, entry.name)
    try {
      const stat = await fsp.stat(full)
      results.push({
        name: entry.name,
        path: full,
        isDirectory: stat.isDirectory(),
        isSymlink: entry.isSymbolicLink(),
        size: stat.size,
        mtime: stat.mtimeMs,
        mode: stat.mode & 0o7777
      })
    } catch {
      // permission denied etc — still show the name
      results.push({
        name: entry.name,
        path: full,
        isDirectory: entry.isDirectory(),
        isSymlink: entry.isSymbolicLink(),
        size: 0,
        mtime: 0,
        mode: 0
      })
    }
  }
  return results
}
