"""Long-form backgrounds: the warm amber plaster and the antique parchment world map.

Both are full-frame 16:9 pictures drawn in code (deterministic per seed, no downloads). The parchment uses the
project's own Natural Earth land outline for faint continents, a graticule and a compass rose, so it matches the
reference look without copying any image. Output is RGB uint8 (H, W, 3).
"""
import math

import cv2
import numpy as np

from doc_geo import land


def _noise(h, w, rng, scales=(4, 9, 22, 60)):
    """Smooth multi-scale noise in 0..1 (sum of random fields at growing frequency)."""
    out = np.zeros((h, w), np.float32); total = 0.0
    for k, s in enumerate(scales):
        small = rng.random((max(2, h // s), max(2, w // s))).astype(np.float32)
        field = cv2.resize(small, (w, h), interpolation=cv2.INTER_CUBIC)
        amp = 1.0 / (1.6 ** k); out += field * amp; total += amp
    out /= total
    return (out - out.min()) / max(1e-6, out.max() - out.min())


def _radial(h, w, cx=.5, cy=.45, power=1.7):
    """0 at the warm centre, 1 at the far corners."""
    ys = np.linspace(0, 1, h, dtype=np.float32)[:, None]; xs = np.linspace(0, 1, w, dtype=np.float32)[None, :]
    d = np.sqrt(((xs - cx) * 1.1) ** 2 + ((ys - cy) * 1.0) ** 2) / math.sqrt(.5 * 1.1 ** 2 + .5 ** 2 + 1e-9)
    return np.clip(d, 0, 1) ** power


def amber_plaster(W=1920, H=1080, seed=7):
    """Warm amber wall with a soft light centre, fine plaster stipple and a few long trowel strokes (reference 1)."""
    rng = np.random.default_rng(seed)
    r = _radial(H, W)
    light = np.array([255, 226, 160], np.float32); mid = np.array([240, 176, 92], np.float32); deep = np.array([214, 132, 52], np.float32)
    t = np.clip(r * 1.25, 0, 1)[..., None]
    base = np.where(t < .55, light + (mid - light) * (t / .55), mid + (deep - mid) * ((t - .55) / .45))
    mottle = _noise(H, W, rng)[..., None] * 2 - 1
    stipple = (rng.random((H, W)).astype(np.float32) * 2 - 1)[..., None] * .5
    strokes = np.zeros((H, W), np.float32)
    for _ in range(26):   # long, faint trowel strokes at a shallow angle
        x0, y0 = rng.uniform(-.2, 1.1) * W, rng.uniform(0, 1) * H
        ang = math.radians(rng.uniform(-28, -14)); length = rng.uniform(.25, .6) * W
        x1, y1 = x0 + math.cos(ang) * length, y0 + math.sin(ang) * length
        cv2.line(strokes, (int(x0), int(y0)), (int(x1), int(y1)), 1.0, int(rng.integers(2, 5)), cv2.LINE_AA)
    strokes = cv2.GaussianBlur(strokes, (0, 0), 3.0)[..., None]
    bumps = _noise(H, W, rng, scales=(2, 3, 6))[..., None] * 2 - 1   # fine plaster relief, like the reference wall
    img = base + mottle * 16 + stipple * 22 + bumps * 14 - strokes * 22
    img = np.clip(img, 0, 255).astype(np.uint8)
    return cv2.GaussianBlur(img, (0, 0), 0.6)


def _graticule(canvas, W, H, step_deg=30):
    ink = (150, 112, 70)
    for lon in range(-180, 181, step_deg):
        x = int((lon + 180) / 360 * W); cv2.line(canvas, (x, 0), (x, H - 1), ink, 1, cv2.LINE_AA)
    for lat in range(-60, 61, step_deg):
        y = int((90 - lat) / 180 * H); cv2.line(canvas, (0, y), (W - 1, y), ink, 1, cv2.LINE_AA)


def _compass(canvas, cx, cy, R, ink):
    """A sixteen-point compass rose: long and short star points with a ring."""
    for k in range(16):
        a = math.tau * k / 16 - math.pi / 2
        L = R if k % 4 == 0 else R * .55
        w = .09 if k % 4 == 0 else .05
        pts = np.array([[cx + math.cos(a) * L, cy + math.sin(a) * L],
                        [cx + math.cos(a + math.pi / 2) * R * w, cy + math.sin(a + math.pi / 2) * R * w],
                        [cx - math.cos(a) * R * .15, cy - math.sin(a) * R * .15],
                        [cx + math.cos(a - math.pi / 2) * R * w, cy + math.sin(a - math.pi / 2) * R * w]], np.int32)
        cv2.fillPoly(canvas, [pts], ink, cv2.LINE_AA)
    cv2.circle(canvas, (int(cx), int(cy)), int(R * 1.08), ink, 2, cv2.LINE_AA)


def antique_parchment(W=1920, H=1080, seed=11, map_alpha=.42):
    """Aged parchment with an antique world-map drawing (reference 2): faint continents from the project's land data,
    a graticule, a compass rose bottom-right and burnt edges."""
    rng = np.random.default_rng(seed)
    r = _radial(H, W, power=1.4)
    light = np.array([242, 224, 186], np.float32); edge = np.array([184, 136, 84], np.float32)
    base = light[None, None, :] + (edge - light)[None, None, :] * r[..., None]
    grain = (_noise(H, W, rng, scales=(2, 5, 14))[..., None] * 2 - 1) * 14
    stain = (_noise(H, W, rng, scales=(60, 150))[..., None] * 2 - 1) * 16
    img = np.clip(base + grain + stain, 0, 255).astype(np.float32)

    lines = np.zeros((H, W, 3), np.uint8)
    _graticule(lines, W, H)
    ink = (96, 66, 36)
    for lons, lats in land():
        pts = np.array([[(lo + 180) / 360 * W, (90 - la) / 180 * H] for lo, la in zip(lons, lats)], np.int32)
        if len(pts) > 2: cv2.polylines(lines, [pts], True, ink, 1, cv2.LINE_AA)
    _compass(lines, W * .87, H * .82, H * .12, (110, 78, 42))
    lm = cv2.cvtColor(lines, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
    lm = cv2.GaussianBlur(np.maximum(lm, (cv2.cvtColor(lines, cv2.COLOR_RGB2GRAY) > 0).astype(np.float32)), (0, 0), .7)
    img = img * (1 - lm[..., None] * map_alpha) + np.array(ink, np.float32) * (lm[..., None] * map_alpha)
    return np.clip(img, 0, 255).astype(np.uint8)


def board(style, W=1920, H=1080, seed=7):
    """Long-form background by style name: 'plaster' (reference 1) or 'parchment' (reference 2)."""
    if style == 'plaster': return amber_plaster(W, H, seed)
    if style == 'parchment': return antique_parchment(W, H, seed + 4)
    raise ValueError('unknown board style')
