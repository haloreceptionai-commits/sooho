"""Animated map card: real coastlines (Natural Earth, public domain), a camera that zooms in on the places, pins that pop and a route that draws itself.

Coordinates come from the script planner and are range-checked here; a place without valid coordinates is dropped, and a map with none
is not drawn at all (the planner falls back to a picture). Nothing is drawn from an image model, so the geography is exact.
"""
import json
import math
import os

import cv2
import numpy as np

from doc_gfx import GOLD, INK, WHITE, Layer, ease_in_out, ease_out, ease_out_back, font, lerp, smooth, text_size, window

_LAND = None
OCEAN_TOP, OCEAN_BOTTOM = (18, 28, 46), (10, 16, 28)
LAND, COAST = (64, 76, 94), (122, 138, 160)


def land():
    global _LAND
    if _LAND is None:
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'land.json'), encoding='utf8') as f:
            raw = json.load(f)
        u = float(raw['unit'])
        _LAND = [(np.array(r[0::2], np.float32) / u, np.array(r[1::2], np.float32) / u) for r in raw['rings']]
    return _LAND


def valid_points(points):
    out = []
    for p in (points or [])[:8]:
        if not isinstance(p, dict):
            continue
        try:
            lat, lon = float(p.get('lat')), float(p.get('lon'))
        except (TypeError, ValueError):
            continue
        if -85 <= lat <= 85 and -180 <= lon <= 180:
            out.append({'name': str(p.get('name', ''))[:28], 'lat': lat, 'lon': lon})
    return out


def view_for(points, W, H, pad=1.0):
    """Centre and pixels-per-degree that frame all points with generous margins; longitude is shrunk by cos(latitude)."""
    lats = [p['lat'] for p in points]
    lons = [p['lon'] for p in points]
    clat, clon = (min(lats) + max(lats)) / 2, (min(lons) + max(lons)) / 2
    cosφ = max(.25, math.cos(math.radians(clat)))
    dlat = max(5.0, (max(lats) - min(lats)) * 1.0)
    dlon = max(8.0, (max(lons) - min(lons)) * 1.0)
    k = min(W * .70 / (dlon * cosφ), H * .56 / dlat) / pad
    return clat, clon, cosφ, k


def project(lon, lat, view, W, H):
    clat, clon, cosφ, k = view
    return W / 2 + (np.asarray(lon) - clon) * cosφ * k, H / 2 - (np.asarray(lat) - clat) * k


def _ocean(W, H):
    ys = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    top, bottom = np.array(OCEAN_TOP, np.float32), np.array(OCEAN_BOTTOM, np.float32)
    return np.clip(np.broadcast_to(top * (1 - ys) + bottom * ys, (H, W, 3)), 0, 255).astype(np.uint8).copy()


def _arc(p, q, bend=.16, n=48):
    (x0, y0), (x1, y1) = p, q
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    dx, dy = x1 - x0, y1 - y0
    cx, cy = mx - dy * bend, my + dx * bend
    ts = np.linspace(0, 1, n)
    xs = (1 - ts) ** 2 * x0 + 2 * (1 - ts) * ts * cx + ts ** 2 * x1
    ys = (1 - ts) ** 2 * y0 + 2 * (1 - ts) * ts * cy + ts ** 2 * y1
    return list(zip(xs, ys))


