# Changelog

## 0.6.2 — 2026-07-25

### Fixed
- **Copy behavior hardened** (verified end-to-end with live input this time): selection stays
  visible after copy (Windows Terminal behavior — a second Ctrl+C re-copies instead of sending
  SIGINT), and empty/whitespace-only selections can no longer clobber the clipboard or eat the
  Ctrl+C. Copy requires a real (non-whitespace) selection; paste, right-click copy/paste,
  Ctrl+Shift+C/V all confirmed working against the system clipboard.

## 0.6.1 — 2026-07-25

### Fixed
- **Copy/paste made bulletproof**: clipboard operations now go through the main process over
  IPC (the renderer-side clipboard module could be unavailable at runtime, silently killing
  both copy and paste). Key handlers are also defensive — a clipboard failure can never break
  terminal input again.
- **Hyperlinks open in your browser**: xterm's link addon opens links via a blank
  `window.open()` that Electron blocked before the URL was known. Links in the terminal now go
  straight to the OS browser; `mailto:` links (e.g. in the About box) open your mail app
  instead of navigating the app window.
- **Runbook connections are force-terminated at end of run**: every SSH channel and client is
  swept closed when a run finishes (success, failure, or cancel), with a 3-second grace before
  the socket is severed — no lingering connections on your servers.

## 0.6.0 — 2026-07-25

### Added
- **About box** — click the 🐜 in the title bar: version + runtime info, author
  (justyn@fintonlabs.com), MIT license. Also summarized at the top of Settings.
- MIT `LICENSE` file; package author metadata.

### Changed (0.5.1–0.5.2, rolled into this release)
- Afacad UI webfont (bundled), larger type scale, runbook editor/run-view spacing polish
- Win11 glass (translucent + blur) on runbook step cards and run steps
- Runbooks panel header aligned with the other sidebar panels
- Four safe starter runbooks seeded: Health check, System update (apt), System update
  (dnf/yum), Docker cleanup (safe prune)

## 0.5.0 — 2026-07-24

### Added
- **Runbooks — multi-host, multi-step orchestration.** Define ordered steps, each with its own
  command/script, target hosts, and options; run the whole thing with live per-host output.
  - Steps run in order; within a step, hosts run **in parallel or one at a time** (rolling)
  - **Fail-fast or continue-on-error** per step; sequential mode stops at the first failed host
  - Per-step **interpreter**: remote login shell (default), `bash -lc`, or **PowerShell**
    (`-EncodedCommand`, quote-safe for Windows hosts); optional per-step timeout
  - Live run view opens as a tab: step timeline, per-host status badges + exit codes,
    collapsible auto-scrolling output, cancel mid-run
  - **✨ Draft with AI**: describe the job ("update all Debian servers, reboot if needed") and
    Claude drafts the steps — pre-checks, the change, verification — for you to review
  - Runs over the same SSH machinery as terminals: keys, agent, jump hosts, host-key pinning

## 0.4.1 — 2026-07-24

### Fixed
- **Nerd Font icon glyphs (web/globe, git branch, folders, …) now render out of the box.**
  The official Symbols Nerd Font Mono (v3.4.0, MIT) is bundled with the app and sits in every
  terminal font stack, so the extended icon set no longer requires a Nerd Font to be installed
  system-wide. The font is preloaded before terminals render so the glyph atlas never caches
  tofu boxes.

## 0.4.0 — 2026-07-22

### Added
- **Powerline glyphs & WebGL renderer.** The terminal now renders on the GPU (WebGL) with
  xterm's `customGlyphs`, which draws the Powerline triangles/half-circles (U+E0B0–E0B7) and
  box-drawing characters pixel-perfectly in any font — powerline prompts (starship, oh-my-zsh
  themes, powerlevel10k separators) just work. Falls back to the DOM renderer if no GPU.
- All font stacks fall back to locally installed Nerd Fonts (Symbols Nerd Font,
  JetBrainsMono NF, …) so the extended icon set (git branch, folders) renders when available;
  existing saved font settings are migrated automatically.

## 0.3.2 — 2026-07-22

### Fixed
- **Copy/paste in the terminal.** The hidden default menu was swallowing `Ctrl+C`/`Ctrl+V`
  before the terminal saw them, and xterm selections aren't DOM selections so the menu's
  Copy copied nothing. The app menu is now removed on Windows/Linux and the terminal handles
  clipboard keys itself, using Electron's native clipboard:
  - `Ctrl+C` with a selection → copy (no SIGINT); without a selection → SIGINT as normal
  - `Ctrl+V` or `Ctrl+Shift+V` → paste; `Ctrl+Shift+C` → copy (Cmd variants on macOS)
  - Right-click → copy selection, or paste when nothing is selected

### Added
- **Copy on select** (Settings → Terminal): PuTTY-style — selecting text copies it immediately.

## 0.3.1 — 2026-07-22

### Fixed
- **Host editing was hard to find and easy to lose**: host/key/snippet/forward action buttons
  are now always visible (brighten on hover) instead of hidden until hover; right-click a host
  to open its editor directly; editor modals no longer close (discarding your changes) when
  clicking outside — use Cancel, Save, or `Esc`.

## 0.3.0 — 2026-07-22

### Added
- **Zen mode** (`Ctrl+Shift+Z`): OS fullscreen with all chrome hidden (title bar, activity bar,
  sidebar, tab strip) — terminals fill the entire screen. Exit via the same shortcut or the
  translucent ✕ pill in the top-right (visible on hover). AI copilot (`Ctrl+K`) and all
  split-pane shortcuts keep working inside zen.

## 0.2.0 — 2026-07-22

### Added
- **Split terminals**: up to 8 panes per tab (max 4 columns × 4 rows), each pane an independent
  SSH session to the tab's host. Split via tab-strip buttons, `Ctrl+Shift+E` (right),
  `Ctrl+Shift+O` (down). Close via hover ✕ on the pane, `Ctrl+Shift+W`, or shell `exit`
  (split panes auto-collapse when their shell terminates).
- Focused-pane accent indicator; AI copilot and snippets target the focused pane.
- Windows 11 native look: Mica/Acrylic window materials with rounded corners and the native
  window-controls overlay; macOS vibrancy. Window effect selector in Settings (Mica/Acrylic/Solid).
- Theme-aware custom title bar showing the active session.
- 10 terminal themes with visual picker; dark/light app theme.
- Bundled webfonts (JetBrains Mono, Fira Code, IBM Plex Mono, Source Code Pro, Inter) with
  font preview in Settings.
- Deployment: app icon, NSIS installer + portable exe (Windows), universal DMG/zip (macOS),
  GitHub Actions release workflow (tag `v*` → installers attached to a GitHub Release).

### Fixed
- Space bar (and other keys) going to the last-clicked toolbar button instead of the terminal:
  toolbar/tab/activity buttons no longer steal keyboard focus, and clicking a terminal pane
  always refocuses its input.
- Contrast pass: brighter secondary text, stronger borders, higher glass opacity for
  readability over bright wallpapers.

## 0.1.0 — 2026-07-22

Initial release: tabbed SSH terminals, host vault with groups/tags and OS-keychain-encrypted
secrets, jump hosts, `~/.ssh/config` import, known-host pinning, ed25519/RSA key generation,
dual-pane SFTP with recursive transfers, local/remote/dynamic (SOCKS5) port forwarding,
snippets, and the Claude-powered AI copilot (natural language → command, explain error,
summarize session).
