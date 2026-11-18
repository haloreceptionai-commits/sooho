"""Cutouts of the people in the story: a named person as a 3D-cartoon picture, a role as a human cartoon face dressed for the era.

Each cutout is a transparent PNG made by the app (documentary.server.ts). Here it is cleaned (halo trimmed), given a dark toon rim and a soft ground shadow,
then laid in front of the beat's picture before the film finish, so grade, vignette and grain treat it like part of the scene. It slides up when its beat starts
(only when it was not already on screen), then breathes and drifts a little so it never looks pasted on.
"""
import math
import os

import cv2
import numpy as np

from doc_gfx import INK, Layer, clamp01, ease_out_back, over, smooth, window

SIDE_X = {'left': .21, 'right': .79, 'center': .5}
HEIGHT = .72          # of the frame height
FEET = .985           # where the feet stand, as a fraction of the frame height


def clean(img):
    """RGBA (uint8) trimmed to the figure, with the soft halo removed; None when there is no usable transparency."""
    if img is None or img.ndim != 3 or img.shape[2] != 4:
        return None
    a = img[..., 3]
    ys, xs = np.nonzero(a > 12)
    if len(xs) < 200:
        return None
    pad = 2
    y0, y1, x0, x1 = max(0, ys.min() - pad), min(a.shape[0], ys.max() + 1 + pad), max(0, xs.min() - pad), min(a.shape[1], xs.max() + 1 + pad)
    out = img[y0:y1, x0:x1].copy()
    alpha = cv2.erode(out[..., 3], np.ones((3, 3), np.uint8))
    out[..., 3] = cv2.GaussianBlur(alpha, (3, 3), 0)
    out[out[..., 3] == 0, :3] = 0
    return out


class CastArt:
    def __init__(self, manifest, directory):
        self.by_id = {c['id']: c for c in (manifest.get('cast') or [])}
        self.dir = directory
        self.raw = {}
        self.sprites = {}

    def _load(self, cid):
        if cid not in self.raw:
            c = self.by_id.get(cid)
            path = os.path.join(self.dir, f"cast-{c['cutout']}.png") if c else ''
            self.raw[cid] = clean(cv2.imread(path, cv2.IMREAD_UNCHANGED)) if path and os.path.exists(path) else None
        return self.raw[cid]

    def sprite(self, cid, height):
        key = (cid, height)
        if key not in self.sprites:
            rgba = self._load(cid)
            if rgba is None:
                self.sprites[key] = None
            else:
                h = max(16, int(height))
                w = max(8, int(round(rgba.shape[1] * h / rgba.shape[0])))
                small = cv2.resize(rgba, (w, h), interpolation=cv2.INTER_AREA)
                body = Layer(w, h)
                body.rgb = np.ascontiguousarray(cv2.cvtColor(small[..., :3], cv2.COLOR_BGR2RGB))
                body.a = np.ascontiguousarray(small[..., 3])
                k = max(2, h // 160)
                grown = cv2.dilate(body.a, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * k + 1, 2 * k + 1)))
                rim = Layer(w + 2 * k, h + 2 * k)
                rim.rgb[:] = INK
                rim.a[k:k + h, k:k + w] = (grown.astype(np.int16) * .9).astype(np.uint8)
                shadow = Layer(int(w * 1.1), max(12, h // 14))
                cv2.ellipse(shadow.a, (shadow.w // 2, shadow.h // 2), (int(shadow.w * .42), max(3, shadow.h // 3)), 0, 0, 360, 120, -1, cv2.LINE_AA)
                shadow.a = cv2.GaussianBlur(shadow.a, (0, 0), max(2.0, h / 90))
                shadow.rgb[:] = (6, 8, 12)
                self.sprites[key] = {'body': body, 'rim': rim, 'rim_pad': k, 'shadow': shadow}
        return self.sprites[key]


def draw_cast(frame, entries, tb, art):
    """Lays each cutout of the beat over `frame` (in place). entries: [{id, side, scale?, enter?}]; tb = seconds into the beat."""
    H, W = frame.shape[:2]
    for idx, e in enumerate(entries):
        scale = float(e.get('scale') or 1.0)
        spr = art.sprite(e['id'], H * HEIGHT * scale)
        if spr is None:
            continue
        body = spr['body']
        enter = bool(e.get('enter', True))
        pop = ease_out_back(window(tb, 0, .5)) if enter else 1.0
        fade = smooth(window(tb, 0, .22)) if enter else 1.0
        phase = (sum(map(ord, e['id'])) % 17) * .4 + idx
        cx = SIDE_X.get(e.get('side', 'left'), .21) * W + math.sin(tb * .6 + phase) * .004 * W
        bob = math.sin(tb * 2.3 + phase) * .0045 * H
        feet = FEET * H + (1 - clamp01(pop)) * .24 * H + bob
        x0, y0 = int(cx - body.w / 2), int(feet - body.h)
        over(frame, spr['shadow'], .8 * fade, (int(cx - spr['shadow'].w / 2), int(FEET * H - spr['shadow'].h / 2 + 4)))
        over(frame, spr['rim'], fade, (x0 - spr['rim_pad'], y0 - spr['rim_pad']))
        over(frame, body, fade, (x0, y0))
    return frame
