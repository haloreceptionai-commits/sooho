"""Caption templates and on-screen UI elements for the final 1080x1920 frames: bold/pop/box/neon/karaoke captions, emoji reaction stickers,
a subscribe-and-like button, text-message bubbles, game HUDs (health bar, level up, achievement, XP) and hand-drawn highlights (circle, arrow, box).

Everything is drawn with PIL shapes (no emoji font, no network) and is a pure function of the frame number and the manifest's own word times,
so a re-render of the same manifest gives the same pixels. Elements are planned from the narration words (plan) and drawn per frame (draw).
"""
import functools
import math
import os
import re
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

FPS = 30
STYLES = ('clean', 'bold', 'pop', 'box', 'neon', 'karaoke')
YELLOW, GREEN, RED, WHITE, BLACK = (255, 212, 0), (59, 227, 122), (255, 64, 64), (255, 255, 255), (0, 0, 0)


# ----------------------------------------------------------------------------- drawing helpers
@functools.lru_cache(maxsize=16)
def caption_font(size):
    """Inter Bold (bundled, OFL) for the clean captions; the system bold sans when it is missing."""
    p = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'fonts', 'Inter-VF.ttf')
    try:
        f = ImageFont.truetype(p, int(size))
        try: f.set_variation_by_axes([700])
        except Exception: pass
        return f
    except OSError: return font(size)


def burn_clean(img, words):
    """Benchmark captions: 1-3 words as spoken (sentence case), white with a thin dark outline and a soft shadow, always the same size.
    A group too wide for the frame drops its oldest words instead of shrinking."""
    shown = [w for w in words or [] if w['shown']]
    if not shown: return img
    W, H = img.size; size = round(W * .074); y = round(H * .7)
    f = caption_font(size); d = ImageDraw.Draw(img)
    while len(shown) > 1 and d.textlength(' '.join(w['text'] for w in shown), font=f) > W * .86: shown = shown[1:]
    text = ' '.join(w['text'] for w in shown)
    while d.textlength(text, font=f) > W * .9 and size > W * .05:   # one very long word: the only case that may shrink
        size = int(size * .92); f = caption_font(size)
    sw = max(2, round(size * .085))
    shadow = _canvas(W, H); sd = ImageDraw.Draw(shadow)
    sd.text((W / 2, y + size * .06), text, font=f, anchor='mm', fill=(0, 0, 0, 150), stroke_width=sw + 3, stroke_fill=(0, 0, 0, 150))
    shadow = shadow.filter(ImageFilter.GaussianBlur(size * .08)); img.paste(shadow, (0, 0), shadow)
    ImageDraw.Draw(img).text((W / 2, y), text, font=f, anchor='mm', fill=(255, 255, 255), stroke_width=sw, stroke_fill=(18, 14, 12))
    return img


@functools.lru_cache(maxsize=64)
def font(size, bold=True):
    names = [os.environ.get('UI_FONT', ''), '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
             'C:/Windows/Fonts/arialbd.ttf' if bold else 'C:/Windows/Fonts/arial.ttf', 'DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf']
    for n in names:
        if n:
            try: return ImageFont.truetype(n, int(size))
            except OSError: pass
    return ImageFont.load_default(int(size))


def pop(age):
    """Spring scale for something that has just appeared: 0 -> 1.15 -> 1.0 over about 0.25 s."""
    t = age / FPS
    if t < 0: return 0.0
    if t < .1: return 1.15 * t / .1
    if t < .22: return 1.15 - .15 * (t - .1) / .12
    return 1.0


def fade(f, a, b, edge=7):
    """Opacity ramp: 0 -> 1 over `edge` frames after a, and 1 -> 0 over `edge` frames before b."""
    return max(0.0, min(1.0, (f - a) / edge, (b - f) / edge))


def _canvas(w, h): return Image.new('RGBA', (int(w), int(h)), (0, 0, 0, 0))


def _supersample(w, h, draw_fn, k=3):
    im = _canvas(w * k, h * k); draw_fn(ImageDraw.Draw(im), k); return im.resize((int(w), int(h)), Image.LANCZOS)


def _alpha(sprite, a):
    if a >= .999: return sprite
    sprite = sprite.copy(); sprite.putalpha(sprite.getchannel('A').point(lambda v: int(v * max(0, a)))); return sprite


def _stamp(img, sprite, cx, cy, scale=1.0, angle=0.0, opacity=1.0):
    """Paste a sprite centred at (cx, cy) with scale, rotation and opacity (image modified in place)."""
    if scale <= 0 or opacity <= 0: return img
    if scale != 1.0: sprite = sprite.resize((max(1, int(sprite.width * scale)), max(1, int(sprite.height * scale))), Image.LANCZOS)
    if angle: sprite = sprite.rotate(angle, resample=Image.BICUBIC, expand=True)
    sprite = _alpha(sprite, opacity); img.paste(sprite, (int(cx - sprite.width / 2), int(cy - sprite.height / 2)), sprite); return img


