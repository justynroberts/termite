# Changelog

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
