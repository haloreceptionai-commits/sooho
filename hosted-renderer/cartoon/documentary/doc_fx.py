"""Film finish for the documentary renderer: colour grade by mood, vignette, grain, floating dust, light leaks and the transitions between beats.

All effects are deterministic for a given frame number so any machine renders the same frame the same way.
"""
import math
from functools import lru_cache

import cv2
import numpy as np

from doc_gfx import clamp01, ease_in_out, ease_out, lerp, smooth

# colour grade per mood: (contrast, saturation, tint RGB offset)
GRADES = {
    'neutral': (1.05, 1.04, (0, 0, 0)),
    'tension': (1.12, .86, (-5, -1, 7)),
    'reveal': (1.1, 1.12, (7, 3, -4)),
    'warm': (1.06, 1.08, (8, 2, -6)),
    'board': (1.08, 1.0, (-14, -9, -14)),   # the parchment and plaster boards: a little darker and browner, like the reference frame
    'cold': (1.08, .9, (-6, 0, 8)),
    'dark': (1.15, .8, (-4, -2, 3)),
}


@lru_cache(maxsize=8)
def _vignette(w, h, strength):
    ys = np.linspace(-1, 1, h, dtype=np.float32)[:, None]
    xs = np.linspace(-1, 1, w, dtype=np.float32)[None, :]
    r = np.sqrt(xs ** 2 * .8 + ys ** 2 * 1.0)
    m = 1 - strength * np.clip((r - .45) / .85, 0, 1) ** 1.8
    return np.ascontiguousarray(np.repeat((m * 255).astype(np.uint8)[..., None], 3, axis=2))


def grade(frame, mood='neutral'):
    """Contrast, saturation and tint in one 3x4 colour transform (OpenCV, uint8)."""
    c, sat, tint = GRADES.get(mood, GRADES['neutral'])
    mix = np.eye(3, dtype=np.float32) * sat + (1 - sat) / 3.0
    m = np.zeros((3, 4), np.float32)
    m[:, :3] = mix * c
    m[:, 3] = 128 * (1 - c) + np.array(tint, np.float32)
    return cv2.transform(frame, m)


def vignette(frame, strength=.38):
    h, w = frame.shape[:2]
    return cv2.multiply(frame, _vignette(w, h, round(strength, 2)), scale=1 / 255.0)