def _text(d, xy, s, size, fill=WHITE, stroke=BLACK, sw=None, anchor='mm', bold=True):
    d.text(xy, s, font=font(size, bold), fill=fill, anchor=anchor, stroke_width=max(2, round(size * .09)) if sw is None else sw, stroke_fill=stroke)


def _round(d, box, r, fill, outline=None, width=0): d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


# ----------------------------------------------------------------------------- vector emoji stickers
def _heart_points(cx, cy, s, n=48):
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        pts.append((cx + s * .5 * math.sin(t) ** 3, cy + s * .075 - s * (13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)) / 34))
    return pts


def _star_points(cx, cy, r, r2=None, n=5):
    r2 = r2 or r * .42
    return [(cx + (r if i % 2 == 0 else r2) * math.sin(math.pi * i / n), cy - (r if i % 2 == 0 else r2) * math.cos(math.pi * i / n)) for i in range(2 * n)]


@functools.lru_cache(maxsize=64)
def sticker(kind, size=360):
    """One flat, black-outlined reaction icon on a transparent square."""
    def paint(d, k):
        W = size * k; ow = int(W * .045)
        P = lambda x, y: (W * x, W * y)
        def disc(color): d.ellipse((W * .04, W * .04, W * .96, W * .96), fill=color, outline=BLACK, width=ow)
        def eye(x, y, r=.07): d.ellipse((W * (x - r), W * (y - r), W * (x + r), W * (y + r)), fill=BLACK)
        def brow(x0, y0, x1, y1): d.line((*P(x0, y0), *P(x1, y1)), fill=BLACK, width=int(W * .05))
        face = (255, 205, 40)
        if kind == 'shock':
            disc(face)
            for x in (.32, .68):
                d.ellipse((W * (x - .13), W * .26, W * (x + .13), W * .52), fill=WHITE, outline=BLACK, width=int(W * .03)); eye(x, .39, .045)
            brow(.2, .2, .42, .16); brow(.58, .16, .8, .2)
            d.ellipse((W * .4, W * .6, W * .6, W * .86), fill=BLACK)
        elif kind == 'laugh':
            disc(face)
            for x in (.32, .68): d.arc((W * (x - .12), W * .28, W * (x + .12), W * .5), 200, 340, fill=BLACK, width=int(W * .05))
            d.pieslice((W * .24, W * .48, W * .76, W * .9), 0, 180, fill=BLACK); d.pieslice((W * .34, W * .68, W * .66, W * .9), 0, 180, fill=(235, 80, 90))
            d.rectangle((W * .3, W * .6, W * .7, W * .66), fill=WHITE)
            for x in (.12, .88): d.polygon([P(x, .52), P(x - .05, .64), P(x + .05, .64)], fill=(90, 190, 255), outline=BLACK)
        elif kind == 'sad':
            disc(face); eye(.32, .42); eye(.68, .42); brow(.2, .26, .42, .34); brow(.58, .34, .8, .26)
            d.arc((W * .3, W * .62, W * .7, W * .9), 200, 340, fill=BLACK, width=int(W * .05))
            d.polygon([P(.3, .52), P(.25, .66), P(.35, .66)], fill=(90, 190, 255), outline=BLACK)
        elif kind == 'angry':
            disc((245, 90, 60)); eye(.32, .44); eye(.68, .44); brow(.18, .28, .42, .38); brow(.58, .38, .82, .28)
            d.arc((W * .3, W * .66, W * .7, W * .9), 200, 340, fill=BLACK, width=int(W * .05))
            for dx, dy in ((0, 0), (.07, .07)):    # the anime anger vein
                d.arc((W * (.66 + dx), W * (.04 + dy), W * (.8 + dx), W * (.18 + dy)), 90, 360, fill=BLACK, width=int(W * .035))
        elif kind == 'cool':
            disc(face); d.rounded_rectangle((W * .16, W * .32, W * .84, W * .54), radius=int(W * .06), fill=BLACK); d.line((*P(.5, .38), *P(.5, .38)), fill=BLACK)
            d.arc((W * .3, W * .5, W * .7, W * .85), 20, 160, fill=BLACK, width=int(W * .05))
            d.polygon([P(.22, .37), P(.32, .37), P(.26, .46)], fill=(255, 255, 255))
        elif kind == 'love':
            disc(face)
            for x in (.32, .68): d.polygon(_heart_points(W * x, W * .42, W * .24), fill=(235, 50, 80), outline=BLACK)
            d.arc((W * .3, W * .55, W * .7, W * .85), 20, 160, fill=BLACK, width=int(W * .05))
        elif kind == 'skull':
            d.ellipse((W * .12, W * .06, W * .88, W * .72), fill=(245, 245, 240), outline=BLACK, width=ow)
            d.rounded_rectangle((W * .28, W * .6, W * .72, W * .92), radius=int(W * .05), fill=(245, 245, 240), outline=BLACK, width=ow)
            for x in (.34, .66): d.ellipse((W * (x - .11), W * .3, W * (x + .11), W * .52), fill=BLACK)
            d.polygon([P(.5, .52), P(.45, .62), P(.55, .62)], fill=BLACK)
            for x in (.4, .5, .6): d.line((*P(x, .74), *P(x, .9)), fill=BLACK, width=int(W * .025))
        elif kind == 'fire':
            d.polygon([P(.5, .04), P(.64, .26), P(.72, .2), P(.84, .5), P(.8, .78), P(.64, .94), P(.36, .94), P(.2, .78), P(.16, .52), P(.28, .34), P(.34, .42)], fill=(255, 120, 30), outline=BLACK)
            d.polygon([P(.5, .38), P(.62, .58), P(.6, .8), P(.5, .9), P(.4, .8), P(.38, .58)], fill=(255, 215, 60), outline=BLACK)
        elif kind == 'money':
            disc((255, 200, 40)); d.ellipse((W * .17, W * .17, W * .83, W * .83), outline=(190, 130, 10), width=int(W * .035)); _text(d, P(.5, .52), '$', int(W * .6), (190, 120, 0), (120, 70, 0), int(W * .02))
        elif kind == 'question':
            disc((90, 140, 255)); _text(d, P(.5, .53), '?', int(W * .7), WHITE, BLACK, int(W * .035))
        elif kind == 'exclaim':
            disc((255, 70, 70)); _text(d, P(.5, .53), '!', int(W * .7), WHITE, BLACK, int(W * .035))
        elif kind == 'check':
            disc((60, 200, 110)); d.line((*P(.28, .52), *P(.44, .68), *P(.74, .32)), fill=WHITE, width=int(W * .1), joint='curve')
        elif kind == 'star':
            d.polygon(_star_points(W * .5, W * .54, W * .46), fill=(255, 205, 40), outline=BLACK); d.line([*_star_points(W * .5, W * .54, W * .46), _star_points(W * .5, W * .54, W * .46)[0]], fill=BLACK, width=ow)
        elif kind == 'heart':
            d.polygon(_heart_points(W * .5, W * .5, W * .95), fill=(235, 50, 80), outline=BLACK); d.line(_heart_points(W * .5, W * .5, W * .95) + [_heart_points(W * .5, W * .5, W * .95)[0]], fill=BLACK, width=ow)
        else: raise ValueError('Unknown sticker')
    return _supersample(size, size, paint)


