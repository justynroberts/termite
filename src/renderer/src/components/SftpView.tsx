import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import type { FileEntry } from '../../../shared/types'
import { formatBytes, formatDate, useApp, type Tab } from '../state'
import {
  IconArrowUp, IconDownload, IconFile, IconFolder, IconFolderPlus, IconHome,
  IconRefresh, IconTrash, IconUpload
} from '../icons'

interface Props {
  tab: Tab
  visible: boolean
}

type PaneSide = 'local' | 'remote'

interface PaneState {
  path: string
  entries: FileEntry[]
  selected: Set<string>
  loading: boolean
}

const emptyPane: PaneState = { path: '', entries: [], selected: new Set(), loading: true }

export default function SftpView({ tab, visible }: Props): JSX.Element {
  const { updateTab, toast } = useApp()
  const [local, setLocal] = useState<PaneState>({ ...emptyPane })
  const [remote, setRemote] = useState<PaneState>({ ...emptyPane })
  const sftpIdRef = useRef<string | null>(tab.sftpId ?? null)
  const startedRef = useRef(false)

  const loadLocal = useCallback(async (path: string) => {
    setLocal((p) => ({ ...p, loading: true }))
    try {
      const entries = await window.termite.fs.list(path)
      setLocal({ path, entries: sortEntries(entries), selected: new Set(), loading: false })
    } catch (err) {
      toast(`Cannot read ${path}: ${msg(err)}`, 'error')
      setLocal((p) => ({ ...p, loading: false }))
    }
  }, [toast])

  const loadRemote = useCallback(async (path: string) => {
    const sftpId = sftpIdRef.current
    if (!sftpId) return
    setRemote((p) => ({ ...p, loading: true }))
    try {
      const entries = await window.termite.sftp.list(sftpId, path)
      setRemote({ path, entries: sortEntries(entries), selected: new Set(), loading: false })
    } catch (err) {
      toast(`Cannot read ${path}: ${msg(err)}`, 'error')
      setRemote((p) => ({ ...p, loading: false }))
    }
  }, [toast])

  // connect once
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    ;(async () => {
      try {
        const home = await window.termite.fs.home()
        await loadLocal(home)
        const sftpId = await window.termite.sftp.open(tab.hostId)
        sftpIdRef.current = sftpId
        updateTab(tab.id, { sftpId, status: 'connected' })
        const remoteHome = await window.termite.sftp.home(sftpId)
        await loadRemote(remoteHome)
      } catch (err) {
        updateTab(tab.id, { status: 'error' })
        toast(`SFTP connection failed: ${msg(err)}`, 'error')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const download = async (): Promise<void> => {
    const sftpId = sftpIdRef.current
    if (!sftpId) return
    const items = remote.entries.filter((e) => remote.selected.has(e.path))
    if (!items.length) return toast('Select remote files to download', 'warn')
    for (const item of items) {
      const dest = joinLocal(local.path, item.name)
      try {
        await window.termite.sftp.download(sftpId, item.path, dest, item.isDirectory)
      } catch (err) {
        toast(`Download failed: ${msg(err)}`, 'error')
      }
    }
    await loadLocal(local.path)
  }

  const upload = async (): Promise<void> => {
    const sftpId = sftpIdRef.current
    if (!sftpId) return
    const items = local.entries.filter((e) => local.selected.has(e.path))
    if (!items.length) return toast('Select local files to upload', 'warn')
    for (const item of items) {
      const dest = joinRemote(remote.path, item.name)
      try {
        await window.termite.sftp.upload(sftpId, item.path, dest, item.isDirectory)
      } catch (err) {
        toast(`Upload failed: ${msg(err)}`, 'error')
      }
    }
    await loadRemote(remote.path)
  }

  const mkdirRemote = async (): Promise<void> => {
    const sftpId = sftpIdRef.current
    if (!sftpId) return
    const name = prompt('New remote folder name:')
    if (!name) return
    try {
      await window.termite.sftp.mkdir(sftpId, joinRemote(remote.path, name))
      await loadRemote(remote.path)
    } catch (err) {
      toast(`mkdir failed: ${msg(err)}`, 'error')
    }
  }

  const deleteRemote = async (): Promise<void> => {
    const sftpId = sftpIdRef.current
    if (!sftpId) return
    const items = remote.entries.filter((e) => remote.selected.has(e.path))
    if (!items.length) return
    if (!confirm(`Delete ${items.length} item(s) from the server? This cannot be undone.`)) return
    for (const item of items) {
      try {
        await window.termite.sftp.delete(sftpId, item.path, item.isDirectory && !item.isSymlink)
      } catch (err) {
        toast(`Delete failed: ${msg(err)}`, 'error')
      }
    }
    await loadRemote(remote.path)
  }

  return (
    <div className="sftp-view" style={{ display: visible ? 'flex' : 'none' }}>
      <Pane
        side="local"
        title="Local"
        state={local}
        setState={setLocal}
        navigate={loadLocal}
        parentPath={parentLocal}
        onHome={async () => loadLocal(await window.termite.fs.home())}
        actions={
          <button className="btn sm" onClick={upload} title="Upload selected to remote">
            <IconUpload size={13} /> Upload
          </button>
        }
      />
      <Pane
        side="remote"
        title={`Remote — ${tab.title.replace(' — files', '')}`}
        state={remote}
        setState={setRemote}
        navigate={loadRemote}
        parentPath={parentRemote}
        onHome={async () => {
          const sftpId = sftpIdRef.current
          if (sftpId) loadRemote(await window.termite.sftp.home(sftpId))
        }}
        actions={
          <>
            <button className="btn sm" onClick={download} title="Download selected to local">
              <IconDownload size={13} /> Download
            </button>
            <button className="icon-btn" onClick={mkdirRemote} title="New folder">
              <IconFolderPlus size={15} />
            </button>
            <button className="icon-btn danger" onClick={deleteRemote} title="Delete selected">
              <IconTrash size={14} />
            </button>
          </>
        }
      />
    </div>
  )
}

function Pane({
  side, title, state, setState, navigate, parentPath, onHome, actions
}: {
  side: PaneSide
  title: string
  state: PaneState
  setState: (fn: (p: PaneState) => PaneState) => void
  navigate: (path: string) => Promise<void>
  parentPath: (path: string) => string
  onHome: () => Promise<void>
  actions: JSX.Element
}): JSX.Element {
  const [pathDraft, setPathDraft] = useState<string | null>(null)

  const toggleSelect = (entry: FileEntry, e: React.MouseEvent): void => {
    setState((p) => {
      const selected = new Set(e.ctrlKey || e.metaKey ? p.selected : [])
      if (p.selected.has(entry.path) && (e.ctrlKey || e.metaKey)) selected.delete(entry.path)
      else selected.add(entry.path)
      return { ...p, selected }
    })
  }

  const open = (entry: FileEntry): void => {
    if (entry.isDirectory) void navigate(entry.path)
  }

  return (
    <div className="sftp-pane">
      <div className="sftp-toolbar">
        <span className="sftp-pane-title">{title}</span>
        <button className="icon-btn" title="Home" onClick={onHome}>
          <IconHome size={14} />
        </button>
        <button className="icon-btn" title="Up" onClick={() => navigate(parentPath(state.path))}>
          <IconArrowUp size={14} />
        </button>
        <button className="icon-btn" title="Refresh" onClick={() => navigate(state.path)}>
          <IconRefresh size={13} />
        </button>
        <div className="path-input">
          <input
            value={pathDraft ?? state.path}
            onChange={(e) => setPathDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && pathDraft) {
                void navigate(pathDraft)
                setPathDraft(null)
              }
              if (e.key === 'Escape') setPathDraft(null)
            }}
            onBlur={() => setPathDraft(null)}
            spellCheck={false}
          />
        </div>
        {actions}
      </div>
      <div className="file-list">
        {state.loading ? (
          <div style={{ padding: 20, color: 'var(--text-2)', fontSize: 12 }}>Loading…</div>
        ) : (
          <table className="file-table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="size">Size</th>
                <th className="mtime">Modified</th>
              </tr>
            </thead>
            <tbody>
              {state.entries.map((entry) => (
                <tr
                  key={entry.path}
                  className={state.selected.has(entry.path) ? 'selected' : ''}
                  onClick={(e) => toggleSelect(entry, e)}
                  onDoubleClick={() => open(entry)}
                >
                  <td>
                    <span className={`file-name ${entry.isDirectory ? 'dir' : ''}`}>
                      {entry.isDirectory ? <IconFolder size={14} /> : <IconFile size={14} />}
                      {entry.name}
                      {entry.isSymlink ? ' →' : ''}
                    </span>
                  </td>
                  <td className="size">{entry.isDirectory ? '—' : formatBytes(entry.size)}</td>
                  <td className="mtime">{formatDate(entry.mtime)}</td>
                </tr>
              ))}
              {state.entries.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ color: 'var(--text-2)', padding: 16 }}>
                    Empty directory
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function sortEntries(entries: FileEntry[]): FileEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

function parentLocal(path: string): string {
  const norm = path.replace(/[\\/]+$/, '')
  const idx = Math.max(norm.lastIndexOf('\\'), norm.lastIndexOf('/'))
  if (idx <= 0) return norm.includes('\\') || /^[A-Za-z]:/.test(norm) ? norm.slice(0, 3) : '/'
  const parent = norm.slice(0, idx)
  return /^[A-Za-z]:$/.test(parent) ? parent + '\\' : parent
}

function parentRemote(path: string): string {
  const norm = path.replace(/\/+$/, '')
  const idx = norm.lastIndexOf('/')
  return idx <= 0 ? '/' : norm.slice(0, idx)
}

function joinLocal(dir: string, name: string): string {
  const sep = dir.includes('\\') || /^[A-Za-z]:/.test(dir) ? '\\' : '/'
  return dir.replace(/[\\/]+$/, '') + sep + name
}

function joinRemote(dir: string, name: string): string {
  return (dir === '/' ? '' : dir.replace(/\/+$/, '')) + '/' + name
}

function msg(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