def location(W, H, d, t, dur):
    """data: points[{name,lat,lon}], route(bool), title. Fully opaque: the map replaces the picture for the beat."""
    s = H / 1080.0
    pts = valid_points(d.get('points'))
    L = Layer(W, H)
    L.rgb = _ocean(W, H)
    L.a[:] = 255
    if not pts:
        return L
    final = view_for(pts, W, H)
    wide = (final[0], final[1], final[2], max(final[3] * .32, W / 360.0 / max(.25, final[2]) * 1.4))
    zoom = ease_in_out(window(t, 0, max(1.0, min(2.2, dur * .55))))
    view = tuple(lerp(w, f, zoom) for w, f in zip(wide, final))
    # graticule
    step = 5 if view[3] > 18 else 10 if view[3] > 7 else 20
    for lon in range(-180, 181, step):
        x, _ = project(lon, 0, view, W, H)
        if -5 < x < W + 5:
            cv2.line(L.rgb, (int(x), 0), (int(x), H), (28, 40, 62), 1, cv2.LINE_AA)
    for lat in range(-80, 81, step):
        _, y = project(0, lat, view, W, H)
        if -5 < y < H + 5:
            cv2.line(L.rgb, (0, int(y)), (W, int(y)), (28, 40, 62), 1, cv2.LINE_AA)
    # coastlines: only rings that touch the view are filled
    margin = 80
    for lons, lats in land():
        x, y = project(lons, lats, view, W, H)
        if x.max() < -margin or x.min() > W + margin or y.max() < -margin or y.min() > H + margin:
            continue
        poly = np.stack([x, y], 1).astype(np.int32).reshape(-1, 1, 2)
        cv2.fillPoly(L.rgb, [poly], LAND, cv2.LINE_AA)
        cv2.polylines(L.rgb, [poly], True, COAST, max(1, int(2 * s)), cv2.LINE_AA)
    # route + pins
    px = [project(p['lon'], p['lat'], view, W, H) for p in pts]
    px = [(float(a), float(b)) for a, b in px]
    route = bool(d.get('route', True)) and len(pts) > 1
    seg_time = max(.9, min(2.6, (dur - 1.2) / max(1, len(pts) - 1))) if route else 0
    start = max(.8, min(1.6, dur * .3))
    marks = []
    for i, ((x, y), p) in enumerate(zip(px, pts)):
        t_in = start + (i - 0) * seg_time * (.85 if route else 0)
        marks.append(t_in)
    if route:
        for i in range(len(pts) - 1):
            a = window(t, marks[i], marks[i] + seg_time * .85)
            if a <= 0:
                continue
            arc = _arc(px[i], px[i + 1])
            upto = max(2, int(len(arc) * ease_in_out(a)))
            seg = arc[:upto]
            for j in range(0, len(seg) - 1, 2):
                if (j // 2) % 2 == 0:
                    cv2.line(L.rgb, (int(seg[j][0]), int(seg[j][1])), (int(seg[min(j + 2, len(seg) - 1)][0]), int(seg[min(j + 2, len(seg) - 1)][1])), GOLD, max(3, int(6 * s)), cv2.LINE_AA)
            if a < 1:
                hx, hy = seg[-1]
                cv2.circle(L.rgb, (int(hx), int(hy)), int(11 * s), WHITE, -1, cv2.LINE_AA)
    nf = font('oswald', 54 * s, 700)
    for i, ((x, y), p) in enumerate(zip(px, pts)):
        pop = ease_out_back(window(t, marks[i] - .05, marks[i] + .4))
        if pop <= 0 or not (-60 < x < W + 60 and -60 < y < H + 60):
            continue
        r = 15 * s * min(1.25, pop)
        pulse = 1 + .35 * math.sin(t * 5 + i)
        ring = cv2.circle(np.zeros((H, W), np.uint8), (int(x), int(y)), int(r * 2.1 * pulse), 255, max(2, int(3 * s)), cv2.LINE_AA)
        L.rgb[ring > 0] = (np.array(GOLD) * (ring[ring > 0, None] / 255.0) + L.rgb[ring > 0] * (1 - ring[ring > 0, None] / 255.0)).astype(np.uint8)
        cv2.circle(L.rgb, (int(x), int(y)), int(r + 4 * s), INK, -1, cv2.LINE_AA)
        cv2.circle(L.rgb, (int(x), int(y)), int(r), GOLD, -1, cv2.LINE_AA)
        if p['name']:
            above = i % 2 == 0
            tw, th = text_size(p['name'].upper(), nf)
            tx = min(W - tw / 2 - 30, max(tw / 2 + 30, x))
            ty = y - r - th - 22 * s if above else y + r + 16 * s
            lab = Layer(W, H)
            lab.text((tx, ty), p['name'].upper(), nf, WHITE, 'center', alpha=min(1, pop) * 255, shadow=10, stroke=int(3 * s))
            _stamp(L, lab)
    title = str(d.get('title', ''))[:60]
    if title:
        tl = Layer(W, H)
        a = smooth(window(t, .15, .6))
        tl.text((W * .06, H * .08), title.upper(), font('inter', 42 * s, 800), GOLD, alpha=a * 255, shadow=8, spacing=4)
        _stamp(L, tl)
    vignette = np.linspace(-1, 1, W, dtype=np.float32)[None, :] ** 2 * .45 + np.linspace(-1, 1, H, dtype=np.float32)[:, None] ** 2 * .35
    L.rgb = np.clip(L.rgb.astype(np.float32) * (1 - vignette[..., None] * .5), 0, 255).astype(np.uint8)
    return L


def _stamp(base, layer):
    a = layer.a.astype(np.float32)[..., None] / 255.0
    base.rgb = np.clip(base.rgb.astype(np.float32) * (1 - a) + layer.rgb.astype(np.float32) * a, 0, 255).astype(np.uint8)
