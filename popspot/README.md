# POP SPOT — The Collectorverse

**Unofficial speculative digital concept** for the Egyptian collectibles retailer
[Pop Spot](https://popspotme.com/) (@popspotegypt), by **Omar Akram / 2026**.
Not affiliated with Pop Spot. “Every fandom has a spot” is concept copy, not a Pop Spot slogan.

This folder is a self-contained Vite + React + GSAP project. It does not touch the Expo app
in the repository root (the root `tsc`, `eslint`, `jest` and `prettier` configs ignore `popspot/`).

## Run

```bash
cd popspot
npm install
npm run dev          # http://localhost:5173/  and  http://localhost:5173/showcase
```

Production build: `npm run build && npm run preview` (http://localhost:4173).

| Route       | What it is                                                             | Best viewport        |
| ----------- | ---------------------------------------------------------------------- | -------------------- |
| `/`         | The interactive concept site                                            | 1440 × 900 (+ mobile) |
| `/showcase` | The 15.8 s zero-input collector-film for TikTok / Reels                 | 1080 × 1920           |

### /showcase options

- `/showcase` — waits for every product photo and font, holds frame 0 for 0.5 s, plays once, holds the last frame on blue.
- `/showcase?delay=0` — start the moment assets are ready.
- `/showcase?t=8.3` — render the exact frame at 8.3 s and hold (stills, review).
- `/showcase?loop=1` — loop.
- `/showcase?autoplay=0` — wait on frame 0; `window.__showcase.play()` starts it.

The stage is always 1080 × 1920 and scales to fit any window; at a 1080 × 1920 viewport it is 1:1.

### Render the film to MP4 (frame-exact)

```bash
npm run dev                # keep running
npm run record             # → out/popspot-collector-film.mp4 (1080×1920, 60 fps, 15.8 s)
```

`record` seeks the deterministic timeline to every frame (n/60 s), screenshots it with
Playwright, and encodes with ffmpeg — output never depends on machine speed. Needs a Chromium
(`CHROMIUM=/path/to/chrome` if Playwright's own is not installed) and `ffmpeg` on PATH
(`FFMPEG=/path/to/ffmpeg` otherwise).

## Product assets and data

- `public/popspot/products/` — the 16 real Pop Spot product photographs from the supplied pack, untouched.
- `public/popspot/cutouts/` — background-free versions made by `scripts/cutout.py` (flood-fill of the
  white page from the border + colour-to-alpha on the rim; no generative fill, no redrawn pixels).
  Re-run with `npm run cutouts` (Python 3 + Pillow + numpy).
- `src/data/products.pack.json` — the manifest as supplied.
- `src/data/products.ts` — the manifest every component renders from. Each entry records its
  verification level and source URL. popspotme.com was unreachable from the build environment, so
  names, numbers and the one price were verified from search-engine results for popspotme.com
  product pages (2026-09-26); see the header comment in that file. Unmatched images use neutral
  labels (OBJECT 01 / 09 / 11). No stock status, rarity score or drop date is claimed anywhere.

## Official logo

The official Pop Spot wordmark could not be downloaded, and redrawing it is off-limits, so the
name is set in plain type on a sticker. Put the real file in `public/popspot/brand/` and set
`officialLogoSrc` in `src/data/brand.ts`; the site and the film switch to it everywhere.

## Structure

```
src/
  data/        products.ts (manifest), brand.ts (facts + concept copy)
  components/  BrandMark, ProductObject, Cursor, TopBar, Boot, SearchHunt, ProductDetail, BagDrawer, Toast
  sections/    PortalHero, FandomPortal, CollectorWall, CollectorShelf, RarityScanner, DropMachine, Vault, EndFrame
  showcase/    Showcase (stage + seek API), scenes (portrait markup), timeline (the 15.8 s GSAP timeline)
  styles/      base.css (tokens, primitives), site.css (sections, overlays)
```

## Screenshots

Captured from the running build with Playwright (desktop 1440 × 900, mobile 390 × 844, film frames
at 1080 × 1920) — see [`docs/screens/`](docs/screens/). `showcase-contact-sheet.jpg` shows 20 frames
of the film across its 15.8 s.
