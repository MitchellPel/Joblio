"""Generate crisp Windows icon.ico + icon.png from high-res source."""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "joblio-app-icon-01.png")
BUILD = os.path.join(ROOT, "build")
ICON_PNG = os.path.join(BUILD, "icon.png")
ICON_ICO = os.path.join(BUILD, "icon.ico")

# ~18% corner radius — matches Windows 11 squircle-style app tiles
CORNER_RADIUS_RATIO = 0.185

# Largest first — electron-builder validates the primary ICO entry (must be >= 256px)
ICO_SIZES = [(512, 512), (256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (24, 24), (16, 16)]

os.makedirs(BUILD, exist_ok=True)


def round_corners(im: Image.Image, radius_ratio: float = CORNER_RADIUS_RATIO) -> Image.Image:
    """Clip icon to a rounded square (white corners for taskbar/desktop)."""
    size = im.size[0]
    radius = max(2, int(size * radius_ratio))
    rgba = im.convert("RGBA")

    mask = Image.new("L", im.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)

    # Transparent outside the rounded rect — taskbar/desktop show true rounded corners
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    out.paste(rgba, (0, 0), mask)
    return out


if not os.path.exists(SRC):
    raise SystemExit(f"Source not found: {SRC}")

src = Image.open(SRC).convert("RGBA")
print(f"Source: {SRC} ({src.width}x{src.height})")

# Master PNG for electron-builder
master = round_corners(src.resize((1024, 1024), Image.Resampling.LANCZOS))
master.save(ICON_PNG, "PNG", optimize=True)
print(f"Saved {ICON_PNG} (1024x1024, rounded)")

# Multi-resolution ICO — each size rendered + rounded separately (crisp at 16–32px)
icons = [
    round_corners(src.resize(size, Image.Resampling.LANCZOS))
    for size in ICO_SIZES
]
icons[0].save(
    ICON_ICO,
    format="ICO",
    sizes=[(im.width, im.height) for im in icons],
    append_images=icons[1:],
)
print(f"Saved {ICON_ICO} with sizes: {', '.join(f'{w}' for w, h in ICO_SIZES)} (rounded)")
