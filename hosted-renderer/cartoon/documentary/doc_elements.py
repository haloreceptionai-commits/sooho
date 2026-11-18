"""Animated elements on the long-form boards: date plaques, name cartouches, a red hotspot on the parchment map and a turning emblem.

Everything is timed to the words that name it: a year appears on the word that says it, a place gets its cartouche and (on the
antique map) a glowing hotspot when it is spoken, and each element leaves when the story moves on. Each frame is a pure
function of its time, so any machine draws the same picture. Nothing here states a fact the narrator did not say.
"""
import math
import re

import numpy as np
from PIL import Image

from doc_gfx import Layer, font, over, text_size, window, ease_out_back, smooth

INK_BROWN = (74, 46, 22)
CREAM = (250, 240, 214)
HOT = (226, 52, 36)
GOLD_LEAF = (214, 160, 70)

# A small registry of places the narration names, with real longitude and latitude (projected onto the map card).
PLACES = {
    'peru': (-75.0, -10.0), 'china': (104.0, 35.0), 'india': (78.0, 21.0), 'brazil': (-52.0, -14.0), 'japan': (138.0, 36.0),
    'egypt': (30.0, 27.0), 'rome': (12.5, 41.9), 'london': (-0.1, 51.5), 'cardiff': (-3.2, 51.5), 'australia': (134.0, -25.0),
    'iowa': (-93.6, 42.0), 'chicago': (-87.6, 41.9), 'new york': (-74.0, 40.7), 'america': (-98.0, 39.0), 'europe': (10.0, 50.0),
    'africa': (20.0, 5.0), 'pacific': (-150.0, -10.0), 'atlantic': (-30.0, 20.0), 'mongolia': (103.0, 46.0), 'russia': (95.0, 60.0),
}
YEAR = re.compile(r'^(1[0-9]{3}|20[0-9]{2})s?$')
ONE_WORD_PLACES = {k for k in PLACES if ' ' not in k}


def _norm(t):
    return re.sub(r"[^a-z0-9]", '', str(t).lower())


def project(lon, lat, W, H):
    """Equirectangular position on the full-frame map (the same mapping the parchment map uses)."""
    return int((lon + 180.0) / 360.0 * W), int((90.0 - lat) / 180.0 * H)


def schedule(words, beat_start, beat_end):
    """Element events for one beat: words is the beat's own list of {'text','t0','t1'} (absolute seconds).
    Returns events with times relative to the beat start."""
    dur = max(0.1, beat_end - beat_start)
    out, last_place_at = [], -9.0
    for i, w in enumerate(words):
        at = max(0.0, w['t0'] - beat_start)
        if at >= dur - .2: continue
        text = _norm(w['text'])
        if YEAR.match(text):
            out.append({'kind': 'stamp', 'text': text.rstrip('s'), 'at': at, 'end': min(dur, at + 3.2)})
            continue
        if text in ONE_WORD_PLACES and at - last_place_at > 2.5:
            name = w['text'].strip(".,;:!?\"'").upper()
            lon, lat = PLACES[text]
            out.append({'kind': 'cartouche', 'text': name, 'at': at, 'end': min(dur, at + 2.8), 'lon': lon, 'lat': lat,
                        'side': 1 if len(out) % 2 == 0 else -1})
            last_place_at = at
    for i in range(len(words) - 1):   # two-word places, e.g. "new york" and "fort dodge" (only the first matched word is drawn)
        pair = f"{_norm(words[i]['text'])} {_norm(words[i + 1]['text'])}"
        if pair in PLACES:
            at = max(0.0, words[i]['t0'] - beat_start)
            if at < dur - .2:
                lon, lat = PLACES[pair]
                out.append({'kind': 'cartouche', 'text': pair.upper(), 'at': at, 'end': min(dur, at + 2.8), 'lon': lon, 'lat': lat,
                            'side': 1 if len(out) % 2 == 0 else -1})
    return out


def _plaque(W, H, text, scale, fnt_size):
    """A cream plaque with a brown border and gold leaf corners (the reference's cartouche look)."""
    f = font('oswald', int(fnt_size), 700)
    tw, th = text_size(text, f)
    pw, ph = int(tw + fnt_size * 1.6), int(th + fnt_size * 1.0)
    L = Layer(pw + 8, ph + 8)
    L.rect(4, 4, pw, ph, CREAM, 255, radius=int(fnt_size * .25))
    L.polyline([(10, 10), (pw - 2, 10), (pw - 2, ph - 2), (10, ph - 2)], INK_BROWN, width=max(2, int(fnt_size * .08)), closed=True)
    for cx, cy in ((10, 10), (pw - 2, 10), (pw - 2, ph - 2), (10, ph - 2)):
        L.circle((cx, cy), max(3, int(fnt_size * .12)), GOLD_LEAF)
    L.text((pw / 2 + 4, (ph - th) / 2 + 4), text, f, INK_BROWN, align='center')   # xy is the top of the text box
    return L


