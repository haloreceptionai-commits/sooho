"""Deterministic information cards for the documentary renderer.

Numbers, dates, places and quotes are drawn by code from exact data, never by an image model, so they can never be misspelled
or invented by a picture. Every card is a function  draw(W, H, data, t, dur) -> Layer  where t is seconds into the beat.
Cards animate (counters count up, bars grow, timelines draw) and finish their motion well before the beat ends.
"""
import math
from functools import lru_cache

import numpy as np

from doc_gfx import (GOLD, GREY, INK, PAPER, RED, TEAL, WHITE, Layer, clamp01, ease_in_out, ease_out, ease_out_back, fit_font, font,
                     format_number, lerp, parse_number, smooth, text_size, window, wrap)

KINDS = ('number', 'quote', 'document', 'timeline', 'location', 'compare', 'keyfact', 'chapter', 'title', 'steps')
OVERLAYS = ('lower_third', 'date_stamp', 'source_tag', 'speech')
LIMITS = {'text': 220, 'label': 80, 'items': 6, 'events': 7, 'lines': 7}


@lru_cache(maxsize=16)
def _scrim_alpha(w, h, strength, soft):
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.sqrt(((xs - w / 2) / (w * .62)) ** 2 + ((ys - h / 2) / (h * .72)) ** 2)
    x = np.clip((d - .15) / soft, 0, 1)
    a = np.clip(strength * (1 - (x * x * (3 - 2 * x)) * .55), 0, 1)
    return (a * 255).astype(np.uint8)


def _scrim(L, strength=.62, soft=.62):
    """Darkens the picture behind a card so its text stays readable: a soft radial dim, strongest at the centre."""
    L.rgb[:] = (8, 10, 16)
    L.a = _scrim_alpha(L.w, L.h, strength, soft).copy()


def _fade(t, dur, fin=.25, fout=.22):
    return smooth(window(t, 0, fin)) * (1 - smooth(window(t, dur - fout, dur)))


def _s(H):
    return H / 1080.0


# --------------------------------------------------------------------------------------------------------------------
def number(W, H, d, t, dur):
    """A big number that counts up, with its label. data: value, label, prefix, suffix, count(bool), accent."""
    s = _s(H)
    L = Layer(W, H)
    _scrim(L)
    raw = str(d.get('value', ''))[:24]
    prefix, suffix = str(d.get('prefix', ''))[:6], str(d.get('suffix', ''))[:14]
    parsed = parse_number(raw)
    p = ease_out(window(t, .1, min(1.6, dur * .55)))
    shown = raw
    if parsed and d.get('count', True) and parsed[0] != 0:
        v, dec, commas = parsed
        shown = format_number(v * p, dec, commas)
    big = font('oswald', 330 * s * (.82 if len(shown) + len(prefix) + len(suffix) > 9 else 1) * (.8 if len(shown) > 13 else 1), 700)
    small = font('oswald', 120 * s, 600)
    w_main = text_size(shown, big)[0]
    w_pre = text_size(prefix, small)[0] + 14 * s if prefix else 0
    w_suf = text_size(suffix, small)[0] + 14 * s if suffix else 0
    total = w_pre + w_main + w_suf
    x = W / 2 - total / 2
    y = H * .5 - big.size * .62
    fade = _fade(t, dur) * 255
    accent = tuple(d.get('accent') or GOLD) if d.get('accent') else GOLD
    if prefix:
        L.text((x, y + big.size * .28), prefix, small, WHITE, alpha=fade, shadow=10)
    L.text((x + w_pre, y), shown, big, accent, alpha=fade, shadow=16)
    if suffix:
        L.text((x + w_pre + w_main + 14 * s, y + big.size * .46), suffix, small, WHITE, alpha=fade, shadow=10)
    bar_w = (total * .9) * ease_out(window(t, .25, 1.0))
    gh = text_size(shown, big)[1]
    L.rect(W / 2 - bar_w / 2, y + gh + 26 * s, bar_w, 7 * s, accent, alpha=fade, radius=3)
    label = str(d.get('label', ''))[:LIMITS['label']].upper()
    if label:
        lf = font('inter', 52 * s, 700)
        lines = wrap(label, lf, W * .72)[:2]
        a2 = smooth(window(t, .55, 1.0)) * (1 - smooth(window(t, dur - .22, dur))) * 255
        L.paragraph((W / 2, y + gh + 56 * s), lines, lf, WHITE, 'center', int(lf.size * 1.3), alpha=a2, shadow=8)
    return L


