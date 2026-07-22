import { useEffect, useState, type JSX } from 'react'
import { useApp } from '../state'
import { IconCopy, IconKey, IconPlus, IconTrash } from '../icons'

export default function KeysPanel(): JSX.Element {
  const { keys, refreshKeys, toast } = useApp()
  const [showNew, setShowNew] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<'ed25519' | 'rsa'>('ed25519')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!showNew) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setShowNew(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showNew])

  const generate = async (): Promise<void> => {
    if (!name.trim()) return
    setBusy(true)
    try {
      await window.termite.keys.generate(type, name.trim())
      await refreshKeys()
      setShowNew(false)
      setName('')
      toast(`Key "${name.trim()}" generated`)
    } catch (err) {
      toast(`Key generation failed: ${err instanceof Error ? err.message : err}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const importKey = async (): Promise<void> => {
    const result = await window.termite.keys.importFile('')
    if (result) {
      await refreshKeys()
      toast('Key imported')
    }
  }

  const copyPublic = async (publicKey: string): Promise<void> => {
    await navigator.clipboard.writeText(publicKey)
    toast('Public key copied — paste it into ~/.ssh/authorized_keys on your server')
  }

  const remove = async (id: string, keyName: string): Promise<void> => {
    if (!confirm(`Delete key "${keyName}"? Hosts using it will fail to connect.`)) return
    await window.termite.keys.delete(id)
    await refreshKeys()
  }

  return (
    <>
      <div className="sidebar-header">
        <span className="sidebar-title">SSH Keys</span>
        <div style={{ display: 'flex', gap: 2 }}>
          <button className="icon-btn" title="Import private key file" onClick={importKey}>
            <IconKey size={14} />
          </button>
          <button className="icon-btn" title="Generate new key" onClick={() => setShowNew(true)}>
            <IconPlus size={16} />
          </button>
        </div>
      </div>
      <div className="sidebar-body">
        {keys.length === 0 && (
          <div style={{ padding: '20px 10px', color: 'var(--text-2)', fontSize: 12, textAlign: 'center' }}>
            No keys yet. Generate an ed25519 key and copy its public half to your servers.
          </div>
        )}
        {keys.map((k) => (
          <div key={k.id} className="panel-list-item">
            <IconKey size={16} />
            <div className="info">
              <div className="name">{k.name}</div>
              <div className="meta">
                <span className="badge green">{k.type}</span>{' '}
                {k.publicKey ? k.publicKey.slice(0, 34) + '…' : 'imported (no public line)'}
              </div>
            </div>
            <div className="actions">
              {k.publicKey && (
                <button className="icon-btn" title="Copy public key" onClick={() => copyPublic(k.publicKey)}>
                  <IconCopy size={14} />
                </button>
              )}
              <button className="icon-btn danger" title="Delete" onClick={() => remove(k.id, k.name)}>
                <IconTrash size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
      {showNew && (
        <div className="modal-backdrop">
          <div className="modal" style={{ width: 420 }}>
            <div className="modal-header">Generate SSH key</div>
            <div className="modal-body">
              <div className="form-grid">
                <label>Name</label>
                <input type="text" value={name} placeholder="work-laptop" onChange={(e) => setName(e.target.value)} autoFocus />
                <label>Type</label>
                <select value={type} onChange={(e) => setType(e.target.value as 'ed25519' | 'rsa')}>
                  <option value="ed25519">ed25519 (recommended)</option>
                  <option value="rsa">RSA 4096</option>
                </select>
              </div>
              <div className="hint" style={{ marginTop: 12 }}>
                The private key is stored encrypted with your OS keychain. After generating, copy the
                public key into <code className="inline">~/.ssh/authorized_keys</code> on your servers.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setShowNew(false)}>Cancel</button>
              <button className="btn primary" onClick={generate} disabled={!name.trim() || busy}>
                {busy ? 'Generating…' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
