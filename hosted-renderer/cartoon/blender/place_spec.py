"""Advanced place spec (manifest v3): a structured description of WHERE a line happens, compiled deterministically.

The Visual Director proposes, per scene, {terrain, time, weather, dressing:[{id,count}]} using only ids from
place-registry.json. validate() rejects anything else (no silent neutral or painted-card substitute);
compile_place() turns a valid spec into fixed numeric layout for render_shot.py. Pure Python, no Blender.
"""
import hashlib, json, math
from pathlib import Path

HERE = Path(__file__).parent
REGISTRY = json.loads((HERE / 'place-registry.json').read_text())
TERRAINS = set(REGISTRY['terrains']); KITS = set(REGISTRY['kits'])
TIMES = REGISTRY['times']; WEATHER = REGISTRY['weather']; DRESSING = REGISTRY['dressing']
LIGHTING = {'dawn': 'sunset', 'day': 'day', 'dusk': 'sunset', 'night': 'night'}
CLEAR = 6.0          # metres around the world origin kept flat and free of dressing (cast zones sit up to ~3 m off origin)
MAX_ITEMS = 6; MAX_COUNT = 8


class PlaceError(ValueError):
    pass


def entry_hash(i):
    return hashlib.sha256(json.dumps(DRESSING[i], sort_keys=True).encode()).hexdigest()[:16]


def audited():
    try: audit = json.loads((HERE / 'registry-audit.json').read_text())
    except FileNotFoundError: return set()
    return {i for i, r in audit.items() if i in DRESSING and r.get('pass') and r.get('hash') == entry_hash(i)}


def validate(spec, scene=None, era=None):
    """Raise PlaceError with an owner-readable message when the place cannot be built."""
    where = f'Scene {scene + 1}' if scene is not None else 'This scene'
    if not isinstance(spec, dict): raise PlaceError(f'{where} has no place description')
    extra = set(spec) - {'terrain', 'time', 'weather', 'dressing', 'seed'}
    if extra: raise PlaceError(f'{where}: unknown place fields {sorted(extra)}')
    t = spec.get('terrain')
    if t not in TERRAINS and t not in KITS: raise PlaceError(f"{where} needs the place '{t}', which the 3D engine cannot build yet")
    if t in KITS and era is not None:
        from world_pack import kit_fits_era
        if not kit_fits_era(t, era): raise PlaceError(f"{where}: the '{t}' set does not fit the story's year {era}")
    if spec.get('time') not in TIMES: raise PlaceError(f"{where}: time must be one of {TIMES}")
    if spec.get('weather', 'clear') not in WEATHER: raise PlaceError(f"{where}: weather must be one of {WEATHER}")
    if not isinstance(spec.get('seed', 0), int): raise PlaceError(f'{where}: bad seed')
    items = spec.get('dressing', [])
    if not isinstance(items, list) or len(items) > MAX_ITEMS: raise PlaceError(f'{where}: up to {MAX_ITEMS} kinds of set dressing')
    ok = audited()
    for d in items:
        if not isinstance(d, dict) or set(d) - {'id', 'count'}: raise PlaceError(f'{where}: bad set dressing')
        if d.get('id') not in DRESSING: raise PlaceError(f"{where} needs '{d.get('id')}', which the 3D engine cannot draw yet")
        if d['id'] not in ok: raise PlaceError(f"{where} needs '{d['id']}', which has not passed its local render check")
        c = d.get('count', 1)
        if not isinstance(c, int) or not 1 <= c <= MAX_COUNT: raise PlaceError(f'{where}: count 1-{MAX_COUNT}')
        if DRESSING[d['id']].get('water') and t != 'river_crossing': raise PlaceError(f"{where}: '{d['id']}' needs water, but the place is {t}")
    return spec


def _rand(seed, k):
    h = hashlib.sha256(f'{seed}:{k}'.encode()).digest()
    return int.from_bytes(h[:4], 'big') / 2 ** 32


def noise(x, y, seed, scale):
    """Deterministic smooth value noise in [0, 1]."""
    gx, gy = math.floor(x / scale), math.floor(y / scale); fx, fy = x / scale - gx, y / scale - gy
    s = lambda i, j: _rand(seed, f'{gx + i},{gy + j}')
    u, v = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b = s(0, 0) + (s(1, 0) - s(0, 0)) * u, s(0, 1) + (s(1, 1) - s(0, 1)) * u
    return a + (b - a) * v


def ramp(d, start, width):
    t = max(0.0, min(1.0, (d - start) / width)); return t * t * (3 - 2 * t)


RIVER_Y, RIVER_HALF = 12.0, 3.5


