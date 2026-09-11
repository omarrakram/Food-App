#!/usr/bin/env python3
"""Generates Akla's app icons from the brand palette.

Placeholder artwork, not final brand assets — but a deliberate mark in the
app's own colours reads far better than the Expo template logo, and it makes
the build look like the product rather than a scaffold.

Draws a warm paprika gradient with a bowl-and-steam mark: recognisable as food
at 48px, which is where an app icon actually has to work.

    python3 scripts/generate-icons.py

Replace with designed assets before submitting to either store.
"""

from __future__ import annotations

import math
import os

from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "assets", "images")

# Brand palette, kept in step with src/theme/palette.ts
PAPRIKA_400 = (245, 119, 62)
PAPRIKA_500 = (232, 93, 42)
PAPRIKA_700 = (156, 57, 21)
CREAM = (255, 251, 247)
CHARCOAL = (20, 18, 16)


def gradient(size: int, top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    """Vertical linear gradient, drawn a row at a time."""
    image = Image.new("RGB", (size, size), top)
    draw = ImageDraw.Draw(image)
    for y in range(size):
        t = y / max(1, size - 1)
        draw.line(
            [(0, y), (size, y)],
            fill=tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)),
        )
    return image


def draw_mark(image: Image.Image, colour: tuple[int, int, int]) -> None:
    """A bowl with three curls of steam, centred and optically balanced."""
    size = image.width
    draw = ImageDraw.Draw(image)
    unit = size / 100

    def px(value: float) -> float:
        return value * unit

    # The bowl sits slightly below centre so the steam does not make the whole
    # mark read as top-heavy.
    bowl_left, bowl_right = px(22), px(78)
    bowl_top, bowl_bottom = px(52), px(80)

    draw.pieslice(
        [bowl_left, bowl_top - (bowl_bottom - bowl_top), bowl_right, bowl_bottom],
        start=0,
        end=180,
        fill=colour,
    )
    # Foot, so the bowl reads as an object rather than a half-disc.
    draw.rounded_rectangle(
        [px(38), bowl_bottom - px(1), px(62), bowl_bottom + px(5)],
        radius=px(2.5),
        fill=colour,
    )

    # Steam: three sine curls of decreasing height.
    for index, (x_centre, height, width) in enumerate(
        ((px(38), px(22), px(5)), (px(50), px(28), px(6)), (px(62), px(22), px(5)))
    ):
        top = px(46) - height
        points = []
        steps = 28
        for step in range(steps + 1):
            t = step / steps
            y = px(46) - height * t
            x = x_centre + math.sin(t * math.pi * 2 + index) * width
            points.append((x, y))
        draw.line(points, fill=colour, width=round(px(4)), joint="curve")
        # Round the cap so the stroke does not end in a blunt corner.
        draw.ellipse(
            [points[-1][0] - px(2), top - px(2), points[-1][0] + px(2), top + px(2)],
            fill=colour,
        )


def write(image: Image.Image, name: str) -> None:
    path = os.path.join(OUT, name)
    image.save(path, "PNG", optimize=True)
    print(f"  {name}  {image.width}x{image.height}")


def main() -> None:
    print("Generating icons into assets/images/")

    # iOS / general app icon: 1024, no transparency, no rounding (the OS masks).
    icon = gradient(1024, PAPRIKA_400, PAPRIKA_700)
    draw_mark(icon, CREAM)
    write(icon, "icon.png")

    # Android adaptive icon: the foreground must keep its art inside the middle
    # ~66% safe zone, because the launcher masks and can parallax it.
    foreground = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    inner = Image.new("RGBA", (640, 640), (0, 0, 0, 0))
    draw_mark(inner, CREAM)
    foreground.paste(inner, (192, 192), inner)
    write(foreground, "android-icon-foreground.png")

    background = gradient(1024, PAPRIKA_400, PAPRIKA_700)
    write(background, "android-icon-background.png")

    # Monochrome (themed icons, Android 13+): solid silhouette on transparent.
    monochrome = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    mono_inner = Image.new("RGBA", (640, 640), (0, 0, 0, 0))
    draw_mark(mono_inner, (0, 0, 0))
    monochrome.paste(mono_inner, (192, 192), mono_inner)
    write(monochrome, "android-icon-monochrome.png")

    # Splash mark: brand colour on transparency, sized for a 160pt render.
    splash = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    draw_mark(splash, PAPRIKA_500)
    write(splash, "splash-icon.png")

    # Favicon for the web build.
    favicon = gradient(64, PAPRIKA_400, PAPRIKA_700)
    draw_mark(favicon, CREAM)
    write(favicon, "favicon.png")

    print(f"Done. Brand: paprika gradient on {CHARCOAL} / {CREAM}.")


if __name__ == "__main__":
    main()
