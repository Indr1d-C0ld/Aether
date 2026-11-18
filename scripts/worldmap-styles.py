# Compone le versioni alternative del planisfero dalla sagoma reale (maps/mask.png).
# Uso: python3 -I scripts/worldmap-styles.py client/public/art/maps
import sys, random
from PIL import Image

out = sys.argv[1]
W, H, LAT_TOP, LAT_BOT = 320, 180, 80.0, -58.0
mask = Image.open(f"{out}/mask.png").convert("L").load()
land = lambda x, y: 0 <= x < W and 0 <= y < H and mask[x, y] > 0
coast = lambda x, y: land(x, y) and any(not land(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
px = lambda lon, lat: (int((lon + 180) / 360 * W), int((LAT_TOP - lat) / (LAT_TOP - LAT_BOT) * H))

def new(color):
    im = Image.new("RGB", (W, H), color)
    return im, im.load()

# --- NORAD: il tabellone del comando strategico, fosfori ambra su nero (WarGames)
im, p = new((2, 2, 0))
for y in range(H):
    for x in range(W):
        if coast(x, y):
            p[x, y] = (255, 176, 0)
        elif land(x, y):
            p[x, y] = (38, 22, 0) if (x + y) % 2 else (26, 15, 0)
        elif x % 20 == 0 or y % 18 == 0:
            p[x, y] = (40, 24, 0)
# alone di fosforo attorno alle coste
src = im.copy().load()
for y in range(H):
    for x in range(W):
        if src[x, y] == (255, 176, 0):
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                if 0 <= x + dx < W and 0 <= y + dy < H and src[x + dx, y + dy] != (255, 176, 0):
                    r, g, b = p[x + dx, y + dy]
                    p[x + dx, y + dy] = (max(r, 110), max(g, 66), b)
im.save(f"{out}/norad.png")

# --- UPLINK: blu profondo e continenti a retino, come nei terminali del 2001
im, p = new((0, 6, 26))
for y in range(H):
    for x in range(W):
        if coast(x, y):
            p[x, y] = (90, 160, 255)
        elif land(x, y):
            p[x, y] = (38, 100, 200) if (x % 2 == 0 and y % 2 == 0) else (10, 34, 84)
        elif y % 2 == 0 and x % 32 == 0:
            p[x, y] = (8, 24, 60)
im.save(f"{out}/uplink.png")

# --- NEON: i continenti sono circuiti (texture PixelLab ritagliata sulla sagoma)
tex = Image.open(f"{out}/_tex_neon.png").convert("RGB").load()
im, p = new((6, 4, 15))
for y in range(H):
    for x in range(W):
        if coast(x, y):
            p[x, y] = (255, 43, 214)
        elif land(x, y):
            r, g, b = tex[x, y]
            p[x, y] = (int(r * 0.5), int(g * 0.5), int(b * 0.55))
        elif x % 16 == 0 or y % 15 == 0:
            p[x, y] = (20, 8, 34)
im.save(f"{out}/neon.png")

# --- NOTTE: la Terra vista dall'orbita, con le luci delle città vere
CITIES = [(-74, 40.7, 9), (-118, 34, 8), (-87.6, 41.9, 7), (-99, 19.4, 8), (-46.6, -23.5, 9), (-58.4, -34.6, 7), (-43.2, -22.9, 6), (-77, -12, 5),
          (-74.1, 4.7, 5), (-79.4, 43.7, 6), (-122.4, 37.8, 6), (-95.4, 29.8, 6), (-80.2, 25.8, 5), (-123, 49.3, 4), (-71, 42.4, 5), (-84.4, 33.7, 5),
          (-0.1, 51.5, 9), (2.3, 48.9, 8), (13.4, 52.5, 6), (12.5, 41.9, 6), (-3.7, 40.4, 6), (37.6, 55.8, 8), (29, 41, 7), (4.9, 52.4, 6), (9.2, 45.5, 6),
          (18, 59.3, 4), (30.5, 50.5, 5), (21, 52.2, 5), (16.4, 48.2, 5), (-9.1, 38.7, 4), (10.7, 59.9, 3), (24.9, 60.2, 3), (23.7, 38, 4),
          (31.2, 30, 8), (3.4, 6.5, 8), (28, -26.2, 6), (36.8, -1.3, 5), (18.4, -33.9, 4), (-17.4, 14.7, 3), (38.7, 9, 4), (15.3, -4.3, 5), (32.5, 15.6, 4),
          (51.4, 35.7, 6), (55.3, 25.2, 5), (46.7, 24.7, 5), (44.4, 33.3, 5), (67, 24.9, 7), (72.9, 19.1, 9), (77.2, 28.6, 9), (88.4, 22.6, 7), (90.4, 23.8, 7),
          (80.3, 13.1, 6), (77.6, 13, 6), (74.3, 31.5, 6), (69.3, 41.3, 4), (76.9, 43.2, 3), (82.9, 55, 4), (60.6, 56.8, 4),
          (116.4, 39.9, 9), (121.5, 31.2, 9), (113.3, 23.1, 9), (114.2, 22.3, 7), (104, 30.6, 7), (126.9, 37.6, 8), (139.7, 35.7, 10), (135.5, 34.7, 7),
          (100.5, 13.8, 7), (106.8, -6.2, 8), (103.8, 1.4, 6), (121, 14.6, 7), (105.8, 21, 5), (106.7, 10.8, 6), (101.7, 3.1, 5), (96.2, 16.8, 4),
          (151.2, -33.9, 6), (145, -37.8, 5), (153, -27.5, 4), (115.9, -32, 3), (174.8, -36.9, 3), (131.9, 43.1, 3), (-157.9, 21.3, 2), (-149.9, 61.2, 2)]
random.seed(2039)
im, p = new((2, 5, 16))
for y in range(H):
    for x in range(W):
        if land(x, y):
            p[x, y] = (9, 14, 20) if not coast(x, y) else (20, 40, 62)
for lon, lat, w in CITIES:
    cx, cy = px(lon, lat)
    for _ in range(w * 7):
        x = int(random.gauss(cx, 0.9 + w * 0.28)); y = int(random.gauss(cy, 0.7 + w * 0.2))
        if land(x, y):
            d = abs(x - cx) + abs(y - cy)
            p[x, y] = (255, 236, 160) if d <= 1 else (255, 176, 0) if d <= 3 else (150, 90, 20)
im.save(f"{out}/notte.png")
print("ok")
