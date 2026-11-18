"""Drawing kit for the documentary renderer: fonts, easing, colours and an anti-aliased RGBA layer.

Every card and overlay is drawn on a Layer (an RGB picture plus an alpha mask) so edges are smooth and the layer can be
laid over any frame with one blend. Pure numpy, OpenCV and Pillow; no network, no randomness except where a seed is given.
"""
import math
import os
from functools import lru_cache

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

FONT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'fonts')
FILES = {'oswald': 'Oswald-VF.ttf', 'playfair': 'PlayfairDisplay-VF.ttf', 'inter': 'Inter-VF.ttf'}
FALLBACK = ('DejaVuSans-Bold.ttf', 'DejaVuSans.ttf')

INK = (14, 16, 22)
PAPER = (236, 226, 205)
GOLD = (245, 192, 74)
RED = (222, 70, 60)
TEAL = (64, 196, 190)
WHITE = (248, 248, 250)
GREY = (150, 156, 168)


def clamp01(x):
    return 0.0 if x < 0 else 1.0 if x > 1 else float(x)


def smooth(x):
    x = clamp01(x)
    return x * x * (3 - 2 * x)


def ease_out(x):
    x = clamp01(x)
    return 1 - (1 - x) ** 3


def ease_in_out(x):
    x = clamp01(x)
    return 4 * x ** 3 if x < .5 else 1 - (-2 * x + 2) ** 3 / 2


def ease_out_back(x, s=1.5):
    x = clamp01(x) - 1
    return 1 + (s + 1) * x ** 3 + s * x ** 2


def lerp(a, b, t):
    return a + (b - a) * t


def window(t, start, end):
    """0 before start, 1 after end, linear between (use with an easing)."""
    if end <= start:
        return 1.0 if t >= start else 0.0
    return clamp01((t - start) / (end - start))


@lru_cache(maxsize=256)
def font(family, size, weight=700):
    size = max(6, int(round(size)))
    path = os.path.join(FONT_DIR, FILES.get(family, FILES['inter']))
    try:
        f = ImageFont.truetype(path, size)
        try:
            axes = f.get_variation_axes()
            vals = []
            for a in axes:
                name = a['name'].decode() if isinstance(a['name'], bytes) else str(a['name'])
                vals.append(min(a['maximum'], max(a['minimum'], weight)) if name.lower() == 'weight' else a['default'])
            f.set_variation_by_axes(vals)
        except Exception:
            pass
        return f
    except OSError:
        for name in FALLBACK:
            for base in ('/usr/share/fonts/truetype/dejavu', 'C:/Windows/Fonts'):
                try:
                    return ImageFont.truetype(os.path.join(base, name), size)
                except OSError:
                    continue
        return ImageFont.load_default()


def text_size(s, fnt):
    box = fnt.getbbox(s, anchor='la')
    return box[2], box[3]   # extents from the drawing origin, so a box of this size always holds the whole line


def wrap(s, fnt, max_w):
    """Greedy word wrap to a pixel width; returns the lines."""
    out, line = [], ''
    for word in s.split():
        trial = (line + ' ' + word).strip()
        if line and text_size(trial, fnt)[0] > max_w:
            out.append(line)
            line = word
        else:
            line = trial
    if line:
        out.append(line)
    return out


def fit_font(family, s, max_w, max_h, start, weight=700, lines_max=4, floor=18, spacing=1.15):
    """Largest size (down from `start`) at which the wrapped text fits the box."""
    size = start
    while size > floor:
        fnt = font(family, size, weight)
        lines = wrap(s, fnt, max_w)
        if len(lines) <= lines_max and len(lines) * size * spacing <= max_h:
            return fnt, lines
        size -= 2
    fnt = font(family, floor, weight)
    return fnt, wrap(s, fnt, max_w)


