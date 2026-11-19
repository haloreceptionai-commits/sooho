"""Atmosphere particles drawn over finished frames (benchmark look): drifting dust motes in light, falling snow, night specks.

The benchmark never shows a perfectly clean frame: small soft particles drift through every shot (snow outside, dust in the
lantern light indoors). Drawing them in 2D after the 3D render costs a few milliseconds per frame, needs no extra GPU time and
is deterministic per frame (a particle's position is a pure function of its seed and the frame number), so a frame drawn twice,
on any machine, is identical."""
import math
import random

from PIL import Image, ImageDraw, ImageFilter

KINDS = ('dust', 'snow', 'night', 'none')
# per kind: count, size range (fraction of width), fall speed (frame heights per second), sway, colour, opacity range, share of big soft bokeh
SPEC = {'dust': (46, (.0018, .0042), -.012, .02, (255, 236, 196), (90, 190), .18),
        'snow': (90, (.0022, .0065), .075, .03, (250, 252, 255), (150, 235), .2),
        'night': (40, (.0015, .0035), .01, .015, (210, 225, 255), (70, 160), .15)}


def kind_for(shot):
    """Which particles a shot gets: snow when the place is snowy, specks at night, warm dust everywhere else."""
    p = shot.get('place') or {}
    if p.get('weather') == 'snow' or (p.get('params') or {}).get('ground') == 'snow' or 'snow' in str(p.get('terrain', '')): return 'snow'
    if p.get('weather') == 'rain' or shot.get('lighting') == 'rain': return 'none'   # the rain effect already moves
    if shot.get('lighting') == 'night': return 'night'
    return 'dust'


def draw(img, frame, kind='dust', seed=0, fps=30):
    """Returns img with the particles of this frame composited on top (img is not modified)."""
    if kind not in SPEC: return img
    count, (s0, s1), fall, sway, col, (a0, a1), big = SPEC[kind]
    W, H = img.size; t = frame / fps
    sharp = Image.new('RGBA', (W, H), (0, 0, 0, 0)); soft = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ds, dsoft = ImageDraw.Draw(sharp), ImageDraw.Draw(soft)
    rng = random.Random(seed * 7919 + hash(kind) % 1000)
    for i in range(count):
        x0, y0 = rng.random(), rng.random(); ph = rng.random() * math.tau; sp = .6 + .8 * rng.random()
        is_big = rng.random() < big
        r = W * (rng.uniform(s0, s1) * (3.2 if is_big else 1)); a = rng.randint(a0, a1) // (2 if is_big else 1)
        x = (x0 + sway * math.sin(t * .9 * sp + ph) + .004 * t * sp) % 1.0
        y = (y0 + fall * sp * t) % 1.0
        twinkle = .75 + .25 * math.sin(t * 2.3 * sp + ph)
        box = (x * W - r, y * H - r, x * W + r, y * H + r)
        (dsoft if is_big else ds).ellipse(box, fill=col + (int(a * twinkle),))
    soft = soft.filter(ImageFilter.GaussianBlur(W * .004)); sharp = sharp.filter(ImageFilter.GaussianBlur(W * .0009))
    out = img.convert('RGBA'); out.alpha_composite(soft); out.alpha_composite(sharp)
    return out.convert('RGB')
