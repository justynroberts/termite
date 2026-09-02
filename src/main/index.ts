import { app, BrowserWindow, Menu, clipboard, ipcMain, shell } from 'electron'
import { release } from 'os'
import { join } from 'path'
import { Store } from './store'
import { SSHManager } from './ssh/SSHManager'
import { registerIpc } from './ipc'
import { ActivityStore } from './activityStore'
import { setupUpdates } from './updater'

let mainWindow: BrowserWindow | null = null
let splashWindow: BrowserWindow | null = null
let store: Store
let ssh: SSHManager
let activity: ActivityStore

const isMac = process.platform === 'darwin'
const isWin = process.platform === 'win32'
// Mica/Acrylic need Windows 11 (build 22000+)
const winBuild = isWin ? parseInt(release().split('.')[2] ?? '0', 10) : 0
export const supportsMaterial = isWin && winBuild >= 22000

function createSplash(): void {
  splashWindow = new BrowserWindow({
    width: 360,
    height: 220,
    frame: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    show: true,
    transparent: true,
    skipTaskbar: true,
    center: true,
    webPreferences: { sandbox: true }
  })
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;background:transparent}
    body{display:grid;place-items:center;font-family:"Segoe UI Variable",Inter,sans-serif;color:#f3f7fb}
    main{width:344px;height:204px;display:grid;place-items:center;align-content:center;gap:10px;
      border:1px solid rgba(255,255,255,.13);border-radius:22px;background:rgba(13,17,23,.96);
      box-shadow:0 22px 70px rgba(0,0,0,.48)}
    .mark{width:58px;height:58px;display:grid;place-items:center;border-radius:17px;
      background:linear-gradient(145deg,#15b981,#087c5a);box-shadow:0 12px 34px rgba(16,185,129,.25);font-size:31px}
    h1{font-size:25px;line-height:1;margin:2px 0 0;letter-spacing:-.6px}p{margin:0;color:#91a1b5;font-size:12px}
    .load{width:72px;height:3px;margin-top:7px;border-radius:9px;overflow:hidden;background:#23303d}
    .load:after{content:"";display:block;width:34px;height:100%;border-radius:9px;background:#10b981;animation:a 1s ease-in-out infinite alternate}
    @keyframes a{from{transform:translateX(-16px)}to{transform:translateX(54px)}}
  </style></head><body><main><div class="mark">🐜</div><h1>Termite</h1><p>A terminal built for productivity</p><div class="load"></div></main></body></html>`
  void splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  splashWindow.on('closed', () => (splashWindow = null))
}

function createWindow(): void {
  const effect = store.getSettings().windowEffect ?? 'mica'
  const useMaterial = supportsMaterial && effect !== 'solid'

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    // transparent chrome: material provides the backdrop on Win11; vibrancy on macOS
    ...(useMaterial ? { backgroundMaterial: effect as 'mica' | 'acrylic' } : { backgroundColor: '#0d1117' }),
    ...(isMac ? { vibrancy: 'under-window' as const, visualEffectState: 'active' as const } : {}),
    titleBarStyle: 'hidden',
    ...(isWin
      ? { titleBarOverlay: { color: '#00000000', symbolColor: '#9fb0c3', height: 38 } }
      : {}),
    trafficLightPosition: isMac ? { x: 14, y: 12 } : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  /**
   * Hold the splash a little past ready-to-show. The window is usually ready
   * quickly enough that the splash is a flash rather than a screen, which reads
   * as a glitch; the extra beat lets it actually be seen.
   */
  const SPLASH_LINGER = 4000

  mainWindow.on('ready-to-show', () => {
    setTimeout(() => {
      splashWindow?.close()
      mainWindow?.show()
    }, SPLASH_LINGER)
  })
  mainWindow.on('closed', () => (mainWindow = null))

  // open external links in the OS browser, never in-app
  const openExternal = (url: string): void => {
    if (/^(https?:|mailto:)/i.test(url)) void shell.openExternal(url)
  }
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url)
    return { action: 'deny' }
  })
  // anchor clicks (mailto:, plain hrefs) must never navigate the app window
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (process.env['ELECTRON_RENDERER_URL'] && url.startsWith(process.env['ELECTRON_RENDERER_URL'])) return
    e.preventDefault()
    openExternal(url)
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Windows/Linux: the default menu's Ctrl+C/Ctrl+V accelerators swallow terminal
  // keystrokes (xterm selections aren't DOM selections, so "Copy" copies nothing).
  // macOS keeps its menu — Cmd+C/V in regular inputs needs it there.
  if (!isMac) Menu.setApplicationMenu(null)

  store = new Store()
  activity = new ActivityStore()
  ssh = new SSHManager(store, activity)
  const { getUpdateActivity } = registerIpc(store, ssh, activity, () => mainWindow)

  // clipboard lives in the main process — bulletproof on every platform.
  // read is sync (paste needs the text immediately in the key handler).
  ipcMain.on('clipboard:read', (e) => {
    e.returnValue = clipboard.readText()
  })
  ipcMain.on('clipboard:write', (_e, text: string) => clipboard.writeText(text ?? ''))

  // A renderer that throws has no console anyone will see. Put it on stderr,
  // where the dev server and a terminal-launched build both show it.
  ipcMain.on(
    'app:report-error',
    (
      _e,
      report: { message: string; stack: string; componentStack: string; source: string }
    ) => {
      console.error(
        `[renderer:${report.source}] ${report.message}\n${report.stack}${report.componentStack}`
      )
    }
  )

  ipcMain.handle('shell:open-external', (_e, url: string) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
  })
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    platform: process.platform
  }))

  // window chrome effects (Win11 Mica/Acrylic, native controls overlay tinting)
  ipcMain.handle('window:capabilities', () => ({
    material: supportsMaterial,
    platform: process.platform
  }))
  ipcMain.handle('window:set-material', (_e, effect: 'mica' | 'acrylic' | 'solid') => {
    if (!mainWindow || !supportsMaterial) return
    if (effect === 'solid') {
      mainWindow.setBackgroundMaterial('none')
      mainWindow.setBackgroundColor('#0d1117')
    } else {
      mainWindow.setBackgroundMaterial(effect)
    }
  })
  ipcMain.handle('window:set-fullscreen', (_e, on: boolean) => {
    mainWindow?.setFullScreen(on)
  })
  ipcMain.handle('window:set-overlay', (_e, symbolColor: string) => {
    if (mainWindow && isWin) {
      try {
        mainWindow.setTitleBarOverlay({ color: '#00000000', symbolColor, height: 38 })
      } catch {
        /* older Windows */
      }
    }
  })

  createSplash()
  createWindow()

  // After the window exists: the updater attaches a focus listener to it, and
  // every dialog it raises is modal to it.
  setupUpdates({
    getWindow: () => mainWindow,
    getActivity: getUpdateActivity,
    isEnabled: () => store.getSettings().autoUpdate
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  ssh?.shutdown()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  ssh?.shutdown()
  // transcripts are buffered now, so the tail would be lost on a hard exit
  activity?.flush()
})
