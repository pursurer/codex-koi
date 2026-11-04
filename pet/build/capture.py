#!/usr/bin/env python3
"""Render the ASCII Koi atlas in headless Chrome, add the optional rim, save it, and report cell bounds."""
import base64, html, json, re, subprocess, sys, tempfile
from pathlib import Path
from PIL import Image, ImageChops, ImageFilter

HERE = Path(__file__).resolve().parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
USED = [6, 8, 8, 4, 5, 8, 6, 6, 6]
NAMES = ["idle", "running-right", "running-left", "waving", "jumping", "failed", "waiting", "running", "review"]


def render(query: str, out: Path) -> dict:
    url = (HERE / "sprite.html").as_uri() + ("?" + query if query else "")
    with tempfile.TemporaryDirectory() as prof:
        r = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
                            f"--user-data-dir={prof}", "--allow-file-access-from-files", "--hide-scrollbars",
                            "--virtual-time-budget=15000", "--dump-dom", url],
                           capture_output=True, text=True, timeout=120)
    dom = r.stdout
    meta = html.unescape(re.search(r'<pre id="meta">(.*?)</pre>', dom, re.S).group(1))
    if not meta or meta.startswith("ERROR"):
        sys.exit("render failed: " + meta + r.stderr[-2000:])
    data = re.search(r'<pre id="atlas">data:image/png;base64,(.*?)</pre>', dom, re.S).group(1)
    out.write_bytes(base64.b64decode(data))
    return json.loads(meta)


def add_rim(img: Image.Image, colour=(13, 19, 21), strength=0.9, thr=240) -> Image.Image:
    """A one-pixel ring of pond colour around the koi's silhouette, under it, so the white body holds on white."""
    a = img.getchannel("A")
    solid = a.point(lambda v: 255 if v >= thr else 0)
    grown = solid.filter(ImageFilter.MaxFilter(3))
    ring = ImageChops.subtract(grown, solid).point(lambda v: int(v * strength))
    under = Image.new("RGBA", img.size, colour + (0,))
    under.putalpha(ring)
    under.alpha_composite(img)
    return under


def clean(img: Image.Image) -> Image.Image:
    """Zero the colour of fully transparent pixels and blank unused cells."""
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            if px[x, y][3] == 0:
                px[x, y] = (0, 0, 0, 0)
    for r, n in enumerate(USED):
        img.paste((0, 0, 0, 0), (n * 192, r * 208, 8 * 192, r * 208 + 208))
    return img


def on_bg(img: Image.Image, colour) -> Image.Image:
    bg = Image.new("RGBA", img.size, colour)
    bg.alpha_composite(img)
    return bg


def bounds(img: Image.Image):
    a = img.getchannel("A")
    report = []
    for r, n in enumerate(USED):
        boxes = [a.crop((c * 192, r * 208, c * 192 + 192, r * 208 + 208)).getbbox() for c in range(n)]
        x0 = min(b[0] for b in boxes); y0 = min(b[1] for b in boxes)
        x1 = max(b[2] for b in boxes); y1 = max(b[3] for b in boxes)
        report.append(f"{r} {NAMES[r]:14s} x {x0:3d}-{x1:3d}  y {y0:3d}-{y1:3d}  margins L{x0} R{192 - x1} T{y0} B{208 - y1}")
    return report


if __name__ == "__main__":
    query = sys.argv[1] if len(sys.argv) > 1 else ""
    name = sys.argv[2] if len(sys.argv) > 2 else "atlas"
    rim = "--rim" in sys.argv
    raw = HERE / "out" / f"{name}-raw.png"
    meta = render(query, raw)
    print(json.dumps(meta))
    a = Image.open(raw).convert("RGBA")
    if rim:
        a = add_rim(a)
    a = clean(a)
    a.save(HERE / "out" / f"{name}.png")
    pair = Image.new("RGBA", (a.width * 2, a.height))
    pair.paste(on_bg(a, "#1e1e1e"), (0, 0))
    pair.paste(on_bg(a, "#f4f4f4"), (a.width, 0))
    pair.save(HERE / "out" / f"{name}-dark-light.png")
    print("\n".join(bounds(a)))