STICKERS = ('shock', 'laugh', 'sad', 'angry', 'cool', 'love', 'skull', 'fire', 'money', 'question', 'exclaim', 'check', 'star', 'heart')
STICKER_WORDS = {
    'shock': 'shocked shocking unbelievable wow insane crazy impossible incredible suddenly stunned', 'laugh': 'funny laughed laugh joke hilarious silly',
    'sad': 'sad cried crying tears lonely sorrow', 'angry': 'angry furious rage mad hated', 'cool': 'cool awesome legend genius smart clever',
    'love': 'love loved adored beloved', 'skull': 'died dead death killed dies deadly', 'fire': 'fire burning flames blaze burned',
    'money': 'money rich gold cash million billion treasure paid', 'question': 'mystery secret unknown strange wondered puzzle',
    'exclaim': 'danger warning trap beware attack', 'check': 'victory won success perfect solved', 'star': 'amazing magic best brilliant',
}
STICKER_FOR = {w: k for k, ws in STICKER_WORDS.items() for w in ws.split()}


# ----------------------------------------------------------------------------- UI element sprites
def _pill(w, h, fill, outline=None, ow=0):
    return _supersample(w, h, lambda d, k: _round(d, (0, 0, w * k - 1, h * k - 1), h * k // 2, fill, outline, ow * k))


def _bell(size, color=WHITE):
    def paint(d, k):
        s = size * k
        d.pieslice((s * .2, s * .12, s * .8, s * .72), 180, 360, fill=color); d.rectangle((s * .2, s * .42, s * .8, s * .72), fill=color)
        d.polygon([(s * .12, s * .76), (s * .88, s * .76), (s * .8, s * .66), (s * .2, s * .66)], fill=color); d.ellipse((s * .4, s * .78, s * .6, s * .94), fill=color)
        d.ellipse((s * .44, s * .04, s * .56, s * .16), fill=color)
    return _supersample(size, size, paint)


def _cursor(size):
    def paint(d, k):
        s = size * k; pts = [(s * .2, s * .08), (s * .2, s * .86), (s * .4, s * .68), (s * .54, s * .96), (s * .68, s * .9), (s * .54, s * .62), (s * .8, s * .62)]
        d.polygon(pts, fill=WHITE, outline=BLACK); d.line(pts + [pts[0]], fill=BLACK, width=int(s * .06), joint='curve')
    return _supersample(size, size, paint)


def subscribe_sprite(W, state):
    """state 0..1: 0 = SUBSCRIBE (red), 1 = SUBSCRIBED (grey) with the check."""
    w, h = int(W * .58), int(W * .15)
    im = _canvas(w, h); red, grey = (255, 30, 60), (110, 110, 120)
    col = tuple(int(red[i] + (grey[i] - red[i]) * state) for i in range(3))
    im.paste(_pill(w, h, col, BLACK, 5), (0, 0), _pill(w, h, col, BLACK, 5)); d = ImageDraw.Draw(im)
    label = 'SUBSCRIBED' if state > .5 else 'SUBSCRIBE'
    _text(d, (w * .45, h * .5), label, h * (.34 if state > .5 else .4), WHITE, BLACK, max(2, int(h * .04)))
    bell = _bell(int(h * .55)); im.paste(bell, (int(w - h * .8), int(h * .22)), bell)
    return im


def like_sprite(W, pressed):
    w, h = int(W * .26), int(W * .15)
    im = _canvas(w, h); pill = _pill(w, h, (245, 245, 245), BLACK, 5); im.paste(pill, (0, 0), pill); d = ImageDraw.Draw(im)
    hs = sticker('heart', int(h * .5)); im.paste(hs, (int(h * .2), int(h * .25)), hs)
    _text(d, (w * .66, h * .5), 'LIKE', h * .34, (30, 30, 30), WHITE, 0)
    if pressed: im = ImageChops.multiply(im.convert('RGBA'), Image.new('RGBA', im.size, (255, 200, 210, 255)))
    return im


def chat_bubble(text, W, incoming=True, typing=0.0):
    """Message bubble sized to its text (wrapped at 70% of the frame). `typing` > 0 shows three animated dots instead of the words."""
    size = int(W * .05); f = font(size, True); maxw = int(W * .7)
    words, lines, cur = text.split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if f.getlength(t) > maxw and cur: lines.append(cur); cur = w
        else: cur = t
    lines.append(cur); lines = lines[:3]
    tw = max(f.getlength(x) for x in lines); pad = int(size * .7)
    w, h = (int(size * 3.2) if typing else int(tw + pad * 2)), (int(size * 1.9) if typing else int(len(lines) * size * 1.25 + pad * 1.4))
    fill = (232, 232, 238) if incoming else (30, 140, 255); ink = (20, 20, 24) if incoming else WHITE
    def paint(d, k):
        _round(d, (0, 0, w * k - 1, h * k - 1), int(size * .95 * k), fill)
        tail = [(int(size * .2 * k), h * k - 1), (int(size * .55 * k), int(h * k * .62)), (int(size * 1.0 * k), h * k - 1)] if incoming else [(w * k - int(size * .2 * k), h * k - 1), (w * k - int(size * .55 * k), int(h * k * .62)), (w * k - int(size * 1.0 * k), h * k - 1)]
        d.polygon(tail, fill=fill)
    im = _supersample(w, h, paint); d = ImageDraw.Draw(im)
    if typing:
        for i in range(3):
            lift = abs(math.sin(typing * 9 + i * .9)) * size * .22
            d.ellipse((size * (.95 + i * .65) - size * .2, h / 2 - size * .2 - lift, size * (.95 + i * .65) + size * .2, h / 2 + size * .2 - lift), fill=(130, 130, 140))
    else:
        for i, line in enumerate(lines): d.text((pad, pad * .7 + i * size * 1.25), line, font=f, fill=ink)
    return im


def health_bar(W, value, ghost, flash=0.0):
    w, h = int(W * .5), int(W * .085)
    im = _canvas(w + 20, h + 20); d = ImageDraw.Draw(im)
    _round(d, (0, 0, w + 19, h + 19), h // 2 + 4, (20, 20, 30, 235), WHITE, 3)
    inner = (12, 12, w + 8 - h * .15, h + 8)
    bw = (w - 18 - h * .9)
    x0 = 10 + h * .85
    d.ellipse((6, 6, 6 + h * .8 + 6, 6 + h * .8 + 6), fill=(235, 50, 80)); hs = sticker('heart', int(h * .62)); im.paste(hs, (int(10), int(10)), hs)
    _round(d, (x0, 14, x0 + bw, h + 6), h // 3, (60, 60, 70))
    if ghost > value: _round(d, (x0, 14, x0 + bw * ghost, h + 6), h // 3, (255, 255, 255))
    col = (60, 220, 110) if value > .6 else (255, 200, 40) if value > .3 else (255, 70, 70)
    if value > .01: _round(d, (x0, 14, x0 + max(h // 2, bw * value), h + 6), h // 3, col)
    if flash > 0: im = Image.alpha_composite(im, Image.new('RGBA', im.size, (255, 80, 80, int(110 * flash))))
    return im


def banner(text, W, sub=None, age=0):
    size = int(W * .12)
    w, h = int(W * .9), int(size * 2.2)
    im = _canvas(w, h); d = ImageDraw.Draw(im)
    d.ellipse((w * .12, -h * .1, w * .88, h * 1.1), fill=(255, 215, 80, 60))
    for i in range(16):    # rotating light rays, kept inside the glow
        a = i * math.pi / 8 + age * .04; r = h * .95
        d.polygon([(w / 2, h / 2), (w / 2 + math.cos(a) * r * 1.6, h / 2 + math.sin(a) * r), (w / 2 + math.cos(a + .11) * r * 1.6, h / 2 + math.sin(a + .11) * r)], fill=(255, 235, 140, 120))
    _text(d, (w / 2, h * (.42 if sub else .5)), text, size, YELLOW, BLACK, int(size * .1))
    if sub: _text(d, (w / 2, h * .8), sub, size * .36, WHITE, BLACK, int(size * .04))
    return im


def trophy(size):
    def paint(d, k):
        s = size * k; gold = (255, 205, 40)
        d.pieslice((s * .2, s * .1, s * .8, s * .72), 0, 180, fill=gold, outline=BLACK, width=int(s * .04)); d.rectangle((s * .2, s * .1, s * .8, s * .36), fill=gold)
        d.arc((s * .02, s * .14, s * .32, s * .46), 90, 270, fill=gold, width=int(s * .07)); d.arc((s * .68, s * .14, s * .98, s * .46), 270, 90, fill=gold, width=int(s * .07))
        d.rectangle((s * .44, s * .66, s * .56, s * .82), fill=gold); d.rounded_rectangle((s * .28, s * .8, s * .72, s * .94), radius=int(s * .04), fill=gold, outline=BLACK, width=int(s * .03))
    return _supersample(size, size, paint)


def achievement(W, text):
    w, h = int(W * .86), int(W * .17)
    im = _canvas(w, h); d = ImageDraw.Draw(im); _round(d, (0, 0, w - 1, h - 1), h // 4, (20, 22, 32, 245), (255, 205, 40), 4)
    t = trophy(int(h * .7)); im.paste(t, (int(h * .15), int(h * .15)), t)
    _text(d, (w * .56, h * .3), 'ACHIEVEMENT UNLOCKED', h * .2, YELLOW, BLACK, 0)
    _text(d, (w * .56, h * .66), text.upper()[:26], h * .3, WHITE, BLACK, 0); return im


# ----------------------------------------------------------------------------- highlights (hand-drawn circle / arrow / box around a world point)
def _wobble(i, k): return math.sin(i * 12.9898 + k * 78.233) * .5 + .5


def highlight_sprite(kind, w, h, progress):
    """A marker that draws itself: `progress` 0..1 is how much of the stroke is drawn."""
    def paint(d, k):
        lw = int(min(w, h) * k * .055); n = 56
        if kind == 'circle':
            pts = []
            for i in range(int(n * 1.1) + 1):
                a = 2 * math.pi * i / n - math.pi / 2; r = .46 + .02 * _wobble(i, 1) + .05 * (i / n)
                pts.append((w * k * (.5 + r * math.cos(a)), h * k * (.5 + r * math.sin(a))))
        elif kind == 'box':
            m = .06; pts = [(m, m + .01), (1 - m, m), (1 - m + .01, 1 - m), (m, 1 - m - .01), (m - .005, m + .03)]
            pts = [(w * k * x, h * k * y) for x, y in pts]
        else:    # arrow pointing down at the target, drawn tail to tip
            pts = [(w * k * .5, h * k * .04), (w * k * .5, h * k * .62)]
        m_ = max(2, int(len(pts) * progress)); seg = pts[:m_] if kind != 'arrow' else pts
        if kind == 'arrow':
            tail, tip = pts; q = progress; end = (tail[0] + (tip[0] - tail[0]) * q, tail[1] + (tip[1] - tail[1]) * q)
            d.line([tail, end], fill=BLACK, width=lw + 8 * k); d.line([tail, end], fill=RED, width=lw)
            if progress > .85:
                hw = w * k * .2
                head = [(tip[0] - hw, tip[1] - hw), (tip[0], tip[1] + hw * .5), (tip[0] + hw, tip[1] - hw)]
                d.line(head, fill=BLACK, width=lw + 8 * k, joint='curve'); d.line(head, fill=RED, width=lw, joint='curve')
        else:
            d.line(seg, fill=BLACK, width=lw + 8 * k, joint='curve'); d.line(seg, fill=RED, width=lw, joint='curve')
    return _supersample(w, h, paint)


def project(shot, k, p, size=(1080, 1920), fps=FPS):
    """Pixel position (x, y, pixels per metre at that depth) of world point p in a compiled Blender shot at its 1-based local frame k, or None when
    it is behind the camera or off screen. Mirrors render_shot.camera: eased from->to move, aim point look_at->look_to, 36 mm sensor spanning the portrait height."""
    c = shot['camera']; n = max(1, round(float(shot.get('duration', 1)) * fps)); u = max(0.0, min(1.0, (k - 1) / max(1, n - 1))); e = u * u * (3 - 2 * u)
    a, b = c['from'], c.get('to', c['from']); la, lb = c['look_at'], c.get('look_to', c['look_at'])
    cam = [a[i] + (b[i] - a[i]) * e for i in range(3)]; aim = [la[i] + (lb[i] - la[i]) * e for i in range(3)]
    fwd = [aim[i] - cam[i] for i in range(3)]; nn = math.sqrt(sum(x * x for x in fwd)) or 1; fwd = [x / nn for x in fwd]
    right = [fwd[1], -fwd[0], 0.0]; rn = math.hypot(right[0], right[1]) or 1; right = [x / rn for x in right]
    up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]]
    v = [p[i] - cam[i] for i in range(3)]; z = sum(v[i] * fwd[i] for i in range(3))
    if z < .3: return None
    x, y = sum(v[i] * right[i] for i in range(3)), sum(v[i] * up[i] for i in range(3)); kk = c.get('lens', 35) / 36.0 * size[1]
    px, py = size[0] / 2 + x / z * kk, size[1] / 2 - y / z * kk
    return (px, py, kk / z) if -.1 * size[0] <= px <= 1.1 * size[0] and -.05 * size[1] <= py <= 1.05 * size[1] else None


def head_position(c, k, fps=FPS):
    """World position of a cast member's head at 1-based local frame k, from the same pose and root-motion tables the renderer animates with."""
    from character_motion import pose
    x, y = c['pos'][0], c['pos'][1]; yaw = math.radians(c.get('yaw', 0)); S = c.get('scale', 1.0)
    p = pose(c.get('action', 'stand'), (k - 1) / fps)
    lx, ly, lz = p['head'][0] + p['root'][0], p['head'][1] + p['root'][1], p['head'][2] + p['root'][2]
    return [x + S * (lx * math.cos(yaw) - ly * math.sin(yaw)), y + S * (lx * math.sin(yaw) + ly * math.cos(yaw)), S * lz]


def target_point(shot, k=1):
    """What a highlight points at: the shot's first prop, otherwise the first character's head (moving with the character)."""
    for o in shot.get('objects') or []:
        pos = o.get('pos')
        if pos and len(pos) >= 2: return [pos[0], pos[1], (pos[2] if len(pos) > 2 else 0.0) + .6]
    for c in shot.get('cast') or []:
        if c.get('pos') and len(c['pos']) >= 2:
            try: return head_position(c, k)
            except (ImportError, ValueError, KeyError): return [c['pos'][0], c['pos'][1], 1.7]
    return None


def target_px(shot, k, size=(1080, 1920)):
    p = target_point(shot, k); return project(shot, k, p, size) if p else None


# ----------------------------------------------------------------------------- planning: manifest words -> timed elements
DURATION = {'sticker': 1.5, 'subscribe': 3.0, 'chat': 3.4, 'health': 2.6, 'levelup': 2.2, 'achievement': 3.0, 'xp': 1.6, 'highlight': 2.2}
GAP = {'sticker': 2.6, 'subscribe': 99, 'chat': 6.0, 'health': 6.0, 'levelup': 8.0, 'achievement': 8.0, 'xp': 4.0, 'highlight': 6.0}
PRIORITY = ('subscribe', 'chat', 'achievement', 'levelup', 'health', 'highlight', 'xp', 'sticker')
HIGHLIGHT_WORDS = {'notice': 'circle', 'noticed': 'circle', 'spot': 'circle', 'spotted': 'circle', 'clue': 'circle', 'hidden': 'box', 'found': 'circle', 'trick': 'box', 'look': 'circle', 'there': 'arrow', 'pointed': 'arrow'}
HEALTH_WORDS = {'damage', 'damaged', 'wounded', 'injured', 'hurt', 'health', 'hp', 'attacked'}
_NUM = re.compile(r'\d')
_NUMBER_WORDS = set('one two three four five six seven eight nine ten eleven twelve twenty thirty forty fifty hundred thousand million billion'.split())


def plan(m, fps=FPS):
    """Timed UI events for the whole video. At most one element at a time; elements keep their minimum gap; subscribe appears once."""
    words = m.get('words') or []; shown = m.get('caption_words') or [w.get('text', '') for w in words]
    cand = []
    for i, w in enumerate(words):
        t = w['text']; start = round(w['start'] * fps); nxt = (words[i + 1]['text'] if i + 1 < len(words) else '')
        ev = None
        if t.startswith('subscrib'): ev = {'kind': 'subscribe'}
        elif t in ('text', 'texted', 'messaged', 'message', 'wrote', 'replied', 'dm', 'chat', 'chatted'):
            body = ' '.join(shown[i + 1:i + 8]).strip(); ev = {'kind': 'chat', 'text': (body or shown[i]).strip()[:80], 'incoming': (len([c for c in cand if c['kind'] == 'chat']) % 2 == 0)}
        elif t == 'level' and nxt == 'up' or t in ('promoted', 'upgraded'): ev = {'kind': 'levelup'}
        elif t in ('unlocked', 'achievement', 'achieved'): ev = {'kind': 'achievement', 'text': ' '.join(shown[i + 1:i + 4]).strip() or 'NEW DISCOVERY'}
        elif t in HEALTH_WORDS: ev = {'kind': 'health'}
        elif t in ('points', 'xp', 'score', 'scored'): ev = {'kind': 'xp', 'text': '+100 XP'}
        elif t in HIGHLIGHT_WORDS: ev = {'kind': 'highlight', 'style': HIGHLIGHT_WORDS[t]}
        elif t in STICKER_FOR: ev = {'kind': 'sticker', 'icon': STICKER_FOR[t]}
        if ev: cand.append({**ev, 'start': start, 'end': start + round(DURATION[ev['kind']] * fps), 'word': i})
    if words and not any(e['start'] < 45 for e in cand) and round(words[0]['start'] * fps) < 15:   # the hook line: a reaction sticker in the first second
        icon = next((STICKER_FOR[x['text']] for x in words[:12] if x['text'] in STICKER_FOR), 'shock')
        cand.append({'kind': 'sticker', 'icon': icon, 'start': 8, 'end': 8 + round(1.5 * fps), 'word': 0})
    out, last = [], {}
    for ev in sorted(cand, key=lambda e: (e['start'], PRIORITY.index(e['kind']))):
        k = ev['kind']
        if k == 'subscribe' and any(o['kind'] == 'subscribe' for o in out): continue
        if k in last and ev['start'] - last[k] < GAP[k] * fps: continue
        if out and ev['start'] < out[-1]['end']:                   # one element on screen at a time
            prev = out[-1]
            if PRIORITY.index(k) < PRIORITY.index(prev['kind']) and ev['start'] - prev['start'] >= 24: prev['end'] = ev['start']   # a more important element cuts a long-running one short
            else: continue
        out.append(ev); last[k] = ev['start']
    sides = 0
    for ev in out:
        if ev['kind'] == 'sticker': ev['side'] = -1 if sides % 2 == 0 else 1; sides += 1
    return out


def active(events, f): return next((e for e in events if e['start'] <= f < e['end']), None)


# ----------------------------------------------------------------------------- per-frame drawing
def draw(img, events, f, target=None):
    """Draws the element active at frame f onto img (RGB, modified in place and returned). `target` is a (x, y, px_per_metre) pixel hint for highlights, if any."""
    ev = active(events, f)
    if ev is None: return img
    W, H = img.size; age = f - ev['start']; span = ev['end'] - ev['start']; op = fade(f, ev['start'], ev['end'], 6); k = ev['kind']
    if k == 'sticker':
        s = int(W * .27); cx = W * (.2 if ev['side'] < 0 else .8); cy = H * .2 + math.sin(age / 6) * 5
        _stamp(img, sticker(ev['icon'], 420), cx, cy, s / 420 * pop(age), angle=-9 * ev['side'] + math.sin(age / 5) * 3, opacity=op)
    elif k == 'subscribe':
        t = age / FPS; clicked = t > 1.45
        like = like_sprite(W, t > 1.1); sub = subscribe_sprite(W, min(1.0, max(0.0, (t - 1.45) / .25)))
        cy = H * .24; _stamp(img, like, W * .18, cy, pop(age), 0, op); _stamp(img, sub, W * .63, cy, pop(age - 3) * (.94 if 1.4 < t < 1.55 else 1.0) * (1 + .03 * math.sin(t * 20) * (t > 1.6 and t < 2.0)), 0, op)
        cur = _cursor(int(W * .12)); q = min(1.0, max(0.0, (t - .35) / .85)); q = q * q * (3 - 2 * q)
        _stamp(img, cur, W * (1.0 - .13 * q), H * (.32 - .055 * q), 1.0, 0, op * (1 if t < 2.2 else 0))
        if 1.45 < t < 1.8:
            r = int(W * (.03 + .12 * (t - 1.45) / .35)); d = ImageDraw.Draw(img, 'RGBA'); cxr, cyr = W * .63, cy
            d.ellipse((cxr - r, cyr - r, cxr + r, cyr + r), outline=(255, 255, 255, int(200 * (1 - (t - 1.45) / .35))), width=5)
    elif k == 'chat':
        t = age / FPS; typing = t < .7
        b = chat_bubble(ev['text'], W, ev['incoming'], typing=t if typing else 0.0)
        x = W * (.08 if ev['incoming'] else .92) + (b.width / 2 if ev['incoming'] else -b.width / 2); rise = (1 - min(1.0, t / .25)) * 40
        _stamp(img, b, x, H * .16 + rise, pop(age) if age < 8 else 1.0, 0, op)
        if not typing:
            d = ImageDraw.Draw(img); _text(d, (x, H * .16 + b.height / 2 + 34 + rise), 'Delivered' if not ev['incoming'] else 'now', W * .026, (210, 210, 215), BLACK, 0, bold=False)
    elif k == 'health':
        t = age / FPS; hit = max(0.0, 1 - abs(t - .55) / .5)
        value = 1.0 - .4 * min(1.0, max(0.0, (t - .5) / .35)); ghost = 1.0 - .4 * min(1.0, max(0.0, (t - .85) / .6))
        bar = health_bar(W, value, ghost, hit if t > .5 else 0.0); sh = math.sin(t * 60) * 8 * hit
        _stamp(img, bar, W * .33 + sh, H * .115, 1.0, 0, op)
        if t > .5: d = ImageDraw.Draw(img); _text(d, (W * .72, H * .125 - (t - .5) * 90), '-40', W * .09, RED, BLACK, None)
    elif k == 'levelup': _stamp(img, banner('LEVEL UP!', W, None, age), W / 2, H * .22, pop(age) * (1 + .02 * math.sin(age / 3)), 0, op)
    elif k == 'achievement':
        slide = (1 - min(1.0, age / 10)) * -120; _stamp(img, achievement(W, ev['text']), W / 2, H * .13 + slide, 1.0, 0, op)
    elif k == 'xp':
        d = ImageDraw.Draw(img); rise = min(1.0, age / 12); _text(d, (W / 2, H * (.27 - .05 * rise)), ev['text'], W * .12 * pop(age), GREEN, BLACK, None)
    elif k == 'highlight' and target is not None:
        px, py, scale = target; style = ev['style']; prog = min(1.0, age / 12)
        size = int(max(.26 * W, min(.6 * W, .95 * scale)))
        spr = highlight_sprite(style, size, size if style != 'box' else int(size * .8), prog)
        if style == 'arrow': _stamp(img, spr, px, py - size * .45 + math.sin(age / 4) * 8, 1.0, 0, op)
        else: _stamp(img, spr, px, py, 1.0, 0, op)
    return img


# ----------------------------------------------------------------------------- caption templates
_DANGER = set('die died dies death dead kill killed war attack attacked trap danger fear blood fire burned destroyed'.split())


def caption_style(m):
    """The video's caption template: the manifest's own choice when valid, otherwise the benchmark's clean white sentence-case words."""
    s = m.get('caption_style'); return s if s in STYLES else 'clean'


def _word_color(text, key):
    t = re.sub(r"[^a-z0-9']", '', text.lower())
    if key: return YELLOW
    if _NUM.search(text) or t in _NUMBER_WORDS: return GREEN
    if t in _DANGER: return RED
    return WHITE


def burn_caption(img, words, style='bold'):
    """Burns up to three live caption words, lower-middle safe area, in the chosen template (img modified in place and returned)."""
    if style == 'clean': return burn_clean(img, words)
    shown = [w for w in words or [] if w['shown'] or style == 'karaoke']
    if not shown: return img
    W, H = img.size; size = round(min(W, H) * .085); y = round(H * (.82 if W > H else .7))
    texts = [w['text'].upper() for w in shown]
    for _ in range(2):
        f = font(size); d = ImageDraw.Draw(img); widths = [d.textlength(t, font=f) for t in texts]; gap = size * .42
        total = sum(widths) + gap * (len(shown) - 1)
        if total <= W * .9: break
        size = max(20, int(size * W * .9 / total))
    x = (W - total) / 2
    for w, t, wd in zip(shown, texts, widths):
        age = w.get('age', 99); live = w.get('live'); cx = x + wd / 2; unseen = not w['shown']
        grow = pop(age) if style in ('pop', 'box') and age < 8 else (1.1 if live and style == 'karaoke' else 1.0)
        sw = max(2, round(size * .1))
        if style == 'box' and w['key']:
            pad = size * .28; box = (cx - wd / 2 - pad, y - size * .62, cx + wd / 2 + pad, y + size * .62)
            _stamp_box(img, box, YELLOW, int(size * .22)); d = ImageDraw.Draw(img); d.text((cx, y), t, font=f, anchor='mm', fill=BLACK)
        elif style == 'neon':
            layer = _canvas(W, H); ld = ImageDraw.Draw(layer); col = (0, 235, 255) if w['key'] else (255, 70, 200)
            ld.text((cx, y), t, font=f, anchor='mm', fill=col + (255,), stroke_width=int(size * .08), stroke_fill=col + (255,))
            glow = layer.filter(ImageFilter.GaussianBlur(size * .16)); img.paste(glow, (0, 0), glow); img.paste(glow, (0, 0), glow)
            ImageDraw.Draw(img).text((cx, y), t, font=f, anchor='mm', fill=WHITE, stroke_width=max(1, int(size * .02)), stroke_fill=col)
        else:
            col = (255, 212, 0) if (style == 'karaoke' and live) else ((165, 165, 170) if unseen else _word_color(w['text'], w['key']))
            if grow != 1.0:
                sp = _canvas(wd + size, size * 2); sd = ImageDraw.Draw(sp)
                sd.text((sp.width / 2, sp.height / 2), t, font=f, anchor='mm', fill=col, stroke_width=sw, stroke_fill=BLACK)
                _stamp(img, sp, cx, y, grow)
            else:
                ImageDraw.Draw(img).text((cx, y), t, font=f, anchor='mm', fill=col, stroke_width=sw, stroke_fill=BLACK)
        x += wd + gap
    return img


def _stamp_box(img, box, color, r):
    layer = _canvas(img.width, img.height); ImageDraw.Draw(layer).rounded_rectangle(box, radius=r, fill=color + (255,), outline=BLACK, width=4)
    img.paste(layer, (0, 0), layer)
