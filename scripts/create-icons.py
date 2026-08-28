import os
from PIL import Image, ImageDraw

ROOT = r"c:\Users\Design\Desktop\Ai Test"
SRC = r"C:\Users\Design\.cursor\projects\c-Users-Design-Desktop-Ai-Test\assets\c__Users_Design_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_gpt-image-2_a_surreal_and_vibrant_cinematic_photo_of_I_have_designed_a_program_that_tracks_j-0-64f387f3-9e5b-456d-8986-fb7d2774b506.png"

os.makedirs(os.path.join(ROOT, "build"), exist_ok=True)
os.makedirs(os.path.join(ROOT, "src", "assets"), exist_ok=True)

img = Image.open(SRC).convert("RGBA")
w, h = img.size

# Full logo for in-app use
logo_path = os.path.join(ROOT, "src", "assets", "joblio-logo.png")
img.save(logo_path, "PNG")
print(f"Saved {logo_path}")

# Crop the colorful j ribbon mark (upper ~58% of square image, centered)
crop_h = int(h * 0.58)
left = int(w * 0.18)
right = int(w * 0.82)
mark = img.crop((left, 0, right, crop_h))

# Square the crop with padding on white
mw, mh = mark.size
side = max(mw, mh)
square = Image.new("RGBA", (side, side), (255, 255, 255, 255))
ox = (side - mw) // 2
oy = (side - mh) // 2
square.paste(mark, (ox, oy), mark)

# Resize to 512x512
icon = square.resize((512, 512), Image.Resampling.LANCZOS)

# Apply rounded corners (Windows-style ~18% radius)
radius = int(512 * 0.18)
mask = Image.new("L", (512, 512), 0)
draw = ImageDraw.Draw(mask)
draw.rounded_rectangle((0, 0, 512, 512), radius=radius, fill=255)

rounded = Image.new("RGBA", (512, 512), (255, 255, 255, 0))
rounded.paste(icon, (0, 0))
rounded.putalpha(mask)

icon_path = os.path.join(ROOT, "build", "icon.png")
rounded.save(icon_path, "PNG")
print(f"Saved {icon_path}")

# Also save a smaller icon-only asset for navbar
nav_icon = square.resize((128, 128), Image.Resampling.LANCZOS)
nav_mask = Image.new("L", (128, 128), 0)
nav_draw = ImageDraw.Draw(nav_mask)
nav_draw.rounded_rectangle((0, 0, 128, 128), radius=int(128 * 0.18), fill=255)
nav_rounded = Image.new("RGBA", (128, 128), (255, 255, 255, 0))
nav_rounded.paste(nav_icon, (0, 0))
nav_rounded.putalpha(nav_mask)
nav_path = os.path.join(ROOT, "src", "assets", "joblio-icon.png")
nav_rounded.save(nav_path, "PNG")
print(f"Saved {nav_path}")
