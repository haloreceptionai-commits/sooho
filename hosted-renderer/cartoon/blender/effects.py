"""Pure, deterministic particle trajectories for step-7 effects (no Blender import).

Every effect is a fixed number of engine-owned particles whose position/scale per
time t are closed-form, so tests can check gravity, start timing and ground contact.
"""
import math, random

KINDS = {'explosion', 'smoke', 'fire', 'sparks', 'dust', 'rain'}
COUNTS = {'explosion': 90, 'smoke': 24, 'fire': 28, 'sparks': 60, 'dust': 36, 'rain': 260}
G = 9.81


def _rng(kind, seed):
    return random.Random(f'{kind}:{seed}')


def particles(kind, seed=0):
    """Static per-particle parameters."""
    r = _rng(kind, seed); out = []
    for i in range(COUNTS[kind]):
        a = r.uniform(0, math.tau); u = r.uniform(-.2, 1)
        out.append({'i': i, 'a': a, 'u': u, 'speed': r.uniform(.6, 1.0), 'size': r.uniform(.6, 1.0),
                    'delay': r.uniform(0, 1), 'x': r.uniform(-1, 1), 'y': r.uniform(-1, 1),
                    'role': ('fireball' if i < 14 else 'smoke' if i < 40 else 'debris') if kind == 'explosion' else kind})
    return out


def state(kind, p, t, scale=1.0):
    """Particle p at seconds t after the effect starts -> (x, y, z, size) relative to the effect origin; size 0 = hidden."""
    if t < 0: return (0, 0, 0, 0)
    s = scale; c, n = math.cos(p['a']), math.sin(p['a'])
    if kind == 'explosion':
        if p['role'] == 'fireball':
            k = min(1, t / .18); fade = max(0, 1 - max(0, t - .35) / .35)
            rad = s * (.25 + .55 * k) * p['speed']
            return (rad * c * .6, rad * n * .6, s * (.35 + .35 * k + .4 * p['u'] * k), s * .55 * p['size'] * (.3 + .7 * k) * fade)
        if p['role'] == 'smoke':
            k = 1 - math.exp(-t * 2.2); rise = .45 * t
            return (s * 1.1 * k * c * p['speed'], s * 1.1 * k * n * p['speed'], s * (.4 + .5 * k + rise * p['speed']), s * (.25 + .55 * k) * p['size'] * (1 if t < 2.6 else max(0, 1 - (t - 2.6))))
        v = s * 5.5 * p['speed']; vz = s * (3 + 3 * max(0, p['u']))
        z = .2 * s + vz * t - .5 * G * t * t
        if z <= 0:  # rests on the ground where it landed (never below it)
            tl = (vz + math.sqrt(vz * vz + 2 * G * .2 * s)) / G; d = v * .6 * tl
            return (d * c, d * n, 0.0, s * .07 * p['size'])
        d = v * .6 * t
        return (d * c, d * n, z, s * .07 * p['size'])
    if kind == 'smoke':
        life = 2.4; age = (t + p['delay'] * life) % life; k = age / life
        return (s * (.15 * p['x'] + .5 * k * c * .4), s * (.15 * p['y'] + .5 * k * n * .4), s * (.1 + 1.6 * k), s * (.15 + .45 * k) * p['size'] * (1 - k * k))
    if kind == 'fire':
        life = .7; age = (t + p['delay'] * life) % life; k = age / life
        flick = .85 + .15 * math.sin(37 * t + p['i'])
        return (s * .18 * p['x'] * (1 - k), s * .18 * p['y'] * (1 - k), s * (.05 + .7 * k), s * .2 * p['size'] * (1 - k) * flick)
    if kind == 'sparks':
        life = .8; age = (t + p['delay'] * .5) % life
        v = s * 2.2 * p['speed']; z = .1 * s + s * 2.5 * p['speed'] * age - .5 * G * age * age
        return (v * age * c, v * age * n, max(0.0, z), (s * .025 if z > 0 and age < life * .9 else 0))
    if kind == 'dust':
        k = 1 - math.exp(-t * 1.6); fade = max(0, 1 - max(0, t - 2) / 1.5)
        return (s * 1.8 * k * c * p['speed'], s * 1.8 * k * n * p['speed'], s * (.1 + .35 * k * p['size']), s * (.2 + .5 * k) * p['size'] * fade)
    if kind == 'rain':
        span = 6 * s; fall = 7.0; z = 5 - ((t * fall + p['delay'] * 5) % 5)
        return (p['x'] * span / 2, p['y'] * span / 2, z, .012)
    raise ValueError(kind)


def shake_offset(t, hits, fps=30):
    """Slight decaying camera shake after each hit time (metres)."""
    x = y = z = 0.0
    for h in hits:
        dt = t - h['t']
        if 0 <= dt < .6:
            a = h.get('amp', .04) * math.exp(-dt * 7)
            x += a * math.sin(dt * 71); z += a * .7 * math.sin(dt * 53 + 1); y += a * .3 * math.sin(dt * 47)
    return (x, y, z)


def whip_blend(t, dur=.28):
    """0 -> 1 fast swing of the look target over the first `dur` seconds (motion-blur friendly ease)."""
    k = min(1, max(0, t / dur)); return k * k * (3 - 2 * k)


def crowd_layout(count, center, size, seed=0, spacing=.55):
    """Grid-jittered positions for `count` figures inside a w x d rectangle; no two closer than spacing*0.6."""
    r = random.Random(f'crowd:{seed}'); w, d = size
    cols = max(1, int(w / spacing)); rows = math.ceil(count / cols)
    if rows * spacing > d + 1e-6: raise ValueError(f'{count} figures do not fit {w}x{d} m')
    pts = []
    for i in range(count):
        cx = (i % cols + .5) * spacing - w / 2; cy = (i // cols + .5) * spacing - d / 2
        pts.append((center[0] + cx + r.uniform(-.12, .12) * spacing, center[1] + cy + r.uniform(-.12, .12) * spacing,
                    r.uniform(.88, 1.08), r.randrange(6), r.uniform(0, math.tau)))
    return pts


def crowd_bob(action, phase, t):
    if action == 'cheer': return abs(math.sin(t * 6 + phase)) * .12
    if action == 'run': return abs(math.sin(t * 11 + phase)) * .07
    return .01 * math.sin(t * 2 + phase)
