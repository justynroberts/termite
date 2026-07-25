import { useEffect, useState, type JSX } from 'react'

interface AppInfo {
  version: string
  electron: string
  node: string
  platform: string
}

export default function AboutModal({ onClose }: { onClose: () => void }): JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    window.termite.appInfo().then(setInfo)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop">
      <div className="modal about-modal">
        <div className="about-logo">🐜</div>
        <div className="about-name">Termite</div>
        <div className="about-tagline">The AI-first SSH client</div>
        <div className="about-version">
          v{info?.version ?? '…'}
          {info && <span className="about-runtime"> · Electron {info.electron} · Node {info.node}</span>}
        </div>
        <div className="about-rows">
          <div>
            Written by <a href="mailto:justyn@fintonlabs.com">justyn@fintonlabs.com</a>
          </div>
          <div>Released under the MIT License</div>
          <div className="about-enjoy">Enjoy! 🎉</div>
        </div>
        <div className="modal-footer" style={{ justifyContent: 'center' }}>
          <button className="btn primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
