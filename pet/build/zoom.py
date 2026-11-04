import sys
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
cells = [tuple(map(int, c.split(','))) for c in sys.argv[3:]]
a = Image.open(src).convert('RGBA')
S = 2
sheet = Image.new('RGBA', (len(cells) * 192 * S, 2 * 208 * S))
for i, (r, c) in enumerate(cells):
    cell = a.crop((c * 192, r * 208, c * 192 + 192, r * 208 + 208))
    for j, bg in enumerate(['#1e1e1e', '#f4f4f4']):
        b = Image.new('RGBA', cell.size, bg); b.alpha_composite(cell)
        sheet.paste(b.resize((192 * S, 208 * S), Image.NEAREST), (i * 192 * S, j * 208 * S))
sheet.save(out)