class Layer:
    """An RGB picture with an alpha mask. Drawing calls are anti-aliased."""

    def __init__(self, w, h):
        self.w, self.h = int(w), int(h)
        self.rgb = np.zeros((self.h, self.w, 3), np.uint8)
        self.a = np.zeros((self.h, self.w), np.uint8)

    # shapes -----------------------------------------------------------------
    def _col(self, color):
        return tuple(int(c) for c in color)

    def line(self, p, q, color, width=3, alpha=255):
        cv2.line(self.rgb, (int(p[0]), int(p[1])), (int(q[0]), int(q[1])), self._col(color), max(1, int(width)), cv2.LINE_AA)
        cv2.line(self.a, (int(p[0]), int(p[1])), (int(q[0]), int(q[1])), int(alpha), max(1, int(width)), cv2.LINE_AA)

    def polyline(self, pts, color, width=3, alpha=255, closed=False):
        if len(pts) < 2:
            return
        arr = np.array([[int(x), int(y)] for x, y in pts], np.int32).reshape(-1, 1, 2)
        cv2.polylines(self.rgb, [arr], closed, self._col(color), max(1, int(width)), cv2.LINE_AA)
        cv2.polylines(self.a, [arr], closed, int(alpha), max(1, int(width)), cv2.LINE_AA)

    def polygon(self, pts, color, alpha=255):
        if len(pts) < 3:
            return
        arr = np.array([[int(x), int(y)] for x, y in pts], np.int32).reshape(-1, 1, 2)
        cv2.fillPoly(self.rgb, [arr], self._col(color), cv2.LINE_AA)
        cv2.fillPoly(self.a, [arr], int(alpha), cv2.LINE_AA)

    def circle(self, c, r, color, alpha=255, thickness=-1):
        cv2.circle(self.rgb, (int(c[0]), int(c[1])), max(1, int(r)), self._col(color), thickness, cv2.LINE_AA)
        cv2.circle(self.a, (int(c[0]), int(c[1])), max(1, int(r)), int(alpha), thickness, cv2.LINE_AA)

    def rect(self, x, y, w, h, color, alpha=255, radius=0):
        x, y, w, h = int(x), int(y), int(w), int(h)
        if w <= 0 or h <= 0:
            return
        r = int(min(radius, w // 2, h // 2))
        if r <= 1:
            cv2.rectangle(self.rgb, (x, y), (x + w - 1, y + h - 1), self._col(color), -1)
            cv2.rectangle(self.a, (x, y), (x + w - 1, y + h - 1), int(alpha), -1)
            return
        for img, col in ((self.rgb, self._col(color)), (self.a, int(alpha))):
            cv2.rectangle(img, (x + r, y), (x + w - 1 - r, y + h - 1), col, -1)
            cv2.rectangle(img, (x, y + r), (x + w - 1, y + h - 1 - r), col, -1)
            for cx, cy in ((x + r, y + r), (x + w - 1 - r, y + r), (x + r, y + h - 1 - r), (x + w - 1 - r, y + h - 1 - r)):
                cv2.circle(img, (cx, cy), r, col, -1, cv2.LINE_AA)

    def fill_rgb(self, mask, color, alpha=255):
        """Paint `color` where the float mask (0..1, layer-sized) is set."""
        m = (np.clip(mask, 0, 1) * alpha).astype(np.uint8)
        sel = m > 0
        self.rgb[sel] = self._col(color)
        self.a = np.maximum(self.a, m)

    # text -------------------------------------------------------------------
    def text(self, xy, s, fnt, color=WHITE, align='left', alpha=255, shadow=0, stroke=0, stroke_color=INK, spacing=0):
        """Draws one line. xy is the left / centre / right edge and the top of the text box."""
        if not s:
            return (0, 0)
        pad = int(shadow * 2 + stroke + 8)
        tw, th = text_size(s, fnt)
        if spacing:
            tw += int(spacing * (len(s) - 1))
        fill = _text_mask(s, fnt, pad, 0, spacing)
        x, y = int(xy[0]), int(xy[1])
        x -= pad + (tw // 2 if align == 'center' else tw if align == 'right' else 0)
        y -= pad
        if shadow:
            blur = cv2.GaussianBlur(fill, (0, 0), max(1.0, shadow * .7))
            self._blend(blur * .7, (x + int(shadow * .5), y + int(shadow * .8)), INK, alpha)
        if stroke:
            self._blend(_text_mask(s, fnt, pad, stroke, spacing), (x, y), stroke_color, alpha)
        self._blend(fill, (x, y), color, alpha)
        return tw, th

    def paragraph(self, xy, lines, fnt, color=WHITE, align='left', line_h=None, alpha=255, shadow=0, stroke=0):
        y = xy[1]
        lh = line_h or int(fnt.size * 1.18)
        for line in lines:
            self.text((xy[0], y), line, fnt, color, align, alpha, shadow, stroke)
            y += lh
        return y

    def _blend(self, m, at, color, alpha=255):
        """Lays a float mask in `color` into this layer at `at` (clipped)."""
        x, y = at
        h, w = m.shape
        x0, y0, x1, y1 = max(0, x), max(0, y), min(self.w, x + w), min(self.h, y + h)
        if x1 <= x0 or y1 <= y0:
            return
        sub = m[y0 - y:y1 - y, x0 - x:x1 - x] * (alpha / 255.0)
        a_old = self.a[y0:y1, x0:x1].astype(np.float32) / 255.0
        a_new = sub + a_old * (1 - sub)
        col = np.array(color, np.float32)
        old = self.rgb[y0:y1, x0:x1].astype(np.float32)
        with np.errstate(divide='ignore', invalid='ignore'):
            out = (col[None, None, :] * sub[..., None] + old * (a_old * (1 - sub))[..., None]) / np.maximum(a_new, 1e-6)[..., None]
        self.rgb[y0:y1, x0:x1] = np.clip(out, 0, 255).astype(np.uint8)
        self.a[y0:y1, x0:x1] = np.clip(a_new * 255, 0, 255).astype(np.uint8)

    def blur_shadow(self, offset=(0, 14), radius=24, opacity=.55):
        """A soft drop shadow of the current alpha, put underneath what is already drawn."""
        m = cv2.GaussianBlur(self.a.astype(np.float32) / 255.0, (0, 0), radius)
        ox, oy = offset
        shifted = np.zeros_like(m)
        h, w = m.shape
        shifted[max(0, oy):h + min(0, oy), max(0, ox):w + min(0, ox)] = m[max(0, -oy):h - max(0, oy), max(0, -ox):w - max(0, ox)]
        shadow = Layer(self.w, self.h)
        shadow.rgb[:] = INK
        shadow.a = (shifted * 255 * opacity).astype(np.uint8)
        shadow.paste(self)
        self.rgb, self.a = shadow.rgb, shadow.a

    def paste(self, other, at=(0, 0), opacity=1.0):
        x, y = int(at[0]), int(at[1])
        h, w = other.a.shape
        x0, y0, x1, y1 = max(0, x), max(0, y), min(self.w, x + w), min(self.h, y + h)
        if x1 <= x0 or y1 <= y0:
            return
        sa = other.a[y0 - y:y1 - y, x0 - x:x1 - x].astype(np.float32) / 255.0 * opacity
        da = self.a[y0:y1, x0:x1].astype(np.float32) / 255.0
        na = sa + da * (1 - sa)
        src = other.rgb[y0 - y:y1 - y, x0 - x:x1 - x].astype(np.float32)
        dst = self.rgb[y0:y1, x0:x1].astype(np.float32)
        out = (src * sa[..., None] + dst * (da * (1 - sa))[..., None]) / np.maximum(na, 1e-6)[..., None]
        self.rgb[y0:y1, x0:x1] = np.clip(out, 0, 255).astype(np.uint8)
        self.a[y0:y1, x0:x1] = np.clip(na * 255, 0, 255).astype(np.uint8)

    def bbox(self):
        ys, xs = np.nonzero(self.a)
        if not len(xs):
            return None
        return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def _text_mask(s, fnt, pad, stroke, spacing):
    """Float 0..1 mask of one line. The mask spans the glyph box measured from the drawing origin, so no glyph is ever cut off."""
    box = fnt.getbbox(s, anchor='la', stroke_width=int(stroke))
    extra = int(spacing * len(s)) if spacing else 0
    mask = Image.new('L', (box[2] + pad * 2 + extra + 4, box[3] + pad * 2 + 4), 0)
    d = ImageDraw.Draw(mask)
    if spacing:
        cx = float(pad)
        for ch in s:
            d.text((cx, pad), ch, font=fnt, fill=255, anchor='la', stroke_width=int(stroke))
            cx += fnt.getlength(ch) + spacing
    else:
        d.text((pad, pad), s, font=fnt, fill=255, anchor='la', stroke_width=int(stroke))
    return np.asarray(mask, np.float32) / 255.0


def over(frame, layer, opacity=1.0, at=(0, 0)):
    """Lays a Layer over an RGB uint8 frame in place. Only the layer's own area is touched (OpenCV linear blend)."""
    x, y = int(at[0]), int(at[1])
    h, w = layer.a.shape
    H, W = frame.shape[:2]
    x0, y0, x1, y1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
    if x1 <= x0 or y1 <= y0 or opacity <= 0:
        return frame
    alpha = layer.a[y0 - y:y1 - y, x0 - x:x1 - x]
    if not cv2.countNonZero(alpha):
        return frame
    a = alpha.astype(np.float32) * (opacity / 255.0)
    dst = np.ascontiguousarray(frame[y0:y1, x0:x1])
    src = np.ascontiguousarray(layer.rgb[y0 - y:y1 - y, x0 - x:x1 - x])
    frame[y0:y1, x0:x1] = cv2.blendLinear(dst, src, 1.0 - a, a)
    return frame


def format_number(value, decimals, commas=True):
    s = f'{value:,.{decimals}f}' if commas else f'{value:.{decimals}f}'
    return s


def parse_number(text):
    """'1,500' -> (1500.0, 0, True); '2.5' -> (2.5, 1, False); returns None when the text is not a plain number."""
    t = str(text).strip()
    if not t or not any(ch.isdigit() for ch in t):
        return None
    commas = ',' in t
    core = t.replace(',', '')
    try:
        value = float(core)
    except ValueError:
        return None
    decimals = len(core.split('.')[1]) if '.' in core else 0
    return value, decimals, commas
