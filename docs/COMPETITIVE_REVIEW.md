# Competitive review

Reviewed 2026-08-28 against current public product documentation for Termius, Warp, and Tabby.

## Where Termite is already competitive

- SSH and SFTP, jump hosts, key/agent/password auth, host-key pinning
- Local/remote/SOCKS forwarding, encrypted local vault, snippets
- Tabs, split panes, themes, Powerline/Nerd Font support, Windows 11 Mica/Acrylic
- AI command generation and explanation
- Multi-host, multi-step runbooks with rolling execution and live output
- Duplicate sessions and synchronized split-pane input

## Where paid products remain ahead

| Capability | Termius / Warp / Tabby | Termite status |
|---|---|---|
| Cross-device encrypted sync and team sharing | Mature in Termius | Not implemented; local-first only |
| Mobile clients | Termius supports iOS/Android | Desktop only |
| Mosh, Telnet, serial, FIDO2, SSH certificates | Available in paid/mature clients | Not implemented |
| Persistent workspace/tab restoration | Termius/Tabby/Warp support restoration or launch configs | High-priority roadmap |
| Searchable command history and command blocks | Strongest in Warp | Basic terminal scrollback only |
| Startup commands/login scripts and environment variables | Termius/Tabby | High-priority roadmap |
| Multiplayer/shared live terminal | Termius | Not implemented |
| Extensibility/plugins | Tabby | Not implemented |

## Product direction

Termite should not try to copy cloud-vault or multiplayer features first. Its strongest
differentiator is local-first, AI-assisted fleet operations. The next practical releases should
focus on:

1. Restore tabs, panes, and workspace layouts safely after restart.
2. Per-host startup commands and environment variables.
3. Searchable per-host command history and session logs with redaction.
4. Parameterized runbooks and reusable launch configurations.
5. Optional Mosh and agent forwarding.

Sources: [Termius features](https://termius.com/),
[Termius plans](https://www.termius.com/pricing),
[Warp SSH support](https://docs.warp.dev/code/ssh-feature-support),
[Warp command entry](https://docs.warp.dev/terminal/entry), and
[Tabby features](https://tabby.sh/about/features).
