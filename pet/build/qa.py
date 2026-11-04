#!/usr/bin/env python3
"""QA: contact sheet and per-row preview GIFs (native and 96 px wide, dark and light)."""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

W, H = 192, 208
ROWS = [("idle", [280, 110, 110, 140, 140, 320]), ("running-right", [120] * 7 + [220]), ("running-left", [120] * 7 + [220]),
        ("waving", [140] * 3 + [280]), ("jumping", [140] * 4 + [280]), ("failed", [140] * 7 + [240]),
        ("waiting", [150] * 5 + [260]), ("running", [120] * 5 + [220]), ("review", [150] * 5 + [280])]
BGS = {"dark": (30, 30, 30), "light": (244, 244, 244)}

src, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
a = Image.open(src).convert("RGBA")
cell = lambda r, c: a.crop((c * W, r * H, c * W + W, r * H + H))

# contact sheet: each row on dark and on light, with a label column and cell borders (QA only, not in the atlas)
LAB = 110
sheet = Image.new("RGB", (LAB + 8 * W, 2 * 9 * H), (90, 90, 90))
d = ImageDraw.Draw(sheet)
for r, (name, durs) in enumerate(ROWS):
    for b, (bn, col) in enumerate(BGS.items()):
        y = (r * 2 + b) * H
        d.text((6, y + 6), f"{r} {name}\n{bn}", fill=(255, 255, 255) if b == 0 else (0, 0, 0))
        d.rectangle((0, y, LAB - 1, y + H - 1), outline=(60, 60, 60))
        for c in range(8):
            bg = Image.new("RGBA", (W, H), col + (255,))
            bg.alpha_composite(cell(r, c))
            sheet.paste(bg.convert("RGB"), (LAB + c * W, y))
            d.rectangle((LAB + c * W, y, LAB + c * W + W - 1, y + H - 1), outline=(128, 128, 128))
sheet.save(out / "contact-sheet.png")

for r, (name, durs) in enumerate(ROWS):
    for bn, col in BGS.items():
        for size in ("native", "96"):
            frames = []
            for c in range(len(durs)):
                bg = Image.new("RGBA", (W, H), col + (255,))
                bg.alpha_composite(cell(r, c))
                im = bg.convert("RGB")
                if size == "96":
                    im = im.resize((96, 104), Image.LANCZOS)
                frames.append(im)
            frames[0].save(out / f"{r}-{name}-{bn}-{size}.gif", save_all=True, append_images=frames[1:], duration=durs, loop=0, disposal=1)
print(out)