def quote(W, H, d, t, dur):
    """A pull quote with its speaker. data: text, who, role."""
    s = _s(H)
    L = Layer(W, H)
    _scrim(L, .7)
    text = str(d.get('text', ''))[:LIMITS['text']]
    fnt, lines = fit_font('playfair', text, W * .62, H * .5, 86 * s, 600, 5, 34)
    fade = _fade(t, dur, .3, .25)
    qf = font('playfair', 420 * s, 800)
    L.text((W * .11, H * .1), '“', qf, GOLD, alpha=fade * 230, shadow=10)
    x, y = W * .19, H * .5 - len(lines) * fnt.size * .62
    total_chars = sum(len(l) for l in lines) or 1
    reveal = window(t, .15, min(2.6, dur * .6)) * total_chars
    seen = 0
    for line in lines:
        n = int(clamp01((reveal - seen) / max(1, len(line))) * len(line) + .0001) if reveal < total_chars else len(line)
        L.text((x, y), line[:n], fnt, WHITE, alpha=fade * 255, shadow=10)
        seen += len(line)
        y += fnt.size * 1.22
    who = str(d.get('who', ''))[:60]
    if who:
        wf = font('inter', 46 * s, 700)
        a = smooth(window(t, 1.0, 1.5)) * fade * 255
        L.rect(x, y + 18 * s, 90 * s * ease_out(window(t, .9, 1.4)), 6 * s, GOLD, alpha=fade * 255, radius=3)
        L.text((x, y + 40 * s), who.upper(), wf, GOLD, alpha=a, shadow=6, spacing=3)
        role = str(d.get('role', ''))[:70]
        if role:
            L.text((x, y + 40 * s + wf.size * 1.25), role, font('inter', 36 * s, 500), GREY, alpha=a, shadow=5)
    return L


def _paper(w, h, rng):
    img = Layer(w, h)
    base = np.array(PAPER, np.float32)
    grain = rng.normal(0, 4.5, (h, w, 1)).astype(np.float32)
    ys = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
    tone = base * (1 - .06 * ys) + grain
    img.rgb = np.clip(np.broadcast_to(tone, (h, w, 3)), 0, 255).astype(np.uint8).copy()
    img.a[:] = 255
    return img


