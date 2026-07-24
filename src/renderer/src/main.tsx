import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AppStateProvider } from './state'
// bundled fonts (work offline, packaged with the app)
import '@fontsource-variable/inter'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/700.css'
import '@fontsource/fira-code/400.css'
import '@fontsource/fira-code/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/700.css'
import '@fontsource/source-code-pro/400.css'
import '@fontsource/source-code-pro/700.css'
import './styles.css'

function render(): void {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <AppStateProvider>
        <App />
      </AppStateProvider>
    </React.StrictMode>
  )
}

// ensure the symbols font is in the atlas before any terminal renders,
// otherwise xterm caches tofu boxes for icon glyphs
document.fonts
  .load("12px 'Symbols Nerd Font Mono'")
  .catch(() => undefined)
  .finally(render)
