# 🐜 Termite

A modern, **AI-first SSH client** for Windows and macOS. Terminal, file transfer, tunnels,
multi-host runbooks, and a Claude-powered copilot — in one fast desktop app.

**MIT licensed** · written by [justyn@fintonlabs.com](mailto:justyn@fintonlabs.com) · enjoy!

## Install

Grab the latest installer from **[Releases](../../releases)**:

- **Windows**: `Termite-Setup-<ver>.exe` (installer) or `Termite-Portable-<ver>.exe` (no install)
- **macOS**: `Termite-<ver>-mac.dmg` (universal — Apple Silicon + Intel)

Unsigned builds: Windows SmartScreen → *More info → Run anyway*; macOS → right-click → *Open* (first launch only).

## Features

**Terminal**
- Tabbed SSH terminals (xterm.js on the WebGL renderer, 256-color), Ctrl+Tab to switch,
  middle-click to close
- **Powerline prompts and Nerd Font icons render out of the box** — the core Powerline
  glyphs (``…) are drawn by the renderer itself in any font, and the official
  Symbols Nerd Font is bundled for the extended icon set (git branch, web, folders, …);
  a system-installed Nerd Font is used first when present
- **Split panes** — up to 8 per tab in columns and rows, each pane its own live SSH session.
  Split with the tab-strip buttons or shortcuts; close a pane with its hover ✕, `Ctrl+Shift+W`,
  or just `exit` the shell (split panes auto-collapse when their shell exits)
- Focused pane gets an accent indicator; snippets and the AI copilot always target it
- **Zen mode** (`Ctrl+Shift+Z`): fullscreen with every bit of chrome hidden — just your
  terminals edge to edge. Exit with the same shortcut or the faint ✕ pill top-right
- Clipboard done right: `Ctrl+C` copies when text is selected (SIGINT otherwise),
  `Ctrl+V`/`Ctrl+Shift+V` paste, `Ctrl+Shift+C` copies, right-click copies selection or
  pastes, optional copy-on-select (PuTTY style)
- Per-app font, cursor, and scrollback settings applied live

**Keyboard shortcuts**

| Action | Shortcut |
|---|---|
| AI Copilot | `Ctrl/Cmd + K` |
| Zen mode (fullscreen, chrome hidden) | `Ctrl/Cmd + Shift + Z` |
| Split pane right | `Ctrl/Cmd + Shift + E` |
| Split pane down | `Ctrl/Cmd + Shift + O` |
| Close pane | `Ctrl/Cmd + Shift + W` |
| Close tab | `Ctrl/Cmd + W` |
| Next / previous tab | `Ctrl + Tab` / `Ctrl + Shift + Tab` |

**Hosts & auth**
- Host vault with groups, tags, colors, and search — double-click to connect,
  **right-click to edit**, or use the always-visible row buttons (terminal / SFTP / edit / delete)
- Password, SSH key, and SSH agent auth (Windows OpenSSH agent + `SSH_AUTH_SOCK`)
- Jump host (bastion) chaining
- Import hosts from `~/.ssh/config`
- Known-host fingerprint pinning (TOFU) with loud mismatch warnings
- Secrets encrypted at rest with the OS keychain (DPAPI / macOS Keychain) via Electron `safeStorage`

**Keys**
- Generate ed25519 (OpenSSH format) or RSA-4096 keys in-app
- One-click copy of the public key for `authorized_keys`
- Import existing private key files

**Files (SFTP)**
- Dual-pane local ⇄ remote browser
- Upload/download files **and whole directories** with live progress
- mkdir, delete (recursive), rename, path bar, multi-select (Ctrl+click)

**Tunnels**
- Local, remote, and dynamic (SOCKS5) port forwarding with start/stop control

**AI Copilot (Ctrl+K)** — bring your own Anthropic API key
- Describe what you want in plain English → get the exact command, with **Run / Insert / Copy** buttons
- "Explain last error" — the copilot sees your recent terminal output, so it explains *your* actual error
- Explain output, summarize session, free-form sysadmin chat
- Destructive commands are generated with guardrails; nothing runs without your click

**Snippets**
- Save frequent commands, run them in the focused pane with one click

**Runbooks — orchestrate across your fleet**
- Multi-step, multi-host command orchestration: patch a fleet, roll a deploy, run health
  checks — each step targets one or more hosts, in parallel or rolling one-at-a-time
- Fail-fast or continue-on-error per step, optional timeouts, per-step interpreter
  (login shell / bash / PowerShell for Windows hosts)
- Live run view: step timeline, per-host status + exit codes, streaming collapsible
  output, cancel mid-run
- **AI drafting**: describe the job in plain English and Claude writes the steps
  (pre-checks → change → verification) for you to review and target

**Appearance**
- Windows 11 native look: **Mica / Acrylic** window materials, rounded corners, native
  window-controls overlay; macOS vibrancy. Switchable (or fully solid) in Settings → Appearance
- Theme-aware custom title bar
- 10 terminal themes (Dracula, Nord, Tokyo Night, Catppuccin, Gruvbox, One Dark, Monokai,
  Solarized dark/light, Termite Dark) with a live visual picker
- Bundled coding fonts: JetBrains Mono, Fira Code (ligatures), IBM Plex Mono, Source Code Pro;
  Inter for the UI — all packaged, no network needed
- Dark and light app themes

## Development

```bash
npm install
npm run dev        # hot-reload dev mode
npm run build      # production build to out/
npm run typecheck
```

## Packaging & deployment

One command per platform — output lands in `dist/`:

```bash
npm run package:win   # → Termite-Setup-<ver>.exe (installer) + Termite-Portable-<ver>.exe
npm run package:mac   # → Termite-<ver>-mac.dmg + .zip (universal: Apple Silicon + Intel)
```

The portable `.exe` needs no installation at all — copy it anywhere and run.

### CI releases (recommended)

Push the repo to GitHub, then cut a release with:

```bash
git tag v0.1.0
git push origin main --tags
```

The included [GitHub Actions workflow](.github/workflows/release.yml) builds **Windows and macOS
installers in parallel** and attaches them to a GitHub Release automatically. No signing
certificates needed to get started (see below). You can also trigger a build manually from the
Actions tab (`workflow_dispatch`) — artifacts appear on the run page.

### Code signing (optional, removes OS warnings)

Unsigned builds work, but Windows SmartScreen shows "unknown publisher" (click *More info → Run
anyway*) and macOS requires a one-time right-click → *Open*. To sign:

- **Windows**: set `CSC_LINK` / `CSC_KEY_PASSWORD` secrets (PFX cert) and remove nothing — electron-builder picks them up.
- **macOS**: set `CSC_LINK` / `CSC_KEY_PASSWORD` (Developer ID cert), delete the
  `CSC_IDENTITY_AUTO_DISCOVERY: 'false'` line in the workflow, and add notarization env
  (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`).

### App icon

`build/icon.png` (512×512) is auto-converted to `.ico`/`.icns` per platform.
Regenerate it after design tweaks with `npm run icon`.

## Security notes

- Passwords, private keys, passphrases, and your API key are encrypted with the OS keychain before touching disk (`termite-store.json` in the app's user-data folder).
- The renderer never sees stored secrets — all SSH happens in the main process behind a typed IPC bridge with `contextIsolation` on.
- Host keys are pinned on first use; a changed fingerprint refuses the connection and warns you.
- Your Anthropic API key is only ever sent to the Anthropic API.

## License

MIT — see [LICENSE](LICENSE). Copyright © 2026 Justyn Roberts <justyn@fintonlabs.com>. Enjoy! 🐜
