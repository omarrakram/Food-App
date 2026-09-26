# Nothing Personal — Issue 01 (unofficial concept)

**Install**

```
cd nothing-personal
npm install
```

**Run**

```
npm run dev
```

Opens on http://localhost:5173 (the scrolling desktop site). `npm run dev` first downloads the official imagery listed in `scripts/assets_manifest.json` into `public/np/real/`. Anything it can't fetch falls back to the stand-ins in `public/np/standin/`.

**Showcase URL**

http://localhost:5173/showcase (or `?showcase`). A 500 ms prep follows START / Enter, then 16 s of deterministic playback.

**Recommended recording viewport**

9:16, 1080 × 1920. The stage scales to the window height. For a frame-perfect file with no screen recorder:

```
npm run render            # → out/nothing-personal-showcase.mp4, 1080×1920, 60 fps
npm run render -- --fps 30
```

The render uses the Chrome installed on your system; set `CHROME=/path/to/chrome` to point it at another browser.

**Replay**

- `R`: replay
- `SPACE`: play / pause
- `ESC`: reset
- `← →`: step one frame while paused (hold Shift to step 1 s)

Controls hide while playing. `?t=8.4` opens paused on any frame; `?safe` overlays the TikTok safe zones.

**Where things live**

- `src/lib/timeline.ts`: the master timeline and beat map (`BEATS`, in seconds) that drives every scene.
- `src/Scenes.tsx`: the six scenes: Hook, Manifesto, Catalogue, Separation, Detail, Ending.
- `src/styles.css`: type system, 9:16 compositions, and the landscape overrides for the desktop site.
- `src/lib/assets.ts`: which image goes where (official file → stand-in), crops, and the halftone red plate.
- `src/lib/portal.ts`: the tee-silhouette portal.
- `src/lib/site.ts`: desktop scroll and pointer behaviour.
- `src/content.ts`: product names, prices, credits.
- `public/np/`: imagery. `real/` holds the downloaded official assets (not committed); `standin/` holds procedural renders from `scripts/render-standins.mjs`.

Independent, unofficial concept by Omar Akram. Not affiliated with Nothing Personal. Brand names, products and photography remain the property of their respective owners.
