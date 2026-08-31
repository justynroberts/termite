# DESIGN.md — Termite site

House-style record for the GitHub Pages site in `docs/`. A later session should
read this before changing the look, and should pick differently again for the
*next* project.

## Archetype: **Terminal**

Mono-forward, tight grid, dense rows, hard 0–2px radii, near-monochrome.

This replaces a **Poster** pass — full-bleed colour fields, one oversized
statement per screen ("Every box. One window. Ask it anything."). It was
rejected on the only grounds that matter: it read as marketing. The audience for
a terminal emulator is people who will judge it on what it does, and a page that
withholds facts to make room for a slogan is the wrong shape for them.

Terminal was the archetype I passed over the first time as too obvious for an
SSH client. That reasoning was about avoiding a cliché rather than about serving
the reader, and it was wrong. Recent siblings in `~/work/` used Kiosk
(`24keypad`, `3d-servicemap`), Console/telemetry (`aidetect`, `portfolio`,
`tessera`), Editorial (`dontforget`, `newsfin`), Soft product (`emberline`,
`finburn`), Brutalist (`finscreen`) and Blueprint (`finvector`) — Terminal is
unused across all of them.

The positioning changed with it. Termite is a **multi-platform terminal
application with fleet management and built-in LLM connectivity, bring your own
key** — not an "AI-first SSH client", which oversold the AI and undersold both
the terminal and the fleet work.

Three pillars, given equal weight in that order: **terminal**, **fleet**,
**LLM**. Running one step across forty hosts is the capability an ordinary
terminal does not have, so it is stated up front rather than filed under
"runbooks" two thirds of the way down.

## Axis picks

| Axis | Pick | Why it differs |
|---|---|---|
| **Layout** | Single centred column, 880px measure, everything left-aligned on one rule | The poster used full-bleed alternating fields. A tool page is read top to bottom like a man page; one column means no decision about where to look. |
| **Type scale** | **Near-flat, 1.2 ratio.** Largest text on the page is 1.9rem | Directly opposed to the poster's 1.6 ratio and 6.4rem hero. Nothing shouts, so the specifics carry the page. |
| **Surface** | Flat fills, hairline rules, no cards, no elevation, no shadows anywhere except the one dialog | Same restraint as the poster pass, kept because it was not the problem. |
| **Radius** | **0px** on every structural element; 2px on inputs and buttons | Hard edges. The poster's pill buttons were the single most product-marketing thing on it. |
| **Accent** | **Near-monochrome with one signal colour** — mint `#0f9d6b` / `#34d399`, the app's own `--accent`. The violet from the icon is dropped | The poster was duotone with violet reserved for "the AI"; assigning a colour to the LLM overstated its place in the app. Colour now marks links, prompts and status, nothing else. |
| **Type pairing** | **Mono-forward**: JetBrains Mono carries body, navigation, tables and labels. Bricolage Grotesque is kept for headings only | Inverts the poster, which was Bricolage throughout with mono only inside the terminal. JetBrains Mono is what the app ships as its default terminal font. |
| **Motion signature** | **Fade-rise** — 10px, 240ms, no stagger beyond 40ms | Replaces the poster's 520ms left-to-right wipe, which was theatrical. Motion here should be almost unnoticed. |
| **Ground texture** | Faint horizontal scanline at 3px, plus grain. Background layer only | The one texture that belongs to this archetype, at an intensity you have to look for. |

## Copy rules

Written down because tone was the actual defect, not layout:

- No superlatives, no "just works", no "done right", no exclamation marks.
- Lead with what a thing *is*, then what it does. Never with how it feels.
- Prefer a number, a filename or a flag to an adjective. `ed25519`, `SOCKS5`,
  `xterm.js WebGL`, `Ctrl+Shift+E` — these are the selling points to this reader.
- Say plainly where data goes. "Your key is sent to Anthropic and nowhere else"
  is worth more than any claim about privacy.
- No emoji in prose.

## Theming

Three states via `data-theme` on `<html>`: explicit light, explicit dark, system
default. Every token on bare `:root`; the dark blocks redefine only what changes.
A blocking script in `<head>` applies the stored value before first paint.

Dark is the default expectation for this archetype, so light got the scrutiny:
mint drops to `#0f6f4e` on paper for body-size text to clear WCAG AA.

## The five non-negotiables

- Light + dark + system, real toggle, no flash — `docs/index.html` head script
- Animated CSS — fade-rise on scroll, hover/focus transitions, blinking caret;
  `prefers-reduced-motion` guard in `docs/styles.css`
- Bricolage Grotesque as the display face (headings)
- Terminal archetype, unused in the fleet, and a different skeleton from the
  Poster pass it replaces
- "Made by FintonLabs" info button — footer, `<dialog>`, Escape/backdrop/close
