"""
Cut the supplied Pop Spot product photographs out of their white page backgrounds.

The pack's images are screenshots of product photos: a white field, thin grey frame
lines at the edges, and in a few cases a UI icon or a line of caption text. This
script removes only those: it never paints, fills or invents product pixels.

  1. Blank a margin at the edges and any listed artefact rectangles to white.
  2. Flood-fill the white field from the border (only pixels connected to the edge
     become background, so white parts *inside* a figure are kept).
  3. Un-mix the anti-aliased rim from white (colour-to-alpha), so edges stay soft.
  4. Drop specks smaller than a threshold (stray caption text), keep the product
     and its printed stickers.
  5. Trim to the content, pad, resample 2x with Lanczos, save WebP with alpha.

Run from popspot/:  python3 scripts/cutout.py
Requires Pillow and numpy.
"""
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public/popspot/products"
OUT = ROOT / "public/popspot/cutouts"

# Per-image clean-up: edge margin to blank, and extra artefact boxes (x0, y0, x1, y1).
CONFIG = {
    "01": {"margin": 6},
    "02": {"margin": 6},
    "03": {"margin": 7},
    "04": {"margin": 4},
    "05": {"margin": 5},
    "06": {"margin": 7},
    "07": {"margin": 4},
    "08": {"margin": 6, "boxes": [(20, 450, 130, 543)]},  # "expand" UI button
    "09": {"margin": 6},
    "10": {"margin": 4, "boxes": [(0, 470, 40, 535)]},  # "expand" UI arrows
    "11": {"margin": 7, "boxes": [(0, 330, 337, 348)], "tol": 3, "ramp": 30, "close": 19},  # caption text; faint white dress
    "12": {"margin": 5},
    "13": {"margin": 4},
    "14": {"margin": 4, "boxes": [(0, 0, 160, 50)]},  # faint caption text
    "15": {"margin": 4, "boxes": [(0, 0, 381, 22), (360, 0, 381, 372)]},  # UI bars
    "16": {"margin": 5},
}

SCALE = 2


def flood_background(near_white: np.ndarray) -> np.ndarray:
    h, w = near_white.shape
    bg = np.zeros((h, w), dtype=bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if near_white[y, x] and not bg[y, x]:
                bg[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if near_white[y, x] and not bg[y, x]:
                bg[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and near_white[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True
                q.append((ny, nx))
    return bg


def components(mask: np.ndarray):
    h, w = mask.shape
    seen = np.zeros_like(mask)
    out = []
    for y0 in range(h):
        for x0 in range(w):
            if mask[y0, x0] and not seen[y0, x0]:
                pix = []
                q = deque([(y0, x0)])
                seen[y0, x0] = True
                while q:
                    y, x = q.popleft()
                    pix.append((y, x))
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = y + dy, x + dx
                            if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                                seen[ny, nx] = True
                                q.append((ny, nx))
                out.append(pix)
    return out


def process(num: str, cfg: dict):
    src = SRC / f"popspot_product_{num}.png"
    rgb = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
    h, w, _ = rgb.shape
    m = cfg.get("margin", 5)
    rgb[:m, :] = 255
    rgb[h - m :, :] = 255
    rgb[:, :m] = 255
    rgb[:, w - m :] = 255
    for x0, y0, x1, y1 in cfg.get("boxes", []):
        rgb[y0:y1, x0:x1] = 255

    darkness = 255 - rgb.min(axis=2)  # 0 = pure white
    tol = cfg.get("tol", 10)
    bg = flood_background(darkness <= tol)

    # Rim: foreground pixels within 2px of the background get colour-to-alpha
    # against white; everything deeper inside the figure stays fully opaque.
    bg_img = Image.fromarray((bg * 255).astype(np.uint8))
    near = np.asarray(bg_img.filter(ImageFilter.MaxFilter(5))) > 0
    rim = near & ~bg
    alpha = np.ones((h, w), dtype=np.float32)
    alpha[bg] = 0.0
    ramp = np.clip((darkness - tol) / float(cfg.get("ramp", 70)), 0.0, 1.0)
    alpha[rim] = np.maximum(ramp[rim], 0.0)

    # Drop small specks (stray caption text); keep the product and its stickers.
    solid = alpha > 0.5
    comps = components(solid)
    keep = np.zeros_like(solid)
    min_area = max(60, int(0.004 * h * w))
    for pix in comps:
        if len(pix) >= min_area:
            ys, xs = zip(*pix)
            keep[list(ys), list(xs)] = True
    keep_img = Image.fromarray((keep * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))
    alpha[np.asarray(keep_img) == 0] = 0.0

    # Optional morphological close: where a white garment meets the white page,
    # the flood can bite a notch into the hem. Closing restores those *source*
    # pixels to opaque; it does not create new ones.
    k = cfg.get("close")
    if k:
        m_img = Image.fromarray(((alpha > 0.5) * 255).astype(np.uint8))
        closed = np.asarray(m_img.filter(ImageFilter.MaxFilter(k)).filter(ImageFilter.MinFilter(k))) > 0
        alpha = np.where(closed, np.maximum(alpha, 1.0), alpha)

    # Un-premultiply the rim from white so no white halo remains.
    a = alpha[..., None]
    safe = np.where(a > 0.02, a, 1.0)
    colour = np.clip((rgb - (1.0 - a) * 255.0) / safe, 0, 255)
    colour = np.where(a > 0.02, colour, 0)
    rgba = np.dstack([colour, alpha * 255.0]).astype(np.uint8)

    img = Image.fromarray(rgba, "RGBA")
    bbox = img.getbbox()
    img = img.crop(bbox)
    pad = 6
    canvas = Image.new("RGBA", (img.width + pad * 2, img.height + pad * 2), (0, 0, 0, 0))
    canvas.paste(img, (pad, pad))
    canvas = canvas.resize((canvas.width * SCALE, canvas.height * SCALE), Image.LANCZOS)
    OUT.mkdir(parents=True, exist_ok=True)
    dst = OUT / f"product-{num}.webp"
    canvas.save(dst, "WEBP", quality=92, method=6)
    return dst.name, canvas.size


if __name__ == "__main__":
    import sys

    only = set(sys.argv[1:])
    for num, cfg in CONFIG.items():
        if only and num not in only:
            continue
        name, size = process(num, cfg)
        print(f"{name}  {size[0]}x{size[1]}")