def document(W, H, d, t, dur):
    """A paper record: letter, headline or report. data: kind, masthead, title, lines[], stamp, date."""
    s = _s(H)
    kind = d.get('kind') or 'letter'
    rng = np.random.default_rng(7)
    pw, ph = int(W * .46), int(H * .74)
    paper = _paper(pw, ph, rng)
    ink = (38, 32, 28)
    y = int(48 * s)
    if kind == 'headline':
        mast = str(d.get('masthead', '') or '')[:40]
        if mast:
            mf = font('playfair', 62 * s, 800)
            paper.text((pw / 2, y), mast.upper(), mf, ink, 'center')
            y += int(mf.size * 1.05)
            paper.rect(36 * s, y, pw - 72 * s, 5 * s, ink)
            paper.rect(36 * s, y + 12 * s, pw - 72 * s, 2 * s, ink)
            y += int(34 * s)
        date = str(d.get('date', '') or '')[:30]
        if date:
            paper.text((pw / 2, y), date.upper(), font('inter', 28 * s, 600), (90, 82, 74), 'center', spacing=2)
            y += int(52 * s)
        hf, hl = fit_font('playfair', str(d.get('title', ''))[:120], pw - 90 * s, ph * .42, 92 * s, 900, 4, 36, 1.08)
        y = paper.paragraph((pw / 2, y), hl, hf, ink, 'center', int(hf.size * 1.08))
        y += 14 * s
    else:
        title = str(d.get('title', '') or '')[:60]
        if title:
            tf = font('playfair', 58 * s, 800)
            paper.text((50 * s, y), title.upper(), tf, ink, spacing=2)
            y += int(tf.size * 1.4)
            paper.rect(50 * s, y - 10 * s, pw - 100 * s, 3 * s, ink)
            y += int(20 * s)
    body_f = font('playfair', 40 * s, 500)
    lines = []
    for ln in (d.get('lines') or [])[:LIMITS['lines']]:
        lines += wrap(str(ln)[:160], body_f, pw - 100 * s)
    total_chars = sum(len(l) for l in lines) or 1
    reveal = ease_out(window(t, .35, min(2.4, dur * .7))) * total_chars
    seen = 0
    for ln in lines[:10]:
        n = int(clamp01((reveal - seen) / max(1, len(ln))) * len(ln) + .0001)
        paper.text((50 * s, y), ln[:n], body_f, ink)
        seen += len(ln)
        y += int(body_f.size * 1.35)
        if y > ph - 90 * s:
            break
    stamp = str(d.get('stamp', '') or '')[:22]
    if stamp and t > .9:
        sf = font('oswald', 90 * s, 700)
        sw, sh = text_size(stamp.upper(), sf)
        stw, sth = sw + int(70 * s), sh + int(50 * s)
        # hollow stamp: a rounded frame (outer rect minus inner rect) with the word inside
        frame = Layer(stw, sth)
        frame.rect(4, 4, stw - 8, sth - 8, RED, radius=10)
        inner = Layer(stw, sth)
        inner.rect(14, 14, stw - 28, sth - 28, RED, radius=6)
        frame.a = np.clip(frame.a.astype(np.int16) - inner.a.astype(np.int16), 0, 255).astype(np.uint8)
        frame.text((stw / 2, 24 * s), stamp.upper(), sf, RED, 'center')
        pop = ease_out_back(window(t, .9, 1.25))
        scale = lerp(1.9, 1.0, clamp01(pop)) if pop < 1 else 1.0
        frame = _rotate_scale(frame, -11, scale)
        paper.paste(frame, (pw - frame.w - int(30 * s), ph - frame.h - int(40 * s)), opacity=min(1, pop) * .92)
    # drop the paper onto the frame, slightly tilted, with a soft shadow
    L = Layer(W, H)
    _scrim(L, .55)
    card = _rotate_scale(paper, -2.2, 1.0, pad=40)
    card.blur_shadow((0, int(18 * s)), 26 * s, .6)
    slide = ease_out(window(t, 0, .55))
    fade = _fade(t, dur, .3, .22)
    L.paste(card, (int(W / 2 - card.w / 2), int(H / 2 - card.h / 2 + (1 - slide) * 60 * s)), opacity=fade)
    return L


def _rotate_scale(layer, degrees, scale=1.0, pad=0):
    import cv2
    h, w = layer.a.shape
    nw, nh = int((w + pad * 2) * scale), int((h + pad * 2) * scale)
    m = cv2.getRotationMatrix2D((w / 2 + pad, h / 2 + pad), degrees, scale)
    m[0, 2] += (nw - (w + pad * 2)) / 2
    m[1, 2] += (nh - (h + pad * 2)) / 2
    out = Layer(nw, nh)
    big_rgb = np.zeros((h + pad * 2, w + pad * 2, 3), np.uint8)
    big_a = np.zeros((h + pad * 2, w + pad * 2), np.uint8)
    big_rgb[pad:pad + h, pad:pad + w] = layer.rgb
    big_a[pad:pad + h, pad:pad + w] = layer.a
    out.rgb = cv2.warpAffine(big_rgb, m, (nw, nh), flags=cv2.INTER_LINEAR, borderValue=0)
    out.a = cv2.warpAffine(big_a, m, (nw, nh), flags=cv2.INTER_LINEAR, borderValue=0)
    return out


