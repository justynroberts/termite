// Renders the Termite icon to build/icon.png using Electron offscreen.
// Run: npx electron build/gen-icon.mjs
import { app, BrowserWindow } from 'electron'
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const html = `<!doctype html><html><body style="margin:0">
<div id="icon" style="width:512px;height:512px;position:relative;
  background:linear-gradient(135deg,#10241c 0%,#0d1117 55%,#101c2c 100%);
  border-radius:96px;overflow:hidden;font-family:'Segoe UI Emoji','Apple Color Emoji',sans-serif">
  <div style="position:absolute;inset:0;background:
    radial-gradient(circle at 30% 25%, rgba(52,211,153,0.28), transparent 55%),
    radial-gradient(circle at 75% 80%, rgba(96,165,250,0.18), transparent 50%)"></div>
  <div style="position:absolute;top:96px;left:70px;font-size:150px;font-weight:700;
    color:#34d399;font-family:Consolas,monospace;text-shadow:0 0 40px rgba(52,211,153,0.6)">❯</div>
  <div style="position:absolute;top:118px;left:180px;width:150px;height:26px;border-radius:13px;
    background:#34d399;opacity:.9;box-shadow:0 0 30px rgba(52,211,153,.55)"></div>
  <div style="position:absolute;bottom:52px;right:60px;font-size:200px;
    filter:drop-shadow(0 10px 24px rgba(0,0,0,.55))">🐜</div>
</div></body></html>`

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 512, height: 512, show: false,
    frame: false, transparent: true,
    webPreferences: { offscreen: true }
  })
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  await new Promise((r) => setTimeout(r, 700)) // let emoji font settle
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 })
  writeFileSync(join(__dirname, 'icon.png'), image.toPNG())
  console.log('icon written:', join(__dirname, 'icon.png'), image.getSize())
  app.exit(0)
})
