"""Render the STL models in source_data/3D to small transparent PNG sprites.

The sprites are shaded in neutral grey so the game can tint them with the
player colour at runtime.  Only numpy and Pillow are required.

    python tools/render_models.py            # writes public/assets/models/*.png
    python tools/render_models.py --sheet sheet.png
"""
import argparse
import math
import os
import re
import struct

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'source_data', '3D')
OUT = os.path.join(ROOT, 'public', 'assets', 'models')

# STL file -> sprite name used by the game
MODELS = {
    'Human': 'human', 'Bulrathi': 'bulrathi', 'Gnolam': 'gnolam',
    'Klackon': 'klackon', 'Psilon': 'psilon', 'Silicoid': 'silicoid',
}
SHIPS = {'Fighter': 'interceptor', 'Cruiser': 'cruiser', 'Dreadnought': 'dreadnought', 'Base': 'starbase'}
EXTRA = {'Ancients': 'ancient', 'Guardian': 'guardian', 'Orbital': 'orbital', 'Marker': 'marker'}

SIZE = 128
SS = 4  # supersampling factor


def load_stl(path):
    data = open(path, 'rb').read()
    if data[:5] == b'solid' and b'facet' in data[:600]:
        found = re.findall(r'vertex\s+(\S+)\s+(\S+)\s+(\S+)', data.decode('utf8', 'ignore'))
        return np.array(found, dtype=np.float64).reshape(-1, 3, 3)
    count = struct.unpack('<I', data[80:84])[0]
    dt = np.dtype([('n', '<f4', 3), ('v', '<f4', (3, 3)), ('a', '<u2')])
    return np.frombuffer(data, dtype=dt, count=count, offset=84)['v'].astype(np.float64)


def align(tris):
    """Centre the mesh and turn its longest horizontal axis along X."""
    pts = tris.reshape(-1, 3)
    lo, hi = pts.min(0), pts.max(0)
    tris = tris - np.array([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]])
    flat = tris.reshape(-1, 3)[:, :2]
    ext = flat.max(0) - flat.min(0)
    if max(ext) / max(min(ext), 1e-6) > 1.25:
        cov = np.cov(flat.T)
        vals, vecs = np.linalg.eigh(cov)
        major = vecs[:, np.argmax(vals)]
        ang = -math.atan2(major[1], major[0])
        c, s = math.cos(ang), math.sin(ang)
        rot = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
        tris = tris @ rot.T
        flat = tris.reshape(-1, 3)
        tris = tris - np.array([(flat[:, 0].min() + flat[:, 0].max()) / 2, (flat[:, 1].min() + flat[:, 1].max()) / 2, 0])
    return tris


def render(tris, az=-32.0, el=48.0, light=(-0.65, -0.35, 0.55)):
    az, el = math.radians(az), math.radians(el)
    ca, sa = math.cos(az), math.sin(az)
    rz = np.array([[ca, -sa, 0], [sa, ca, 0], [0, 0, 1]])
    t = tris @ rz.T
    sx = t[:, :, 0]
    sy = t[:, :, 1] * math.sin(el) + t[:, :, 2] * math.cos(el)
    depth = -t[:, :, 1] * math.cos(el) + t[:, :, 2] * math.sin(el)

    n = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0])
    ln = np.linalg.norm(n, axis=1)
    keep = ln > 1e-9
    n = n[keep] / ln[keep][:, None]
    sx, sy, depth = sx[keep], sy[keep], depth[keep]
    to_cam = np.array([0.0, -math.cos(el), math.sin(el)])
    n = np.where((n @ to_cam)[:, None] < 0, -n, n)

    lv = np.array(light, dtype=np.float64)
    lv = lv / np.linalg.norm(lv)
    lam = np.clip(n @ lv, 0, 1)
    rim = np.clip(1 - (n @ to_cam), 0, 1) * 0.10
    shade = np.clip(0.18 + 0.82 * lam ** 1.25 + rim, 0, 1)
    grey = (46 + 209 * shade).astype(np.uint8)

    w = sx.max() - sx.min()
    h = sy.max() - sy.min()
    scale = (SIZE * SS * 0.92) / max(w, h)
    canvas = SIZE * SS
    px = (sx - (sx.min() + sx.max()) / 2) * scale + canvas / 2
    py = canvas / 2 - (sy - (sy.min() + sy.max()) / 2) * scale

    order = np.argsort(depth.mean(axis=1))
    img = Image.new('RGBA', (canvas, canvas), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    for i in order:
        g = int(grey[i])
        draw.polygon([(px[i, 0], py[i, 0]), (px[i, 1], py[i, 1]), (px[i, 2], py[i, 2])], fill=(g, g, g, 255))
    return img


def finish(img):
    """Dark outline, downsample and crop to a square sprite."""
    alpha = img.getchannel('A')
    grown = alpha.filter(ImageFilter.MaxFilter(2 * SS + 1))
    outline = Image.new('RGBA', img.size, (28, 30, 40, 255))
    outline.putalpha(grown)
    out = Image.alpha_composite(outline, img)
    box = out.getbbox()
    out = out.crop(box)
    w, h = out.size
    k = (SIZE - 6) / max(w, h)
    out = out.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
    sprite = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    sprite.paste(out, ((SIZE - out.width) // 2, (SIZE - out.height) // 2), out)
    return sprite


def jobs():
    for stl, name in MODELS.items():
        for part, ship in SHIPS.items():
            yield f'{stl} {part}.stl', f'{name}-{ship}.png'
    for stl, name in EXTRA.items():
        yield f'{stl}.stl', f'{name}.png'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=OUT)
    ap.add_argument('--sheet', help='also write a contact sheet to this path')
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    made = []
    for src, dst in jobs():
        path = os.path.join(SRC, src)
        if not os.path.exists(path):
            print('missing', src)
            continue
        sprite = finish(render(align(load_stl(path))))
        sprite.save(os.path.join(args.out, dst))
        made.append((dst, sprite))
        print('wrote', dst)
    if args.sheet and made:
        cols = 8
        rows = math.ceil(len(made) / cols)
        sheet = Image.new('RGBA', (cols * SIZE, rows * SIZE), (74, 98, 140, 255))
        for i, (_, sprite) in enumerate(made):
            sheet.alpha_composite(sprite, ((i % cols) * SIZE, (i // cols) * SIZE))
        sheet.convert('RGB').save(args.sheet)


if __name__ == '__main__':
    main()
