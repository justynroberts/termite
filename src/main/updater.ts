// MIT License - Copyright (c) fintonlabs.com
import { app, BrowserWindow, dialog, shell } from 'electron'
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import electronUpdater from 'electron-updater'
import type { UpdateCheck } from '../shared/types'

/**
 * Checks GitHub Releases for a newer Termite and offers to install it.
 *
 * Downloading in the background is fine — it costs the user nothing and makes
 * accepting instant. Restarting is not: it drops every live SSH session, so the
 * install always waits for an answer, and the answer is asked for at a moment
 * that is safe to interrupt.
 */

const { autoUpdater } = electronUpdater

const RELEASES = 'https://github.com/justynroberts/termite/releases'

/**
 * Updates fail where nobody can see them.
 *
 * A packaged app has no console, so an update that downloads and then refuses to
 * install leaves the user with a dialog that does nothing and no way to say why.
 * Everything the updater reports goes to a file next to the app's other logs.
 */
const logPath = join(app.getPath('logs'), 'updater.log')

function note(message: string): void {
  const line = `${new Date().toISOString()} ${message}\n`
  try {
    mkdirSync(app.getPath('logs'), { recursive: true })
    appendFileSync(logPath, line)
  } catch {
    // Logging must never be the thing that breaks an update.
  }
  console.log(`[update] ${message}`)
}

autoUpdater.logger = {
  info: (m: unknown) => note(`info  ${String(m)}`),
  warn: (m: unknown) => note(`warn  ${String(m)}`),
  error: (m: unknown) => note(`error ${String(m)}`),
  debug: (m: unknown) => note(`debug ${String(m)}`)
}

/** How long after launch to look, so it never competes with starting up. */
const FIRST_CHECK_DELAY = 8_000
/**
 * And then every couple of hours. Daily sounds harmless and is not: a release
 * published while the app is open would go unnoticed until tomorrow, so "it
 * didn't update" becomes the expected behaviour rather than a fault.
 */
const RECHECK_INTERVAL = 2 * 60 * 60 * 1000
/** Never check more often than this, however many times focus changes. */
const MIN_GAP = 20 * 60 * 1000
/**
 * How long to wait before deciding `quitAndInstall` did nothing. Installing
 * genuinely takes a few seconds; warning inside that window calls a working
 * update broken.
 */
const INSTALL_GRACE = 25_000

/**
 * Whether this copy can replace itself, and why not when it can't.
 *
 * Two builds of Termite cannot self-install, and both fail *after* downloading
 * the whole release — so the check has to happen before the download, not as an
 * error handler afterwards:
 *
 * - **The portable Windows .exe.** There is no installer to hand over to; NSIS
 *   updates apply to an installed copy. electron-builder marks a portable build
 *   with `PORTABLE_EXECUTABLE_FILE`.
 * - **An unsigned macOS build**, which is what CI produces today. Squirrel.Mac
 *   refuses to swap an app whose new signature does not satisfy the running
 *   app's designated requirement, and an ad-hoc signature has no identity to
 *   satisfy it with. Adding a Developer ID to the release workflow turns this
 *   on by itself — nothing here needs changing.
 *
 * Both fall back to telling the user and opening the download page, which is
 * honest, and better than a progress bar that ends in silence.
 */
function selfInstallBlockedBy(): string | null {
  if (process.env['PORTABLE_EXECUTABLE_FILE']) return 'portable'
  if (process.platform !== 'darwin') return null

  // .../Termite.app/Contents/MacOS/Termite -> .../Termite.app
  const bundle = dirname(dirname(dirname(process.execPath)))
  try {
    // codesign writes its report to stderr, and is given a deadline so a hung
    // call cannot hold up startup.
    const result = spawnSync('codesign', ['--display', '--verbose=4', bundle], {
      encoding: 'utf8',
      timeout: 3000
    })
    const report = `${result.stderr ?? ''}${result.stdout ?? ''}`
    if (/^Authority=Developer ID Application/m.test(report)) return null
    return 'unsigned'
  } catch (error) {
    note(`could not read the code signature: ${String(error)}`)
    return 'unsigned'
  }
}