def timeline(W, H, d, t, dur):
    """Dated events on a line that draws itself. data: events[{when,label}], focus(index)."""
    s = _s(H)
    L = Layer(W, H)
    _scrim(L, .66)
    events = [e for e in (d.get('events') or []) if isinstance(e, dict)][:LIMITS['events']]
    if not events:
        return L
    n = len(events)
    fade = _fade(t, dur, .3, .22)
    x0, x1, y = W * .12, W * .88, H * .52
    years = [_year(e.get('when')) for e in events]
    if all(v is not None for v in years) and len(set(years)) == n and max(years) > min(years) and years == sorted(years):
        lo, hi = min(years), max(years)
        xs = [x0 + (v - lo) / (hi - lo) * (x1 - x0) for v in years]
        if n > 1 and min(b - a for a, b in zip(xs, xs[1:])) < W * .09:
            xs = [x0 + k / (n - 1) * (x1 - x0) for k in range(n)]
    else:
        xs = [x0 + (k / (n - 1) if n > 1 else .5) * (x1 - x0) for k in range(n)]
    draw = ease_in_out(window(t, .1, max(.8, min(2.4, dur * .6))))
    L.rect(x0, y - 4 * s, (x1 - x0), 8 * s, (70, 76, 90), alpha=fade * 255, radius=4)
    L.rect(x0, y - 4 * s, (x1 - x0) * draw, 8 * s, GOLD, alpha=fade * 255, radius=4)
    focus = int(d.get('focus', n - 1)) if n else 0
    for k, (e, x) in enumerate(zip(events, xs)):
        when_k = .1 + (x - x0) / max(1, (x1 - x0)) * max(.8, min(2.4, dur * .6))
        pop = ease_out_back(window(t, when_k, when_k + .35))
        if pop <= 0:
            continue
        up = k % 2 == 0
        r = (17 if k == focus else 12) * s * min(1.2, pop)
        L.circle((x, y), r + 6 * s, INK, alpha=fade * 255)
        L.circle((x, y), r, GOLD if k == focus else WHITE, alpha=fade * 255)
        stem = 70 * s * min(1, pop)
        L.line((x, y + (-r if up else r)), (x, y + (-stem if up else stem)), (170, 176, 190), max(2, 3 * s), alpha=fade * 200)
        wf, lf = font('oswald', 74 * s, 700), font('inter', 34 * s, 600)
        when = str(e.get('when', ''))[:16]
        lines = wrap(str(e.get('label', ''))[:90], lf, 330 * s)[:3]
        a = min(1, pop) * fade * 255
        yh = text_size(when.upper(), wf)[1]
        block_h = yh + 10 * s + len(lines) * lf.size * 1.25
        top = (y - stem - block_h - 6 * s) if up else (y + stem + 8 * s)
        L.text((x, top), when.upper(), wf, GOLD if k == focus else WHITE, 'center', alpha=a, shadow=8)
        L.paragraph((x, top + yh + 10 * s), lines, lf, (222, 226, 236), 'center', int(lf.size * 1.25), alpha=a, shadow=6)
    return L


def _year(v):
    import re
    m = re.search(r'-?\d{1,4}', str(v or ''))
    if not m:
        return None
    n = int(m.group(0))
    return -n if re.search(r'\b(BC|BCE)\b', str(v), re.I) else n


def compare(W, H, d, t, dur):
    """Bars that grow to scale. data: items[{label,value,unit}], title."""
    s = _s(H)
    L = Layer(W, H)
    _scrim(L, .68)
    items = []
    for it in (d.get('items') or [])[:LIMITS['items']]:
        if isinstance(it, dict):
            p = parse_number(it.get('value'))
            if p and p[0] > 0:
                items.append((str(it.get('label', ''))[:40], p, str(it.get('unit', ''))[:12]))
    if len(items) < 2:
        return L
    fade = _fade(t, dur, .3, .22)
    title = str(d.get('title', ''))[:70]
    top = H * .2
    if title:
        L.text((W * .1, H * .12), title.upper(), font('inter', 44 * s, 700), GOLD, alpha=fade * 255, shadow=6, spacing=3)
        top = H * .24
    vmax = max(p[0] for _, p, _ in items)
    row_h = min(130 * s, (H * .86 - top) / len(items))
    lab_w = W * .24
    bar_x, bar_w = W * .1 + lab_w, W * .8 - lab_w
    lf, vf = font('oswald', min(58 * s, row_h * .46), 600), font('oswald', min(66 * s, row_h * .5), 700)
    for k, (label, (v, dec, commas), unit) in enumerate(items):
        grow = ease_out(window(t, .2 + k * .28, .2 + k * .28 + 1.1))
        y = top + k * row_h
        top_bar = v == vmax
        L.text((W * .1, y + row_h * .12), label.upper()[:20], lf, WHITE, alpha=fade * 255, shadow=6)
        L.rect(bar_x, y + row_h * .12, bar_w, row_h * .56, (44, 50, 64), alpha=fade * 200, radius=int(8 * s))
        w = max(6 * s, bar_w * (v / vmax) * grow)
        L.rect(bar_x, y + row_h * .12, w, row_h * .56, GOLD if top_bar else TEAL, alpha=fade * 255, radius=int(8 * s))
        shown = format_number(v * grow, dec, commas) + (' ' + unit if unit else '')
        L.text((bar_x + w + 18 * s if w < bar_w * .82 else bar_x + w - 18 * s, y + row_h * .15), shown, vf, WHITE if w < bar_w * .82 else INK,
               'left' if w < bar_w * .82 else 'right', alpha=fade * 255, shadow=6 if w < bar_w * .82 else 0)
    return L