@lru_cache(maxsize=4)
def _grain_pool(w, h, amount):
    """Six noise plates (positive and negative halves) made once; frames pick one and flip it, so the grain never repeats visibly."""
    rng = np.random.default_rng(424242)
    pool = []
    for _ in range(6):
        n = cv2.resize(rng.standard_normal((h // 2, w // 2)).astype(np.float32), (w, h), interpolation=cv2.INTER_LINEAR) * amount
        pos = np.repeat(np.clip(n, 0, 255).astype(np.uint8)[..., None], 3, axis=2)
        neg = np.repeat(np.clip(-n, 0, 255).astype(np.uint8)[..., None], 3, axis=2)
        pool.append((np.ascontiguousarray(pos), np.ascontiguousarray(neg)))
    return pool


def grain(frame, index, amount=5.0):
    """Film grain: a fresh plate every frame (6 plates x 4 flips), added and subtracted with saturating uint8 maths."""
    h, w = frame.shape[:2]
    pos, neg = _grain_pool(w, h, round(amount, 1))[index % 6]
    flip = (index // 6) % 4
    if flip:
        code = [0, 1, -1][flip - 1]
        pos, neg = cv2.flip(pos, code), cv2.flip(neg, code)
    return cv2.subtract(cv2.add(frame, pos), neg)


@lru_cache(maxsize=32)
def _dust_params(seed, count):
    rng = np.random.default_rng(seed)
    return rng.random(count), rng.random(count), rng.uniform(.01, .035, count), rng.uniform(1.2, 3.6, count), rng.uniform(0, 6.28, count)


def dust(frame, t, seed=3, count=26, strength=.5):
    """Slow floating specks of light, drawn at a quarter of the size, blurred, scaled up and added."""
    h, w = frame.shape[:2]
    qh, qw = max(8, h // 4), max(8, w // 4)
    x0, y0, sp, size, ph = _dust_params(seed, count)
    layer = np.zeros((qh, qw), np.uint8)
    for i in range(count):
        x = (x0[i] + math.sin(t * .4 + ph[i]) * .02) % 1
        y = (y0[i] - t * sp[i]) % 1
        a = int(255 * (.35 + .65 * (.5 + .5 * math.sin(t * 1.3 + ph[i]))))
        cv2.circle(layer, (int(x * qw), int(y * qh)), max(1, int(size[i] * h / 1080 / 4 + .5)), a, -1, cv2.LINE_AA)
    layer = cv2.resize(cv2.GaussianBlur(layer, (0, 0), 1.0), (w, h), interpolation=cv2.INTER_LINEAR)
    k = strength * .35
    tint = cv2.merge([cv2.convertScaleAbs(layer, alpha=k), cv2.convertScaleAbs(layer, alpha=k * .96), cv2.convertScaleAbs(layer, alpha=k * .86)])
    return cv2.add(frame, tint)


@lru_cache(maxsize=8)
def _leak_plate(w, h, color):
    xs = np.linspace(0, 1, w, dtype=np.float32)[None, :]
    ys = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    glow = np.clip(1 - np.sqrt((xs - .95) ** 2 * .6 + (ys - .05) ** 2), 0, 1) ** 2.2
    return np.ascontiguousarray((glow[..., None] * np.array(color, np.float32)).clip(0, 255).astype(np.uint8))


def light_leak(frame, t, color=(255, 170, 90), strength=.18, period=9.0, phase=0.0):
    """A warm glow that slides in from a corner and out again every `period` seconds."""
    h, w = frame.shape[:2]
    k = max(0.0, math.sin((t / period + phase) * math.pi * 2)) ** 2 * strength
    if k < .01:
        return frame
    return cv2.addWeighted(frame, 1.0, _leak_plate(w, h, tuple(color)), k, 0)


def finish(frame, index, t, mood='neutral', seed=3, grain_amount=3.2, leaks=True):
    f = grade(frame, mood)
    f = vignette(f)
    f = dust(f, t, seed)
    if leaks:
        f = light_leak(f, t, phase=(seed % 7) / 7.0)
    return grain(f, index, grain_amount)


# ---------------------------------------------------------------------------------------------------------------------------
def blend(a, b, k):
    """Mix two frames: k=0 is a, k=1 is b."""
    k = clamp01(k)
    if k <= 0:
        return a
    if k >= 1:
        return b
    return cv2.addWeighted(a, 1 - k, b, k, 0)


def transition(kind, prev, cur, p):
    """The frame `p` (0..1) of the way through a transition from the previous beat to this one."""
    if kind == 'cross':
        return blend(prev, cur, smooth(p))
    if kind == 'dip':
        if p < .5:
            return (prev.astype(np.float32) * (1 - smooth(p * 2))).astype(np.uint8)
        return (cur.astype(np.float32) * smooth((p - .5) * 2)).astype(np.uint8)
    if kind == 'flash':
        out = cur if p > .15 else prev
        flash = (1 - abs(p - .15) / .85) if p > .15 else p / .15
        return np.clip(out.astype(np.float32) + 255 * .8 * max(0, flash) ** 2, 0, 255).astype(np.uint8)
    if kind == 'whip':
        h, w = cur.shape[:2]
        e = ease_in_out(p)
        shift = int(w * e)
        both = np.concatenate([prev, cur], axis=1)
        out = both[:, shift:shift + w].copy()
        blur = int(max(1, w * .06 * math.sin(math.pi * p)))
        if blur > 2:
            out = cv2.blur(out, (blur | 1, 1))
        return out
    return cur


TRANSITION_SEC = {'cross': .35, 'dip': .5, 'flash': .35, 'whip': .3, 'cut': 0.0}
