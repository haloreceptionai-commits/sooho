"""Depth parallax camera for still pictures.

A still becomes a short shot with real depth: a depth map (Depth Anything V2 Small, Apache-2.0, via onnxruntime) tells how far each
pixel is, and the camera moves through the picture so near things slide more than far things. If the model is missing the
renderer falls back to a gentler guessed depth (lower = nearer) and the picture still moves, so a video never stops on this step.
"""
import math
import os

import cv2
import numpy as np

from doc_gfx import clamp01, ease_in_out, lerp, smooth

MODEL_ENV = 'DOC_DEPTH_MODEL'
DEFAULT_MODEL = '/opt/cartoon/depth_small.onnx'
_SESSION = None
_SESSION_TRIED = False


def _session():
    global _SESSION, _SESSION_TRIED
    if _SESSION_TRIED:
        return _SESSION
    _SESSION_TRIED = True
    path = os.environ.get(MODEL_ENV) or DEFAULT_MODEL
    if not os.path.exists(path):
        return None
    try:
        import onnxruntime as ort
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = max(1, int(os.environ.get('DOC_DEPTH_THREADS', '2')))
        _SESSION = ort.InferenceSession(path, opts, providers=['CPUExecutionProvider'])
    except Exception as e:  # missing runtime or a broken file: the guessed depth takes over
        print('depth model unavailable:', e)
        _SESSION = None
    return _SESSION


def model_available():
    return _session() is not None