def keyfact(W, H, d, t, dur):
    """One sentence on screen with the key words highlighted. data: text, tag, mark[]."""
    s = _s(H)
    L = Layer(W, H)
    _scrim(L, .7)
    text = str(d.get('text', ''))[:LIMITS['text']]
    fnt, lines = fit_font('oswald', text.upper(), W * .74, H * .56, 150 * s, 700, 4, 44, 1.12)
    fade = _fade(t, dur, .3, .22)
    tag = str(d.get('tag', ''))[:30]
    total_h = len(lines) * fnt.size * 1.12
    y = H / 2 - total_h / 2 + 10 * s
    if tag:
        tf = font('inter', 40 * s, 800)
        tw, th = text_size(tag.upper(), tf)
        tw += 3 * len(tag)
        slide = ease_out(window(t, 0, .4))
        L.rect(W * .13 - 16 * s, y - th - 54 * s, (tw + 32 * s) * slide, th + 28 * s, GOLD, alpha=fade * 255, radius=int(6 * s))
        if slide > .6:
            L.text((W * .13, y - th - 44 * s), tag.upper(), tf, INK, alpha=fade * 255, spacing=3)
    marks = [m.upper() for m in (d.get('mark') or []) if isinstance(m, str) and m.strip()][:4]
    lh = fnt.size * 1.12
    for i, line in enumerate(lines):
        ly = y + i * lh
        a = smooth(window(t, .15 + i * .18, .5 + i * .18))
        shift = (1 - ease_out(window(t, .15 + i * .18, .6 + i * .18))) * 36 * s
        for m in marks:
            at = line.find(m)
            if at >= 0:
                pre = fnt.getlength(line[:at])
                mw = fnt.getlength(m)
                sweep = ease_out(window(t, .5 + i * .18, 1.0 + i * .18))
                L.rect(W * .13 + pre - 8 * s, ly + fnt.size * .62, (mw + 16 * s) * sweep, fnt.size * .38, GOLD, alpha=fade * 235, radius=4)
        L.text((W * .13, ly + shift), line, fnt, WHITE, alpha=fade * a * 255, shadow=12)
    return L


def chapter(W, H, d, t, dur):
    """Chapter opener. data: number, title, subtitle."""
    s = _s(H)
    L = Layer(W, H)
    _scrim(L, .72, .9)
    fade = _fade(t, dur, .35, .3)
    num = str(d.get('number', ''))[:3]
    title = str(d.get('title', ''))[:70]
    if num:
        L.text((W * .5, H * .5 - 330 * s), num, font('oswald', 720 * s, 700), WHITE, 'center', alpha=fade * 32)
    kf = font('inter', 40 * s, 800)
    k_w = ease_out(window(t, .05, .6))
    label = f'CHAPTER {num}' if num else 'NEXT'
    L.text((W / 2, H * .5 - 150 * s - (1 - k_w) * 20 * s), label, kf, GOLD, 'center', alpha=fade * k_w * 255, spacing=10)
    fnt, lines = fit_font('oswald', title.upper(), W * .8, H * .38, 170 * s, 700, 3, 50, 1.08)
    sweep = ease_out(window(t, .15, .9))
    L.rect(W / 2 - 80 * s * sweep, H * .5 - 100 * s, 160 * s * sweep, 6 * s, GOLD, alpha=fade * 255, radius=3)
    y = H * .5 - 70 * s
    for i, ln in enumerate(lines):
        a = smooth(window(t, .3 + i * .15, .8 + i * .15))
        L.text((W / 2, y + (1 - a) * 28 * s), ln, fnt, WHITE, 'center', alpha=fade * a * 255, shadow=14)
        y += fnt.size * 1.12
    sub = str(d.get('subtitle', ''))[:90]
    if sub:
        a = smooth(window(t, .8, 1.3))
        L.text((W / 2, y + 22 * s), sub, font('inter', 44 * s, 500), (214, 218, 228), 'center', alpha=fade * a * 255, shadow=8)
    return L


