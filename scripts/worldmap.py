# Disegna il planisfero di base da una sagoma reale dei continenti (Natural Earth 110m, pubblico dominio).
# Uso: python3 -I scripts/worldmap.py <land.geojson> <cartella di uscita>
# Proiezione (uguale a shared/rules.ts → project): x lineare in longitudine, y lineare in latitudine da 80°N a 58°S.
import json, sys
from PIL import Image, ImageDraw

W, H, LAT_TOP, LAT_BOT = 320, 180, 80.0, -58.0
src, out = sys.argv[1], sys.argv[2]

def px(lon, lat):
    return ((lon + 180.0) / 360.0 * W, (LAT_TOP - lat) / (LAT_TOP - LAT_BOT) * H)

S = 4  # supersampling per coste più pulite
mask = Image.new("L", (W * S, H * S), 0)
d = ImageDraw.Draw(mask)
for f in json.load(open(src))["features"]:
    g = f["geometry"]
    polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
    for poly in polys:
        ring = [tuple(c * S for c in px(lon, lat)) for lon, lat in poly[0]]
        if len(ring) >= 3:
            d.polygon(ring, fill=255)
        for hole in poly[1:]:
            d.polygon([tuple(c * S for c in px(lon, lat)) for lon, lat in hole], fill=0)
mask = mask.resize((W, H), Image.LANCZOS).point(lambda v: 255 if v > 110 else 0)
mask.save(f"{out}/mask.png")
m = mask.load()

def h(x, y, seed):
    n = (x * 374761393 + y * 668265263 + seed * 1442695041) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 65535.0

img = Image.new("RGB", (W, H))
p = img.load()
for y in range(H):
    for x in range(W):
        land = m[x, y] > 0
        if land:
            coast = any(not (0 <= x + dx < W and 0 <= y + dy < H) or m[x + dx, y + dy] == 0 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= x + dx < W and 0 <= y + dy < H)
            if coast:
                p[x, y] = (46, 242, 255) if h(x, y, 7) > 0.8 else (28, 86, 112)
            else:
                p[x, y] = (12, 26, 42) if (x + y) % 2 == 0 else (9, 20, 34)
        elif x % 16 == 0 or y % 15 == 0:
            p[x, y] = (9, 14, 28)
        else:
            p[x, y] = (10, 18, 34) if h(x, y, 3) > 0.985 else (3, 4, 10)
img.save(f"{out}/vector.png")
# base ad alto contrasto per le versioni generate (img2img): terra chiara, mare scuro
flat = Image.new("RGB", (W, H))
q = flat.load()
for y in range(H):
    for x in range(W):
        q[x, y] = (40, 120, 150) if m[x, y] > 0 else (4, 6, 16)
flat.save(f"{out}/_base.png")
print("ok", sum(1 for y in range(H) for x in range(W) if m[x, y]) / (W * H))
