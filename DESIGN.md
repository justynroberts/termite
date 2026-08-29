# DESIGN.md — Termite site

House-style record for the GitHub Pages site in `docs/`. Written before the CSS.
A later session should read this before changing the look, and should pick
differently again for the *next* project.

## Archetype: **Poster**

One oversized statement per screen, minimal chrome, full-bleed colour fields.

Recent siblings in `~/work/` used: Kiosk (`24keypad`, `3d-servicemap`),
Console/telemetry (`aidetect`, `portfolio`, `tessera`), Editorial (`dontforget`,
`newsfin`), Soft product (`emberline`, `finburn`, `mpcee`, `steprail`),
Brutalist (`finscreen`), Blueprint (`finvector`). Poster and Gallery were the
two left unused; Gallery needs product imagery this repo does not have (the only
raster asset is a 512px icon), so Poster it is.

It also earns the pick on content grounds. This is a *landing page for a
download*, not an instrument panel — the job is one claim per scroll and a
button. The obvious move for an SSH client is the Terminal archetype: scanlines,
mono everything, hard edges. That would have been the fourth hard-edged
technical register in the fleet and would make the product look like every
other terminal emulator's site. The page is set in a display face at poster
scale, and the only mono on the page is inside the one element that genuinely
is a terminal.

## Axis picks

| Axis | Pick | Why it differs |
|---|---|---|
| **Layout** | Full-bleed stacked sections, each its own colour field, content on an **asymmetric 12-column grid** that alternates weight left/right down the page | No rail, no card grid, no bento. Every recent sibling docks a rail or tiles cards; here each section is a whole screen with one idea in it. |
| **Type scale** | Dramatic — **1.6 ratio**, hero at `clamp(3.4rem, 10vw, 9rem)`, section statements at `clamp(2.2rem, 5.5vw, 4.4rem)` | Poster copy is read as an image before it is read as text. Instrument-panel siblings sat at 1.2–1.25. |
| **Surface** | **Flat fills and hairline rules.** No cards, no elevation, no blur — except the one floating download bar and the info dialog | Directly opposed to `finburn`/`emberline` translucency and `finscreen` offset shadows. |
| **Radius** | Mixed by role — **0px** on panels, rules and the terminal frame; **pill** on buttons, chips and the theme toggle | The hard/soft contrast is the whole surface language: structure is square, anything you press is round. |
| **Accent** | **Duotone, derived not invented** — mint `#10b981` / `#34d399` is the app's own `--accent`; violet `#7b6bb5` is read off the ant in `build/icon.png`. Mint = the shell, the command, the go. Violet = the AI, the copilot, the thinking. | Neither hue is chosen for taste — both already exist in the product. No sibling used a green/violet duotone; `finburn` was ember/cyan, `3d-servicemap` per-category. |
| **Motion signature** | **Wipe-reveal** — a left-to-right `clip-path` sweep, 520ms, `cubic-bezier(.16,1,.3,1)`, staggered 60ms across siblings. Headlines, rules and images all arrive by being painted in from the left | The gesture a terminal makes when it prints a line. Distinct from rise-and-fade (`newsfin`), press-depress (`24keypad`), scale-in-bloom (`3d-servicemap`), draw-in stroke (`finvector`), snap-slide (`finscreen`), rail-slide (`tessera`). |
| **Ground texture** | Plain fields with a **very low-opacity grain** overlay, plus one slow conic wash confined to the hero background layer | Grain keeps large flat colour fields from banding. The wash is 40s, ambient, and never touches a control. |

## Type

- Display + body: **Bricolage Grotesque**, `opsz 12..96`, `wdth 75..100`, `wght 300..800`.
  Hierarchy comes from the variable axes — the hero narrows to `wdth 82` at
  `wght 750`, body sits at `wdth 100 / wght 400`. No second sans.
- Mono: **JetBrains Mono** — chosen because Termite bundles it as a terminal font,
  so the site's terminal renders in a face the app actually ships.

## Theming

Three states via `data-theme` on `<html>`: explicit light, explicit dark, system
default. Every token defined on bare `:root`; the dark blocks redefine only what
changes. Boot script in `<head>` applies the stored value before first paint.

Light is the harder one here and got the attention: the mint drops to `#047857`
against paper so body-size text on the light ground clears WCAG AA, and the
violet darkens to `#5b4b93`.

## The five non-negotiables

- Light + dark + system, real toggle, no flash — `docs/index.html` head script
- Animated CSS — wipe-reveal on scroll via `IntersectionObserver`, hover/press on
  every control, `prefers-reduced-motion` guard in `docs/styles.css`
- Bricolage Grotesque as the display face
- Poster archetype, unused in the fleet, different skeleton from the last project
- "Made by FintonLabs" info button — bottom-right, `<dialog>`, Escape/backdrop/close