def title(W, H, d, t, dur):
    """The video's own title card. data: title, subtitle."""
    s = _s(H)
    L = Layer(W, H)
    _scrim(L, .6, .9)
    fade = _fade(t, dur, .4, .3)
    fnt, lines = fit_font('oswald', str(d.get('title', ''))[:90].upper(), W * .82, H * .5, 200 * s, 700, 3, 56, 1.06)
    h = len(lines) * fnt.size * 1.06
    y = H / 2 - h / 2 - 20 * s
    bar = ease_out(window(t, .1, .9))
    L.rect(W / 2 - 220 * s * bar, y - 44 * s, 440 * s * bar, 8 * s, GOLD, alpha=fade * 255, radius=4)
    for i, ln in enumerate(lines):
        a = smooth(window(t, .2 + i * .15, .7 + i * .15))
        L.text((W / 2, y + (1 - a) * 30 * s), ln, fnt, WHITE, 'center', alpha=fade * a * 255, shadow=16)
        y += fnt.size * 1.06
    sub = str(d.get('subtitle', ''))[:80]
    if sub:
        a = smooth(window(t, .8, 1.3))
        L.text((W / 2, y + 24 * s), sub.upper(), font('inter', 46 * s, 700), GOLD, 'center', alpha=fade * a * 255, shadow=8, spacing=6)
    return L


def steps(W, H, d, t, dur):
    """A process or chain of causes: boxes joined by arrows that build in turn. data: steps[], title."""
    s = _s(H)
    L = Layer(W, H)
    _scrim(L, .68)
    items = [str(x)[:50] for x in (d.get('steps') or []) if str(x).strip()][:5]
    if len(items) < 2:
        return L
    fade = _fade(t, dur, .3, .22)
    n = len(items)
    title = str(d.get('title', ''))[:70]
    if title:
        L.text((W * .1, H * .14), title.upper(), font('inter', 44 * s, 700), GOLD, alpha=fade * 255, shadow=6, spacing=3)
    gap = 70 * s
    bw = (W * .84 - gap * (n - 1)) / n
    bh = 300 * s
    y = H * .5 - bh / 2 + 20 * s
    f = font('oswald', 54 * s, 600)
    for k, label in enumerate(items):
        t0 = .2 + k * .55
        pop = ease_out_back(window(t, t0, t0 + .45))
        if pop <= 0:
            continue
        x = W * .08 + k * (bw + gap)
        sc = min(1, pop)
        cx, cy = x + bw / 2, y + bh / 2
        w, h = bw * sc, bh * sc
        L.rect(cx - w / 2, cy - h / 2, w, h, (30, 36, 50), alpha=fade * 240, radius=int(18 * s))
        L.rect(cx - w / 2, cy - h / 2, w, 8 * s, GOLD if k == n - 1 else TEAL, alpha=fade * 255, radius=int(4 * s))
        L.text((cx, cy - h / 2 + 24 * s), str(k + 1), font('oswald', 70 * s, 700), GOLD if k == n - 1 else TEAL, 'center', alpha=fade * sc * 255)
        lines = wrap(label.upper(), f, bw - 36 * s)[:4]
        L.paragraph((cx, cy - 20 * s), lines, f, WHITE, 'center', int(f.size * 1.18), alpha=fade * sc * 255)
        if k < n - 1:
            a = smooth(window(t, t0 + .35, t0 + .6))
            ax0, ax1 = x + bw + 10 * s, x + bw + gap - 10 * s
            L.line((ax0, cy), (lerp(ax0, ax1, a), cy), GOLD, max(3, 6 * s), alpha=fade * 255)
            if a > .9:
                L.polygon([(ax1 + 6 * s, cy), (ax1 - 16 * s, cy - 14 * s), (ax1 - 16 * s, cy + 14 * s)], GOLD, alpha=fade * 255)
    return L


# --------------------------------------------------------------------------------------------------------------------
def lower_third(W, H, d, t, dur):
    """Name and role bar, bottom left, over a normal picture. data: name, sub."""
    s = _s(H)
    L = Layer(W, H)
    name, sub = str(d.get('name', ''))[:48], str(d.get('sub', ''))[:60]
    if not name:
        return L
    slide = ease_out(window(t, .1, .55))
    out = smooth(window(t, dur - .35, dur))
    nf, sf = font('oswald', 64 * s, 700), font('inter', 34 * s, 600)
    w = max(text_size(name.upper(), nf)[0], text_size(sub, sf)[0] if sub else 0) + 70 * s
    h = nf.size * 1.12 + (sf.size * 1.4 if sub else 8 * s) + 18 * s
    right = d.get('side') == 'right'   # next to a cutout, the label stands on the other side of the frame
    gone = (1 - slide) * (w + 80 * s) + out * (w + 80 * s)
    x = (W - w - W * .06 + gone) if right else (W * .06 - gone)
    y = H * .76
    L.rect(x, y, w, h, (12, 14, 22), alpha=225, radius=int(8 * s))
    L.rect(x, y, 10 * s, h, GOLD, radius=int(4 * s))
    L.text((x + 36 * s, y + 8 * s), name.upper(), nf, WHITE)
    if sub:
        L.text((x + 36 * s, y + 8 * s + nf.size * 1.1), sub, sf, GOLD)
    return L