/** What the app is in the middle of, so an update never interrupts a job. */
export interface UpdateActivity {
  /** Runbook runs in flight. Restarting mid-run abandons it halfway across a fleet. */
  runbooks: number
  /** SFTP uploads/downloads in flight. Restarting leaves a partial file. */
  transfers: number
  /** Live terminal sessions. Safe to interrupt, but the user should be told. */
  sessions: number
}

export interface UpdateDeps {
  getWindow: () => BrowserWindow | null
  getActivity: () => UpdateActivity
  /** The user's `autoUpdate` setting; checked at call time, not captured. */
  isEnabled: () => boolean
}

let deps: UpdateDeps | null = null
let busy = false
let lastCheck = 0
let blockedBy: string | null = null

/** A job in progress — worth postponing an interruption for. */
function midJob(): boolean {
  if (!deps) return false
  const activity = deps.getActivity()
  return activity.runbooks > 0 || activity.transfers > 0
}

/**
 * Bring the window forward before asking anything.
 *
 * A modal attached to a window that is behind something else is invisible, and
 * an update waiting on an answer nobody can see is indistinguishable from an
 * update that failed.
 */
function surface(): BrowserWindow | null {
  const window = deps?.getWindow() ?? null
  if (!window) return null
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
  return window
}

function sessionWarning(): string {
  const open = deps?.getActivity().sessions ?? 0
  if (open === 0) return ''
  return open === 1
    ? '\n\nOne terminal session is open and will be disconnected.'
    : `\n\n${open} terminal sessions are open and will be disconnected.`
}

/** The path for a build that cannot replace itself: tell them, then hand it over. */
async function offerManualUpdate(version: string, reason: string): Promise<void> {
  const window = surface()
  if (!window || busy) return
  busy = true
  const detail =
    reason === 'portable'
      ? 'This is the portable build, which has no installer to update through. ' +
        'Downloading the new portable .exe replaces it — copy it over this one.'
      : 'This build is unsigned, so macOS will not let it replace itself. ' +
        'The download takes about a minute; drag it to Applications as usual.'
  const result = await dialog.showMessageBox(window, {
    type: 'info',
    message: `Termite ${version} is available`,
    detail: `You are running ${app.getVersion()}.\n\n${detail}`,
    buttons: ['Download', 'Later', "What's new"],
    defaultId: 0,
    cancelId: 1
  })
  busy = false
  if (result.response === 0) void shell.openExternal(`${RELEASES}/latest`)
  else if (result.response === 2) void shell.openExternal(`${RELEASES}/tag/v${version}`)
}

/** The path for a build that can: it is already downloaded, so only ask. */
async function offerRestart(version: string): Promise<void> {
  const window = surface()
  if (!window || busy) return
  busy = true
  const result = await dialog.showMessageBox(window, {
    type: 'info',
    message: `Termite ${version} is ready to install`,
    detail:
      'Termite will close, swap itself for the new version, and reopen. ' +
      'It stays closed for a few seconds in the middle — that gap is the ' +
      'installer working, not a crash.' +
      sessionWarning() +
      '\n\nHosts, keys, snippets and runbooks are all kept.',
    buttons: ['Restart now', 'Later', "What's new"],
    defaultId: 0,
    cancelId: 1
  })
  busy = false

  if (result.response === 2) {
    void shell.openExternal(`${RELEASES}/tag/v${version}`)
    return
  }
  if (result.response !== 0) return

  note('user chose to restart; calling quitAndInstall')
  try {
    // Nothing is torn down first, deliberately. Destroying windows here ends the
    // process before the installer has been handed control, which looks exactly
    // like an update that was refused but is one that was never attempted.
    // `isSilent` false so an installer failure is visible; `isForceRunAfter`
    // true because the whole promise was that it comes back.
    autoUpdater.quitAndInstall(false, true)
  } catch (error) {
    note(`quitAndInstall threw: ${String(error)}`)
  }

  // If the app is still here a moment later the install did not take, and
  // saying so beats a button that silently did nothing.
  setTimeout(() => {
    note('still running after quitAndInstall')
    void dialog
      .showMessageBox(window, {
        type: 'warning',
        message: 'The update could not be installed',
        detail:
          `Termite is still running ${app.getVersion()} rather than restarting, so the ` +
          'update did not take effect.\n\nDownloading it by hand always works, and ' +
          'takes about a minute.',
        // A way out, not a diagnosis. Telling someone to read a log file is
        // telling them to give up politely; the point of this dialog is that
        // they end up on the new version either way.
        buttons: ['Download it manually', 'Show me the log', 'Not now'],
        defaultId: 0,
        cancelId: 2
      })
      .then((choice) => {
        if (choice.response === 0) void shell.openExternal(`${RELEASES}/latest`)
        else if (choice.response === 1) shell.showItemInFolder(logPath)
      })
  }, INSTALL_GRACE)
}