def draw(frame, events, t, W, H, style='parchment'):
    """Draws the elements that are on screen at beat time t (seconds) onto frame (RGB uint8, modified and returned)."""
    base = frame
    layer_total = None
    for ev in events:
        if not (ev['at'] <= t <= ev['end']):
            continue
        age = t - ev['at']
        pop = ease_out_back(min(1.0, age / .45)) if age < .45 else 1.0
        fade = min(1.0, (ev['end'] - t) / .4) if ev['end'] - t < .4 else 1.0
        alpha = int(255 * max(0.0, min(1.0, fade)))
        if ev['kind'] == 'stamp':
            pl = _plaque(W, H, ev['text'], 1, int(H * .075))
            scale = max(.05, pop)
            pl = _scale(pl, scale)
            over(base, pl, opacity=alpha / 255, at=(int(W * .5 - pl.w / 2), int(H * .1)))
        elif ev['kind'] == 'cartouche':
            pl = _plaque(W, H, ev['text'], 1, int(H * .05))
            sway = math.sin(t * 1.3 + ev['at']) * 2.2
            pl = _rotate(pl, sway * (1 if ev['side'] > 0 else -1))
            pl = _scale(pl, max(.05, pop))
            x = int(W * (.2 if ev['side'] < 0 else .8) - pl.w / 2)
            over(base, pl, opacity=alpha / 255, at=(x, int(H * .66 + math.sin(t * 1.1) * 4)))
            if style == 'parchment' and ev.get('lon') is not None:
                _hotspot(base, ev['lon'], ev['lat'], W, H, age, alpha)
    _emblem(base, W, H, t)
    return base


def _hotspot(base, lon, lat, W, H, age, alpha):
    """A red point on the map with a soft red halo that pulses for a moment after the place is named."""
    import cv2
    px, py = project(lon, lat, W, H)
    pulse = 1.0 + .25 * math.sin(age * 5.0)
    r = int(H * .034 * pulse * smooth(min(1.0, age / .5)))
    if r < 3: return
    pad = 4 * r + 8
    x0, y0 = px - pad, py - pad
    if x0 < 0 or y0 < 0 or x0 + 2 * pad >= W or y0 + 2 * pad >= H: return
    m = np.zeros((2 * pad, 2 * pad), np.float32)
    cv2.circle(m, (pad, pad), r, 1.0, -1, cv2.LINE_AA)
    halo = cv2.GaussianBlur(m, (0, 0), max(4.0, r * .9)) * .9
    k = alpha / 255.0
    region = base[y0:y0 + 2 * pad, x0:x0 + 2 * pad].astype(np.float32)
    red = np.array(HOT, np.float32)
    region = region * (1 - halo[..., None] * k) + red * (halo[..., None] * k)
    region = region * (1 - m[..., None] * k) + red * (m[..., None] * k)
    core = np.zeros_like(m); cv2.circle(core, (pad, pad), max(2, r // 3), 1.0, -1, cv2.LINE_AA)
    region = region * (1 - core[..., None] * k) + np.array((255, 232, 200), np.float32) * (core[..., None] * k)
    base[y0:y0 + 2 * pad, x0:x0 + 2 * pad] = np.clip(region, 0, 255).astype(np.uint8)


def _emblem(base, W, H, t):
    """A small turning compass rose, always in the top-right corner of a board."""
    r = int(H * .06)
    L = Layer(2 * r + 4, 2 * r + 4)
    c = (r + 2, r + 2)
    L.circle(c, r, INK_BROWN, 180, thickness=3)
    for k in range(8):
        a = math.tau * k / 8 + t * .25
        L.line(c, (c[0] + math.cos(a) * r * .9, c[1] + math.sin(a) * r * .9), INK_BROWN, width=max(2, r // 14), alpha=200)
    over(base, L, opacity=.85, at=(int(W * .93 - r), int(H * .07)))


def _scale(layer, s):
    if abs(s - 1.0) < .01: return layer
    w, h = max(2, int(layer.w * s)), max(2, int(layer.h * s))
    im = Image.fromarray(layer.rgb).resize((w, h), Image.LANCZOS)
    a = Image.fromarray(layer.a).resize((w, h), Image.LANCZOS)
    out = Layer(w, h); out.rgb[:] = np.asarray(im); out.a[:] = np.asarray(a)
    return out


def _rotate(layer, deg):
    if abs(deg) < .05: return layer
    im = Image.fromarray(layer.rgb).rotate(deg, resample=Image.BICUBIC, expand=True)
    a = Image.fromarray(layer.a).rotate(deg, resample=Image.BICUBIC, expand=True)
    out = Layer(im.width, im.height); out.rgb[:] = np.asarray(im); out.a[:] = np.asarray(a)
    return out
