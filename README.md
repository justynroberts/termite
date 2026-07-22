# 🐜 Termite

A modern, **AI-first SSH client** for Windows and macOS. Terminal, file transfer, tunnels, and a Claude-powered copilot — in one fast desktop app.

## Features

**Terminal**
- Tabbed SSH terminals (xterm.js, 256-color, WebGL-ready), Ctrl+Tab to switch, middle-click to close
- Right-click to copy selection / paste
- Per-app font, cursor, and scrollback settings applied live

**Hosts & auth**
- Host vault with groups, tags, colors, and search
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
- Save frequent commands, run them in the active session with one click

## Development

```bash
npm install
npm run dev        # hot-reload dev mode
npm run build      # production build to out/
npm run typecheck
```

## Packaging

```bash
npm run package:win   # NSIS installer (run on Windows)
npm run package:mac   # DMG (run on macOS)
```

## Security notes

- Passwords, private keys, passphrases, and your API key are encrypted with the OS keychain before touching disk (`termite-store.json` in the app's user-data folder).
- The renderer never sees stored secrets — all SSH happens in the main process behind a typed IPC bridge with `contextIsolation` on.
- Host keys are pinned on first use; a changed fingerprint refuses the connection and warns you.
- Your Anthropic API key is only ever sent to the Anthropic API.