def guess_depth(img):
    """Plausible relative depth without a model: lower in the picture and more detailed means nearer. Range 0 (far) .. 1 (near)."""
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY).astype(np.float32)
    small = cv2.resize(gray, (max(8, w // 8), max(8, h // 8)), interpolation=cv2.INTER_AREA)
    detail = cv2.GaussianBlur(np.abs(cv2.Laplacian(small, cv2.CV_32F)), (0, 0), 5)
    detail = detail / max(1e-6, float(detail.max()))
    ys = np.linspace(0, 1, small.shape[0], dtype=np.float32)[:, None]
    xs = np.linspace(-1, 1, small.shape[1], dtype=np.float32)[None, :]
    d = .55 * ys + .3 * detail + .15 * (1 - np.abs(xs) * .6)
    d = cv2.GaussianBlur(d, (0, 0), 3)
    return cv2.resize(_norm(d), (w, h), interpolation=cv2.INTER_CUBIC).clip(0, 1)


def _norm(d):
    lo, hi = np.percentile(d, 2), np.percentile(d, 98)
    return np.clip((d - lo) / max(1e-6, hi - lo), 0, 1).astype(np.float32)


def estimate_depth(img):
    """img: HxWx3 uint8 RGB. Returns float32 HxW in 0..1 (1 = nearest). Never raises: any model problem falls back to the guess."""
    sess = _session()
    if sess is None:
        return guess_depth(img)
    try:
        h, w = img.shape[:2]
        s = 518.0 / min(h, w)
        nw, nh = max(14, int(round(w * s / 14)) * 14), max(14, int(round(h * s / 14)) * 14)
        x = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_CUBIC).astype(np.float32) / 255.0
        x = (x - np.array([.485, .456, .406], np.float32)) / np.array([.229, .224, .225], np.float32)
        out = sess.run(None, {sess.get_inputs()[0].name: x.transpose(2, 0, 1)[None]})[0]
        d = out[0] if out.ndim == 3 else out[0, 0]
        d = cv2.resize(d.astype(np.float32), (w, h), interpolation=cv2.INTER_CUBIC)
        if not np.isfinite(d).all():
            raise ValueError('non-finite depth')
        return _norm(d)
    except Exception as e:
        print('depth estimate failed, using a guess:', e)
        return guess_depth(img)


def pack_depth(d, max_width=768):
    """Depth is saved as a small 8-bit picture (about 100-200 KB): parallax only needs smooth relative depth."""
    h, w = d.shape[:2]
    if w > max_width:
        d = cv2.resize(d, (max_width, max(1, int(round(h * max_width / w)))), interpolation=cv2.INTER_AREA)
    return np.clip(d * 255.0 + .5, 0, 255).astype(np.uint8)


def unpack_depth(a):
    return a.astype(np.float32) / 255.0


# ----------------------------------------------------------------------------------------------------------------------------------
MOVES = ('push', 'pull', 'pan_left', 'pan_right', 'tilt_up', 'tilt_down', 'orbit_left', 'orbit_right', 'drift', 'hold', 'punch')


def plan_move(move, focus=(.5, .45), strength=1.0, zoom=None):
    """The camera path of one beat as start/end states: zoom, centre (0..1 of the picture) and parallax sweep (-1..1 each axis)."""
    fx, fy = float(focus[0]), float(focus[1])
    k = max(.3, min(1.6, float(strength)))
    z0, z1, c0, c1, p0, p1, ramp = 1.08, 1.08, (.5, .5), (.5, .5), (0., 0.), (0., 0.), 'smooth'
    if move == 'push':
        z0, z1, c0, c1, p0, p1 = 1.06, 1.06 + .20 * k, (.5, .5), (fx, fy), (-.4, 0), (.4, 0)
    elif move == 'pull':
        z0, z1, c0, c1, p0, p1 = 1.06 + .22 * k, 1.06, (fx, fy), (.5, .5), (.4, 0), (-.4, 0)
    elif move == 'punch':
        z0, z1, c0, c1, p0, p1, ramp = 1.05, 1.05 + .34 * k, (.5, .5), (fx, fy), (0, 0), (0, 0), 'in'
    elif move in ('pan_left', 'pan_right'):
        sgn = 1 if move == 'pan_right' else -1
        z0 = z1 = 1.16 + .04 * k
        c0, c1 = (.5 - sgn * .1 * k, fy), (.5 + sgn * .1 * k, fy)
        p0, p1 = (-sgn * .5, 0), (sgn * .5, 0)
    elif move in ('tilt_up', 'tilt_down'):
        sgn = -1 if move == 'tilt_up' else 1
        z0 = z1 = 1.16 + .04 * k
        c0, c1 = (fx, .5 - sgn * .1 * k), (fx, .5 + sgn * .1 * k)
        p0, p1 = (0, -sgn * .5), (0, sgn * .5)
    elif move in ('orbit_left', 'orbit_right'):
        sgn = 1 if move == 'orbit_right' else -1
        z0, z1 = 1.12, 1.16 + .06 * k
        c0, c1 = (fx, fy), (fx, fy)
        p0, p1 = (-sgn * 1.0 * k, -.25), (sgn * 1.0 * k, .25)
    elif move == 'drift':
        z0, z1, c0, c1, p0, p1 = 1.08, 1.12, (.5, .5), (.5 + (fx - .5) * .3, .5 + (fy - .5) * .3), (-.3, .1), (.3, -.1)
        ramp = 'linear'
    else:  # hold: a breath of motion so it never looks frozen
        z0, z1, p0, p1, ramp = 1.05, 1.075, (-.15, 0), (.15, 0), 'linear'
    if zoom:
        z0, z1 = float(zoom[0]), float(zoom[1])
    return {'z': (z0, z1), 'c': (c0, c1), 'p': (p0, p1), 'ramp': ramp}


def _ramp(u, kind):
    u = clamp01(u)
    if kind == 'smooth':
        return smooth(u)
    if kind == 'in':
        return u ** 1.7
    return u


class StillShot:
    """One picture + its depth, rendered at W x H for any moment of a camera path."""

    PARALLAX = .028  # largest sideways shift of the nearest layer, as a fraction of the output width

    def __init__(self, img, depth, W, H, parallax=None):
        self.img = np.ascontiguousarray(img)
        self.h, self.w = self.img.shape[:2]
        self.W, self.H = int(W), int(H)
        self.depth = self._prep(depth) if depth is not None else None
        self.k = (parallax if parallax is not None else self.PARALLAX)
        self.base = max(self.W / self.w, self.H / self.h)
        self._grid = None

    def _prep(self, depth):
        d = depth.astype(np.float32)
        r = max(1, int(self.w / 400))
        d = cv2.dilate(d, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1)))   # near edges keep their own depth, which avoids bright halos
        return cv2.GaussianBlur(d, (0, 0), max(1.0, self.w / 700))

    def grid(self):
        if self._grid is None:
            xs = (np.arange(self.W, dtype=np.float32) - self.W / 2)[None, :].repeat(self.H, 0)
            ys = (np.arange(self.H, dtype=np.float32) - self.H / 2)[:, None].repeat(self.W, 1)
            self._grid = (xs, ys)
        return self._grid

    def frame(self, u, path):
        z = lerp(path['z'][0], path['z'][1], _ramp(u, path['ramp']))
        e = _ramp(u, 'smooth' if path['ramp'] != 'linear' else 'linear')
        c = (lerp(path['c'][0][0], path['c'][1][0], e), lerp(path['c'][0][1], path['c'][1][1], e))
        par = (lerp(path['p'][0][0], path['p'][1][0], e), lerp(path['p'][0][1], path['p'][1][1], e))
        scale = self.base * z
        half_w, half_h = self.W / 2 / scale, self.H / 2 / scale
        # the centre may not leave the picture; leave room for the parallax shift as well
        margin_x = self.k * self.W / scale
        cx = min(self.w - half_w - margin_x, max(half_w + margin_x, c[0] * self.w))
        cy = min(self.h - half_h - margin_x, max(half_h + margin_x, c[1] * self.h))
        gx, gy = self.grid()
        mx = gx / scale + cx
        my = gy / scale + cy
        if self.depth is not None and (par[0] or par[1]):
            d = cv2.remap(self.depth, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE) - .5
            shift = self.k * self.W / scale
            mx = mx + d * (par[0] * shift)
            my = my + d * (par[1] * shift)
        return cv2.remap(self.img, mx, my, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT_101)

    def still(self, zoom=1.04):
        return self.frame(0, {'z': (zoom, zoom), 'c': ((.5, .5), (.5, .5)), 'p': ((0, 0), (0, 0)), 'ramp': 'linear'})
