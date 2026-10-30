#!/usr/bin/env python3
"""Generate the Sisu TV launcher icons.

The mark is a mint-to-cyan rounded square with a dark S, sized so it stays
readable in the LG launcher at 80 px and still looks sharp on the LG Content
Store card at 400 px.

Requires Pillow (bundled with the harness python, or `pip install pillow`).
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "app")

MINT = (110, 231, 200)
CYAN = (61, 214, 255)
INK = (6, 17, 25)

FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def gradient(size):
    """Diagonal mint -> cyan gradient."""
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2.0 * (size - 1))
            px[x, y] = (
                int(MINT[0] + (CYAN[0] - MINT[0]) * t),
                int(MINT[1] + (CYAN[1] - MINT[1]) * t),
                int(MINT[2] + (CYAN[2] - MINT[2]) * t),
            )
    return img


def rounded_mask(size, radius):
    mask = Image.new("L", (size * 4, size * 4), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, size * 4 - 1, size * 4 - 1], radius=radius * 4, fill=255)
    return mask.resize((size, size), Image.LANCZOS)


def font(size):
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def make_icon(size):
    img = gradient(size).convert("RGBA")
    img.putalpha(rounded_mask(size, int(size * 0.22)))

    draw = ImageDraw.Draw(img)
    f = font(int(size * 0.62))
    text = "S"
    box = draw.textbbox((0, 0), text, font=f)
    w = box[2] - box[0]
    h = box[3] - box[1]
    draw.text(
        ((size - w) / 2 - box[0], (size - h) / 2 - box[1] - size * 0.02),
        text,
        font=f,
        fill=INK,
    )

    # A thin dark inner ring keeps the icon from bleeding into a light launcher row.
    ring = ImageDraw.Draw(img)
    ring.rounded_rectangle(
        [1, 1, size - 2, size - 2], radius=int(size * 0.21), outline=(6, 17, 25, 40), width=max(1, size // 100)
    )
    return img


def main():
    large = make_icon(400)
    large.save(os.path.join(OUT, "largeIcon.png"))
    make_icon(80).save(os.path.join(OUT, "icon.png"))
    print("wrote app/icon.png (80x80) and app/largeIcon.png (400x400)")


if __name__ == "__main__":
    main()
