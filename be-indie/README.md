# BE—INDIE / Digital Concept

**Unofficial, speculative digital redesign concept by Omar Akram, 2026. Not affiliated with BE-INDIE.**

Creative direction: *Independence is a system error.* An underground fashion
magazine, a denim development lab, a photocopier and a risograph studio,
fused into one experience. It has a site you can explore and a 15.5-second
portrait film at `/showcase` for TikTok and Reels.

## Run it

```bash
cd be-indie
npm install
npm run dev
```

| | URL | best viewport |
| --- | --- | --- |
| Site | http://127.0.0.1:5173/ | 1440 × 900 desktop (responsive down to phone) |
| Showcase | http://127.0.0.1:5173/showcase | 1080 × 1920 (the stage scales to any window, letterboxed) |
| Wash-study lab | http://127.0.0.1:5173/lab | dev tool for inspecting the procedural denim |

Production build: `npm run build && npm run preview` (the preview server serves `/showcase` too).

## Recording the showcase

The film is deterministic: every pixel is a pure function of time `t`.

**Option A: render the MP4 directly (recommended).**

```bash
npm run dev                       # terminal 1
npm run render                    # terminal 2 → showcase.mp4, 1080×1920, 60 fps, H.264
```

`npm run render` steps the timeline frame by frame at exactly 60 fps, so no frames drop.
It drives headless Chromium through Playwright (installed as a dev dependency; run
`npx playwright install chromium` once if you have never used Playwright).
It needs ffmpeg with libx264, found in this order: `FFMPEG=/path/to/ffmpeg`, then
`ffmpeg` on your PATH, then the optional `@ffmpeg-installer/ffmpeg` package.
Options: `--fps 60 --out file.mp4 --url http://127.0.0.1:5173 --hold 0.6`.

**Option B: screen-record.** Open `/showcase`, start recording, and do nothing.
The page holds the first frame for 2.5 s (`?delay=` changes this), plays 15.5 s,
then holds the end frame. For a native 1080 × 1920 capture, use Chrome DevTools'
device toolbar at 1080 × 1920 with a DPR of 1.

| param / key | effect |
| --- | --- |
| `?delay=1` | seconds of held first frame before playback |
| `?loop` | loop forever |
| `?t=4.5` | freeze on one frame (poster/QC) |
| `?capture` | expose `window.__seek(t)` for the renderer; never plays |
| `R` / `Space` | restart / pause |

## The showcase: 15.5 s at 120 BPM

| time | scene | what happens |
| --- | --- | --- |
| 0.00–1.50 | **00 Brand impact** | Frame 0 already carries BE— / INDIE as two loose colour plates. A copier light prints the key plate over the denim, with a hard black-and-white trail behind it. The plates lock into register at 0.9 s. Metadata types on, the bright-blue label is stitched on, and a two-frame photocopy flash closes the scene. |
| 1.50–3.50 | **01 Independence** | A vertical, denim-filled INDEPENDENCE prints bottom to top. IS A / STATE / OF land on 8th notes, then MIND. is stamped in electric blue. The press quote types in underneath. |
| 3.50–6.00 | **02 The Denim Scanner** | The signature scene. A scan band crosses the Destiny Sponge study. Behind it the image becomes a riso-blue print, inside it a ×2.4 loupe, and just ahead of it a negative sliver. Inspection tags pull out on leader lines. The title changes from paper to ink as it gets scanned. |
| 6.00–9.00 | **03 Archive** | Bang, bang, bang, bang: four pieces every 0.75 s. Plates slam in and stack, the index counter rolls, names mask in, and the background hard-cuts from paper to electric blue to ink to paper. |
| 9.00–11.50 | **04 Print room** | A contact sheet in four passes: full colour, riso, halftone, photocopy. LOOK 03 is overprinted in two drums, a grease-pencil loop marks the pick, and tape goes on. Then everything snaps clean into one registered print. |
| 11.50–13.50 | **05 Detail** | The quiet beat: macro denim with depth of field, a slow push, one annotation. |
| 13.50–15.50 | **06 Lockup** | BE—INDIE / INDEPENDENCE IS A STATE OF MIND. The frame is stitched into a label. Credits: DIGITAL CONCEPT — OMAR AKRAM / 2026 — UNOFFICIAL CONCEPT — NOT AFFILIATED WITH BE-INDIE. |