export function setupUpdates(d: UpdateDeps): void {
  // A tree running from source has no version to compare against a release, and
  // would offer to "update" it to the last published installer.
  if (!app.isPackaged) return

  deps = d
  blockedBy = selfInstallBlockedBy()
  note(
    blockedBy
      ? `self-install unavailable (${blockedBy}); updates will be offered as a download`
      : 'self-install available'
  )

  // When the app cannot replace itself there is no point pulling down the
  // release — announcing it is the whole of what we can do.
  autoUpdater.autoDownload = blockedBy === null
  // The restart is the user's call, so never install behind their back.
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('update-available', (info) => {
    note(`update available: ${info.version}`)
    if (blockedBy) void offerManualUpdate(info.version, blockedBy)
  })
  autoUpdater.on('update-not-available', () => note('no update available'))
  autoUpdater.on('download-progress', (p) => note(`downloading ${Math.round(p.percent)}%`))
  autoUpdater.on('update-downloaded', (info) => void offerRestart(info.version))

  // Failures are silent on purpose: being offline, or behind a proxy that blocks
  // GitHub, is not something to interrupt someone about. It is logged so it can
  // still be diagnosed.
  autoUpdater.on('error', (error) => note(`check failed: ${error.message}`))

  const check = (): void => {
    if (!deps?.isEnabled()) return
    if (midJob()) return
    const now = Date.now()
    if (now - lastCheck < MIN_GAP) return
    lastCheck = now
    autoUpdater.checkForUpdates().catch(() => undefined)
  }

  setTimeout(check, FIRST_CHECK_DELAY)
  setInterval(check, RECHECK_INTERVAL)
  // Coming back to the app is the moment someone is most likely to be about to
  // use it, and the cheapest chance to notice a release published while they
  // were elsewhere. Rate limited, since focus changes constantly.
  const window = d.getWindow()
  if (window) window.on('focus', check)
}

/**
 * The Settings-panel check, which — unlike the quiet background one — reports
 * when there is nothing to report. Asked for explicitly, so it ignores both the
 * rate limit and the auto-update setting.
 */
export async function checkForUpdatesNow(): Promise<UpdateCheck> {
  if (!app.isPackaged) {
    return { status: 'unsupported', message: 'Updates only apply to an installed copy of Termite.' }
  }
  try {
    lastCheck = Date.now()
    const result = await autoUpdater.checkForUpdates()
    const version = result?.updateInfo.version
    if (!version || version === app.getVersion()) {
      return { status: 'up-to-date', version: app.getVersion() }
    }
    // The `update-available` handler has already taken it from here: either
    // downloading, or offering the release page for a build that cannot
    // install itself.
    return { status: blockedBy ? 'available' : 'downloading', version }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    note(`manual check failed: ${message}`)
    return { status: 'error', message }
  }
}
