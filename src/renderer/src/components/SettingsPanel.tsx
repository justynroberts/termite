import { useEffect, useState, type JSX } from 'react'
import type { AppSettings } from '../../../shared/types'
import { useApp } from '../state'
import { TERMINAL_FONTS, TERMINAL_THEMES } from '../themes'

export default function SettingsPanel(): JSX.Element {
  const { settings, saveSettings, toast } = useApp()
  const [form, setForm] = useState<AppSettings>(settings)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!dirty) setForm(settings)
  }, [settings, dirty])

  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]): void => {
    setForm((f) => ({ ...f, [k]: v }))
    setDirty(true)
  }

  const save = async (): Promise<void> => {
    await saveSettings(form)
    setDirty(false)
    toast('Settings saved')
  }

  return (
    <div className="settings-page">
      <div className="settings-section">
        <h3>Appearance</h3>
        <div className="form-grid">
          <label>App theme</label>
          <select value={form.theme} onChange={(e) => set('theme', e.target.value as AppSettings['theme'])}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
          <label>Window effect</label>
          <div>
            <select
              value={form.windowEffect}
              onChange={(e) => set('windowEffect', e.target.value as AppSettings['windowEffect'])}
            >
              <option value="mica">Mica — subtle desktop tint (Windows 11)</option>
              <option value="acrylic">Acrylic — frosted glass blur</option>
              <option value="solid">Solid — no transparency</option>
            </select>
            <div className="hint">
              Applies instantly on Windows 11. macOS always uses native vibrancy; older Windows falls
              back to solid.
            </div>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--text-1)', marginBottom: 8 }}>Terminal theme</div>
          <div className="theme-grid">
            {TERMINAL_THEMES.map((t) => (
              <button
                key={t.id}
                className={`theme-card ${form.terminalTheme === t.id ? 'selected' : ''}`}
                style={{ background: t.theme.background }}
                onClick={() => set('terminalTheme', t.id)}
                title={t.name}
              >
                <span className="theme-sample" style={{ color: t.theme.foreground }}>
                  <span style={{ color: t.theme.green }}>❯</span> ls -la
                </span>
                <span className="theme-dots">
                  {[t.theme.red, t.theme.green, t.theme.yellow, t.theme.blue, t.theme.magenta, t.theme.cyan].map(
                    (c, i) => (
                      <span key={i} style={{ background: c }} />
                    )
                  )}
                </span>
                <span className="theme-name" style={{ color: t.theme.foreground }}>
                  {t.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h3>Terminal</h3>
        <div className="form-grid">
          <label>Font</label>
          <select
            value={form.fontFamily}
            onChange={(e) => set('fontFamily', e.target.value)}
          >
            {TERMINAL_FONTS.map((f) => (
              <option key={f.name} value={f.stack}>
                {f.name}{f.ligatures ? '  (ligatures)' : ''}
              </option>
            ))}
            {!TERMINAL_FONTS.some((f) => f.stack === form.fontFamily) && (
              <option value={form.fontFamily}>Custom: {form.fontFamily}</option>
            )}
          </select>
          <label>Preview</label>
          <div
            className="font-preview"
            style={{ fontFamily: form.fontFamily, fontSize: form.fontSize }}
          >
            ❯ echo "0O 1lI ={'>'} !== 3.14" &amp;&amp; exit
          </div>
          <label>Font size</label>
          <input type="number" value={form.fontSize} min={9} max={24} onChange={(e) => set('fontSize', parseInt(e.target.value, 10) || 13)} />
          <label>Cursor</label>
          <select value={form.cursorStyle} onChange={(e) => set('cursorStyle', e.target.value as AppSettings['cursorStyle'])}>
            <option value="block">Block</option>
            <option value="underline">Underline</option>
            <option value="bar">Bar</option>
          </select>
          <label>Cursor blink</label>
          <div className="checkbox-row">
            <input type="checkbox" checked={form.cursorBlink} onChange={(e) => set('cursorBlink', e.target.checked)} />
          </div>
          <label>Scrollback</label>
          <input type="number" value={form.scrollback} min={1000} max={100000} step={1000} onChange={(e) => set('scrollback', parseInt(e.target.value, 10) || 10000)} />
        </div>
      </div>

      <div className="settings-section">
        <h3>AI — Claude</h3>
        <div className="form-grid">
          <label>Enable AI</label>
          <div className="checkbox-row">
            <input type="checkbox" checked={form.aiEnabled} onChange={(e) => set('aiEnabled', e.target.checked)} />
            <span className="hint">AI copilot panel, natural-language commands, error explanations</span>
          </div>
          <label>API key</label>
          <input
            type="password"
            value={form.anthropicApiKey ?? ''}
            placeholder="sk-ant-…"
            onChange={(e) => set('anthropicApiKey', e.target.value)}
          />
          <label>Model</label>
          <select value={form.aiModel} onChange={(e) => set('aiModel', e.target.value)}>
            <option value="claude-sonnet-5">Claude Sonnet 5 (recommended)</option>
            <option value="claude-opus-4-8">Claude Opus 4.8 (most capable)</option>
            <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (fastest)</option>
          </select>
        </div>
        <div className="hint" style={{ marginTop: 8 }}>
          Your key is stored encrypted with the OS keychain and only ever sent to the Anthropic API.
          Get a key at <span className="mono select-text">console.anthropic.com</span>.
        </div>
      </div>

      <div className="settings-section">
        <h3>Behavior</h3>
        <div className="form-grid">
          <label>Confirm close</label>
          <div className="checkbox-row">
            <input type="checkbox" checked={form.confirmOnClose} onChange={(e) => set('confirmOnClose', e.target.checked)} />
            <span className="hint">Ask before closing a tab with an active connection</span>
          </div>
        </div>
      </div>

      <button className="btn primary" onClick={save} disabled={!dirty}>
        Save settings
      </button>
    </div>
  )
}