Essential text stays inside x 60–920 and y 170–1500, clear of the TikTok/Reels chrome. Only image and oversized type bleed past those edges.

## The site: chapters, not blocks

00 boot (scan exposure + registration lock) · 01 independence manifesto ·
02 **the denim scanner**, interactive: move over the plate and switch between the six washes ·
03 the collection, a horizontal archive scrubbed by scroll ·
04 print room: drag the proofs, then register them · 05 detail · 06 *wear your own version* + credits, research sources and an asset-status list.

Search and bag work. Nothing is sold: every "view piece" link goes to the real product page on BE-INDIE's own site.

## Assets: read this

**No official BE-INDIE imagery is in this repository.** The build environment
could not reach be-indie.com, int.be-indie.com, the Shopify CDN or Instagram
(the network egress policy blocked them), and nothing was substituted from
stock libraries.

Instead, every image position is a **photo slot**. Until a slot is filled it
shows a *procedural wash study*: denim woven in code, yarn by yarn (3/1
right-hand twill, ring-dye fading, stitching, hardware, fraying). Each study
is derived from a wash BE-INDIE describes in its own product copy, for example
*Destiny Sponge: dark blue wash with grey sponge spots, beige stitching, silver
buttons*. These studies never present themselves as brand photography: each one
is labelled `WASH STUDY / RENDERED` on screen. A filled slot switches that line
to `IMAGE / BE-INDIE`.

To use real imagery, drop files into `src/assets/brand/` named after the slot
(`.jpg .jpeg .png .webp .avif`). They are picked up at build time and get the
same crops, scanner and print treatments. See `src/assets/brand/README.md`
for the list: `hero`, `scanner`, `scanner-detail`, the six `product-*` slots,
`collage`, `detail`, `end`, plus `logo` (the official wordmark; until it is
supplied, BE—INDIE is typeset in Archivo and is **not** the official logo) and
an optional `hero-cutout` (transparent PNG of the model, layered over the hero
type).

**Still needed from BE-INDIE / public sources:** campaign photography (hero, end),
a full-length model shot in Destiny Sponge (scanner), the six product images,
one look for the print room, a denim close-up, and the official wordmark.

## What is factual, and where it came from

All facts are in `src/brand/data.ts`, with their sources. Research was done by
web search on 2026-09-26.

- Product names, washes and details are as BE-INDIE lists them: Destiny Black Jeans,
  Destiny Sponge Jeans, Wide Leg Midnight Blue, Indie Fit Jeans Blue Wash,
  Be-Fluffy 2.0 Cloud Wash, Relaxed Mens Jeans Grey. They came from int.be-indie.com product pages.
  **Prices are omitted** because they could not be verified.
- "Being independent is a state of mind, it's the overall resistance to mainstream
  culture." (BE-INDIE, in CairoScene coverage). *Independence is a state of mind*
  is used as the lockup line on that basis.
- Established in 2019 in Cairo, identifiable by a bright blue label. Denim that is dyed, stained,
  layered and cut (press coverage). "Edgy and rebellious spirit … bold colours and
  stand-out prints" (be-indie.com/pages/about-us). A Summer 26 collection is live on be-indie.com.
- Concept copy that is **not** a BE-INDIE slogan: *Wear your own version*,
  *Denim / Reprogrammed*, *Independent / Always*. The site says so where the headline appears.

## Tech

React 19 + Vite 8 + TypeScript. There is no animation library: motion is plain math on `t`,
so it stays deterministic. The denim, riso, halftone, photocopy and negative plates are
generated in a pool of Web Workers (`OffscreenCanvas`) and composited with transforms,
clip-paths and opacity only. Type: Archivo (variable width, set at 62%),
Hanken Grotesk and IBM Plex Mono, self-hosted via Fontsource.

```
src/brand/        facts (data.ts) and photo slots (assets.ts)
src/lib/denim/    procedural weave, print treatments, worker pool
src/showcase/     the 15.5 s film: scenes.tsx is the whole timeline
src/site/         the explorable site
scripts/          render-showcase (MP4), frames/site-shots/contact (visual QC)
```