def date_stamp(W, H, d, t, dur):
    """Place and date at top left. data: place, when."""
    s = _s(H)
    L = Layer(W, H)
    parts = [str(d.get('place', ''))[:32].upper(), str(d.get('when', ''))[:20].upper()]
    text = '  ·  '.join(p for p in parts if p)
    if not text:
        return L
    fnt = font('inter', 38 * s, 800)
    w, h = text_size(text, fnt)
    a = smooth(window(t, .1, .5)) * (1 - smooth(window(t, dur - .3, dur)))
    x, y = W * .05, H * .07
    L.rect(x, y, (w + 56 * s) * ease_out(window(t, .05, .5)), h + 30 * s, (12, 14, 22), alpha=a * 220, radius=int(6 * s))
    L.rect(x, y, 8 * s, h + 30 * s, GOLD, alpha=a * 255, radius=int(3 * s))
    L.text((x + 30 * s, y + 13 * s), text, fnt, WHITE, alpha=a * 255, spacing=3)
    return L


def source_tag(W, H, d, t, dur):
    """Small source line at bottom right. data: text."""
    s = _s(H)
    L = Layer(W, H)
    text = str(d.get('text', ''))[:70]
    if not text:
        return L
    fnt = font('inter', 28 * s, 600)
    w, h = text_size('Source: ' + text, fnt)
    a = smooth(window(t, .2, .6)) * (1 - smooth(window(t, dur - .3, dur)))
    L.text((W - W * .04, H * .93), 'Source: ' + text, fnt, (214, 218, 228), 'right', alpha=a * 230, shadow=8)
    return L


from doc_geo import location

def speech(W, H, d, t, dur):
    """A speech bubble for words a person says, top left or top right. data: text, side."""
    s = _s(H)
    L = Layer(W, H)
    text = str(d.get('text', ''))[:120]
    if not text:
        return L
    right = d.get('side') == 'right'
    fnt = font('inter', 40 * s, 600)
    lines = wrap(text, fnt, W * .32)[:4]
    lw = max(text_size(l, fnt)[0] for l in lines)
    lh = int(fnt.size * 1.3)
    bw, bh = lw + int(64 * s), lh * len(lines) + int(44 * s)
    cx = (W - W * .06 - bw / 2) if right else (W * .06 + bw / 2)
    cy = H * .1 + bh / 2
    sc = clamp01(ease_out_back(window(t, .05, .45))) * (1 - smooth(window(t, dur - .3, dur)))
    if sc <= .02:
        return L
    w, h = bw * sc, bh * sc
    L.rect(cx - w / 2 + 4 * s, cy - h / 2 + 6 * s, w, h, (10, 12, 18), alpha=70, radius=int(26 * s))
    L.rect(cx - w / 2, cy - h / 2, w, h, (252, 252, 250), alpha=248, radius=int(26 * s))
    tx = cx + (bw * .22 if right else -bw * .22) * sc
    L.polygon([(tx - 18 * s * sc, cy + h / 2 - 2), (tx + 18 * s * sc, cy + h / 2 - 2), (tx + (26 * s if right else -26 * s) * sc, cy + h / 2 + 46 * s * sc)], (252, 252, 250), alpha=248)
    if sc > .8:
        L.paragraph((cx - lw / 2, cy - h / 2 + 22 * s), lines, fnt, (28, 32, 44), 'left', lh, alpha=255)
    return L


CARD_FUNCS = {'location': location, 'number': number, 'quote': quote, 'document': document, 'timeline': timeline, 'compare': compare, 'keyfact': keyfact, 'chapter': chapter,
              'title': title, 'steps': steps}
OVERLAY_FUNCS = {'lower_third': lower_third, 'date_stamp': date_stamp, 'source_tag': source_tag, 'speech': speech}
