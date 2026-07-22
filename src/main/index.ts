import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { release } from 'os'
import { join } from 'path'
import { Store } from './store'
import { SSHManager } from './ssh/SSHManager'
import { registerIpc } from './ipc'

let mainWindow: BrowserWindow | null = null
let store: Store
let ssh: SSHManager

const isMac = process.platform === 'darwin'
const isWin = process.platform === 'win32'
// Mica/Acrylic need Windows 11 (build 22000+)
const winBuild = isWin ? parseInt(release().split('.')[2] ?? '0', 10) : 0
export const supportsMaterial = isWin && winBuild >= 22000

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

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => (mainWindow = null))

  // open external links in the OS browser, never in-app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  store = new Store()
  ssh = new SSHManager(store)
  registerIpc(store, ssh, () => mainWindow)

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

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  ssh?.shutdown()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => ssh?.shutdown())