def height(terrain, x, y, seed=0):
    """Ground height in metres; flat (0) inside the cast area so feet, shadows and camera fits stay valid."""
    r = math.hypot(x, y); n = noise(x, y, seed, 7.0); big = noise(x, y, seed + 1, 22.0)
    if terrain == 'mountain_pass':
        side = abs(x)
        return ramp(side, 7, 18) * (22 + 18 * big) + ramp(r, CLEAR + 2, 6) * n * 0.6
    if terrain == 'valley':
        return ramp(r, 16, 30) * (10 + 10 * big) + ramp(r, CLEAR + 2, 8) * n * 0.8
    if terrain == 'river_crossing':
        bank = abs(y - RIVER_Y)
        if bank < RIVER_HALF + 1.5: return -1.1 * (1 - ramp(bank, RIVER_HALF - 0.8, 2.3)) if r > CLEAR - 0.5 else 0.0
        return ramp(r, 26, 30) * (8 + 8 * big) + ramp(r, CLEAR + 2, 8) * n * 0.5
    if terrain == 'camp':
        return ramp(r, 30, 30) * (6 + 6 * big) + ramp(r, CLEAR + 2, 8) * n * 0.4
    return ramp(r, 55, 30) * (4 + 5 * big) + ramp(r, CLEAR + 2, 8) * n * 0.35  # plain


# Placement rings: near items stand just outside the cast area, far items frame the horizon.
NEAR = [(-6.6, 1.0), (6.8, 1.8), (-6.2, 5.2), (6.6, 5.6), (-3.4, 7.6), (3.6, 8.0), (-7.4, -2.2), (7.6, -2.8)]


def _spot(terrain, k, seed, far):
    a = _rand(seed, f'a{k}') * 2 * math.pi
    if terrain == 'mountain_pass' and far:   # along the walls of the pass
        sx = -1 if k % 2 else 1; return (sx * (9 + 6 * _rand(seed, f'd{k}')), -18 + 46 * _rand(seed, f'y{k}'))
    d = (10 + 16 * _rand(seed, f'd{k}')) if far else (CLEAR + 0.8 + 3.5 * _rand(seed, f'd{k}'))
    x, y = math.cos(a) * d, math.sin(a) * d
    if terrain == 'river_crossing' and abs(y - RIVER_Y) < RIVER_HALF + 1.2: y = RIVER_Y + (RIVER_HALF + 2) * (1 if y > RIVER_Y else -1)
    return (x, y)


def compile_place(spec, seed=0):
    """Fixed layout: [{'id','model','pos':[x,y,z],'height','yaw', ...}] plus lighting/haze for the shot."""
    t = spec['terrain']; seed = int(spec.get('seed', seed))
    out = {'terrain': t, 'time': spec['time'], 'weather': spec.get('weather', 'clear'), 'seed': seed, 'items': []}
    if t in KITS: return out
    wanted = [{'id': i, 'count': 1} for i in REGISTRY['terrains'][t]['base']] + list(spec.get('dressing', []))
    near_i = 0; k = 0
    for d in wanted:
        e = DRESSING[d['id']]
        for c in range(d.get('count', 1)):
            k += 1
            if e.get('water') and t == 'river_crossing':
                x, y = (-4 + 4 * c, RIVER_Y + 0.4) if d['id'] == 'boat' else (0.0, RIVER_Y)
                z = -0.45 if d['id'] == 'boat' else 0.0
            elif e.get('far'):
                x, y = _spot(t, k, seed, True); z = height(t, x, y, seed)
            else:
                if d['id'] in ('ox', 'ox_burning') and d.get('count', 1) > 1:   # a herd: rows behind the cast
                    x, y = -4 + (c % 4) * 2.6, 7.5 + (c // 4) * 2.8
                else:
                    x, y = NEAR[near_i % len(NEAR)]; near_i += 1
                z = height(t, x, y, seed)
            item = {'id': d['id'], 'model': e['model'], 'pos': [round(x, 3), round(y, 3), round(z, 3)], 'height': e['height'],
                    'yaw': round(_rand(seed, f'yaw{k}') * 360 - 180, 1)}
            if d['id'] in ('ox', 'ox_burning'): item['yaw'] = 0.0 if d.get('count', 1) > 1 else item['yaw']
            for f in ('horns', 'fire'):
                if e.get(f): item[f] = e[f]
            out['items'].append(item)
    return out


def validate_compiled(p):
    """Worker/renderer-side check of a compiled place carried in a shot (numbers and whitelisted models only)."""
    if not isinstance(p, dict) or set(p) - {'terrain', 'time', 'weather', 'seed', 'items'}: raise ValueError('invalid place')
    if p.get('terrain') not in TERRAINS | KITS or p.get('time') not in TIMES or p.get('weather') not in WEATHER: raise ValueError('invalid place')
    items = p.get('items', [])
    if not isinstance(items, list) or len(items) > 40: raise ValueError('up to 40 place items')
    for it in items:
        if set(it) - {'id', 'model', 'pos', 'height', 'yaw', 'horns', 'fire'} or it.get('id') not in DRESSING: raise ValueError('invalid place item')
        if it['model'] != DRESSING[it['id']]['model']: raise ValueError('place item model mismatch')
        if not (isinstance(it.get('pos'), list) and len(it['pos']) == 3 and all(isinstance(v, (int, float)) and abs(v) < 200 for v in it['pos'])): raise ValueError('place item pos')
        if not 0.1 <= it.get('height', 1) <= 20 or not -720 <= it.get('yaw', 0) <= 720: raise ValueError('place item size')
    return p
