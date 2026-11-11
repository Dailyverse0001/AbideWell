# Abidewell — Folio 2 · The Living Sky (v5)

## The idea

One canvas, three screens. Every page lives inside the same full-bleed
particle scene — drifting soft orbs plus a faint twinkling starfield, drawn
on a 2D canvas (`assets/scene.js`) and retinted to that day's colour from a
7-stop cycle: cobalt · coral · marigold · viridian · plum · cyan · moss.

The verse is the artwork; the sky is the page. The issue number of the day
is painted huge and faint, drifting adrift behind the verse.

## Screens

| Screen | The move |
| --- | --- |
| **Today** | Verse floats on a glass card that tilts in 3D with the pointer; words rise word-by-word; every button is magnetic; the amen tap bursts particles into the scene. |
| **Archive** | The ledger rises into the light as you scroll; the card the scroll rests on glows with its own day's colour and drags the whole sky to it. Search is a bare underline, no box. |
| **Post** | A password gate on a centred glass panel; compose form and a sticky live-preview card side by side on desktop; the desk number and sky retint to the date being edited. |

## Visual language

- **Type** — Fraunces (display + verse), Space Grotesk (chrome).
- **Palette** — paper `#f5f3ee`, ink `#121319`; the seven hero stops above carry all colour.
- **Glass** — cards and panels are semi-transparent `backdrop-filter: blur(6-8px)`,
  tinted borders in the day's hero colour, soft inset glow.
- **Motion** — GSAP `3.12.5` (jsDelivr CDN, `defer`) orchestrates the day-change
  transition on Today. Site works fully with the CDN blocked.
- **Shared chrome** — `AbidewellScene.initChrome()` wires the custom cursor ring
  and magnetic pull on every screen in one place (fine pointers only, disabled
  under `prefers-reduced-motion`).
- **Perf** — orbs capped at 26 (9 on small screens), stars at 160,
  `devicePixelRatio` clamped to 2, particles capped at 400, the loop pauses on
  `visibilitychange`.

## Files

- `public/index.html` + `public/assets/app.js` — Today
- `public/archive.html` + `public/assets/archive.js` — Archive (ledger)
- `public/admin.html` + `public/assets/admin.js` — Post (the desk)
- `public/assets/scene.js` — the particle scene engine + shared chrome
- `public/assets/folio.css` — the whole visual system in one file
- `public/sw.js` — offline cache `abidewell-v11-folio2`

## Changelog

- **v5 — Folio 2 · The Living Sky.** Full-bleed canvas particle scene, 3D-tilting
  glass card, magnetic buttons, custom cursor, amen particle burst, scroll-linked
  sky retinting in the archive, sticky live preview on the desk.
- **v4 — Folio.** One column, one typeface, one colour per day. Rejected as "blunt".
- **v3 — Cut Paper Garden (dropped).**
- **v2 — Lumen (rejected, never deployed).** Dark indigo and gold night plate.
- **v1 — Broadside.** Cream stock, Literata, vermilion, radial print marks.
