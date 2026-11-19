"""Advanced place spec (manifest v3): a structured description of WHERE a line happens, compiled deterministically.

The Visual Director proposes, per scene, {terrain, time, weather, dressing:[{id,count}]} using only ids from
place-registry.json. validate() rejects anything else (no silent neutral or painted-card substitute);
compile_place() turns a valid spec into fixed numeric layout for render_shot.py. Pure Python, no Blender.
"""
import hashlib, json, math
from pathlib import Path
import library

HERE = Path(__file__).parent
REGISTRY = json.loads((HERE / 'place-registry.json').read_text())
TERRAINS = set(REGISTRY['terrains']) | {'custom'}; KITS = set(REGISTRY['kits'])
RECIPES = REGISTRY.get('recipes', {})
TIMES = REGISTRY['times']; WEATHER = REGISTRY['weather']; DRESSING = REGISTRY['dressing']
LIGHTING = {'dawn': 'sunset', 'day': 'day', 'dusk': 'sunset', 'night': 'night'}
CLEAR = 6.0          # metres around the world origin kept flat and free of dressing (cast zones sit up to ~3 m off origin)
MAX_ITEMS = 12; MAX_COUNT = 12
GROUNDS = ('grass', 'sand', 'snow', 'rock', 'dirt', 'stone', 'mud', 'ice', 'asphalt', 'metal')
RELIEFS = ('flat', 'hills', 'mountains', 'canyon', 'dunes', 'street')   # 'street': level ground, so the road and footpaths are never buried
WATERS = ('none', 'sea', 'lake', 'river')
LAYOUTS = ('near', 'far', 'row', 'cluster', 'line', 'table')
SHAPES = ('box', 'cylinder', 'sphere', 'cone', 'torus')
CUSTOM_BASE = {'grass': ['tree', 'rocks', 'bush'], 'sand': ['rocks', 'cactus'], 'snow': ['pine', 'rocks'], 'rock': ['tall_rock', 'rocks'], 'dirt': ['rocks', 'stump'],
               'stone': [], 'mud': ['fern', 'log'], 'ice': ['rocks'], 'asphalt': [], 'metal': []}


class PlaceError(ValueError):
    pass


def resolve(spec):
    """A scene recipe (town_street, road, garden, school, house, party, garage, sky) is a named, ready-made composition: it becomes its real terrain/kit
    plus its base set dressing, in front of whatever story objects the planner added. Idempotent; other places pass through unchanged."""
    r = RECIPES.get(spec.get('terrain')) if isinstance(spec, dict) else None
    if not r: return spec
    out = {k: v for k, v in spec.items() if k not in ('ground', 'relief', 'water')}
    out['terrain'] = r['terrain']
    for k in ('ground', 'relief', 'water'):
        if k in r: out[k] = r[k]
    for k in ('time', 'weather'):   # a cyberpunk alley is a night scene, a haunted house is foggy: the recipe decides
        if k in r: out[k] = r[k]
    if r.get('shell'): out['shell'] = r['shell']
    out['dressing'] = list(r['base']) + list(spec.get('dressing', []))
    return out


def entry_hash(i):
    return hashlib.sha256(json.dumps(DRESSING[i], sort_keys=True).encode()).hexdigest()[:16]


def audited():
    try: audit = json.loads((HERE / 'registry-audit.json').read_text())
    except FileNotFoundError: return set()
    return {i for i, r in audit.items() if i in DRESSING and r.get('pass') and r.get('hash') == entry_hash(i)}


def validate(spec, scene=None, era=None, _recipe=False):
    """Raise PlaceError with an owner-readable message when the place cannot be built."""
    where = f'Scene {scene + 1}' if scene is not None else 'This scene'
    if not isinstance(spec, dict): raise PlaceError(f'{where} has no place description')
    if spec.get('terrain') in RECIPES:
        if len(spec.get('dressing', [])) > MAX_ITEMS: raise PlaceError(f'{where}: up to {MAX_ITEMS} kinds of set dressing')
        validate(resolve(spec), scene, era, _recipe=True); return spec
    extra = set(spec) - {'terrain', 'time', 'weather', 'dressing', 'seed', 'ground', 'relief', 'water', 'shell'}
    if extra: raise PlaceError(f'{where}: unknown place fields {sorted(extra)}')
    if spec.get('shell') is not None and spec.get('terrain') not in KITS: raise PlaceError(f'{where}: a room shell needs an indoor set')
    if spec.get('shell') is not None: validate_shell(spec['shell'], where)
    t = spec.get('terrain')
    if t not in TERRAINS and t not in KITS: raise PlaceError(f"{where} needs the place '{t}', which the 3D engine cannot build yet")
    if t in KITS and era is not None:
        from world_pack import kit_fits_era
        if not kit_fits_era(t, era): raise PlaceError(f"{where}: the '{t}' set does not fit the story's year {era}")
    if t == 'custom':
        if spec.get('ground', 'grass') not in GROUNDS or spec.get('relief', 'hills') not in RELIEFS or spec.get('water', 'none') not in WATERS:
            raise PlaceError(f'{where}: custom places need ground {GROUNDS}, relief {RELIEFS} and water {WATERS}')
    elif any(k in spec for k in ('ground', 'relief', 'water')): raise PlaceError(f"{where}: ground/relief/water belong to the 'custom' place only")
    if spec.get('time') not in TIMES: raise PlaceError(f"{where}: time must be one of {TIMES}")
    if spec.get('weather', 'clear') not in WEATHER: raise PlaceError(f"{where}: weather must be one of {WEATHER}")
    if not isinstance(spec.get('seed', 0), int): raise PlaceError(f'{where}: bad seed')
    items = spec.get('dressing', [])
    if not isinstance(items, list) or len(items) > (40 if _recipe else MAX_ITEMS): raise PlaceError(f'{where}: up to {MAX_ITEMS} kinds of set dressing')
    ok = audited()
    for d in items:
        if not isinstance(d, dict): raise PlaceError(f'{where}: bad set dressing')
        c = d.get('count', 1)
        if not isinstance(c, int) or not 1 <= c <= MAX_COUNT: raise PlaceError(f'{where}: count 1-{MAX_COUNT}')
        if 'lib' in d:      # any model of the CC0 library, sized in real metres
            if set(d) - {'lib', 'count', 'height', 'layout', 'at', 'step', 'yaw'}: raise PlaceError(f'{where}: bad library dressing')
            if not library.known(d['lib']): raise PlaceError(f"{where} needs the model '{d['lib']}', which is not in the object library")
            _size_layout(d, where)
        elif 'asm' in d:    # something the library lacks, composed from simple shapes
            if set(d) - {'asm', 'count', 'height', 'layout', 'at', 'step', 'yaw'}: raise PlaceError(f'{where}: bad assembled dressing')
            _check_assembly(d['asm'], where); _size_layout(d, where)
        else:
            if set(d) - {'id', 'count'}: raise PlaceError(f'{where}: bad set dressing')
            if d.get('id') not in DRESSING: raise PlaceError(f"{where} needs '{d.get('id')}', which the 3D engine cannot draw yet")
            if d['id'] not in ok: raise PlaceError(f"{where} needs '{d['id']}', which has not passed its local render check")
            if DRESSING[d['id']].get('water') and t not in ('river_crossing', 'coast') and not (t == 'custom' and spec.get('water', 'none') != 'none'):
                raise PlaceError(f"{where}: '{d['id']}' needs water, but the place is {t}")
    return spec


SHELL_KEYS = {'floor', 'floor2', 'wall', 'wainscot', 'ceiling', 'light', 'accent', 'sky', 'window', 'window_x', 'energy'}


def validate_shell(sh, where='place'):
    if not isinstance(sh, dict) or set(sh) - SHELL_KEYS or not {'floor', 'wall', 'ceiling'} <= set(sh): raise PlaceError(f'{where}: bad room shell')
    for k in ('floor', 'floor2', 'wall', 'wainscot', 'ceiling', 'light', 'accent', 'sky'):
        if k in sh and not (isinstance(sh[k], list) and len(sh[k]) == 3 and all(isinstance(x, (int, float)) and not isinstance(x, bool) and 0 <= x <= 1 for x in sh[k])): raise PlaceError(f'{where}: shell {k} needs 3 numbers 0-1')
    if not isinstance(sh.get('window', False), bool): raise PlaceError(f'{where}: shell window is true or false')
    for k, lo, hi in (('window_x', -5, 5), ('energy', 0, 5000)):
        if k in sh and (isinstance(sh[k], bool) or not isinstance(sh[k], (int, float)) or not lo <= sh[k] <= hi): raise PlaceError(f'{where}: shell {k} out of range')


def _size_layout(d, where):
    h = d.get('height', 1.0)
    if isinstance(h, bool) or not isinstance(h, (int, float)) or not 0.02 <= h <= 60: raise PlaceError(f'{where}: height must be 0.02-60 metres')
    for key in ('at', 'step'):
        v = d.get(key)
        if v is not None and not (isinstance(v, list) and len(v) == 2 and all(isinstance(x, (int, float)) and not isinstance(x, bool) and abs(x) <= 150 for x in v)): raise PlaceError(f'{where}: {key} needs [x, y] metres')
    if d.get('yaw') is not None and (isinstance(d['yaw'], bool) or not isinstance(d['yaw'], (int, float)) or abs(d['yaw']) > 720): raise PlaceError(f'{where}: bad yaw')
    if d.get('layout', 'near') not in LAYOUTS: raise PlaceError(f'{where}: layout must be one of {LAYOUTS}')


def _check_assembly(a, where):
    if not isinstance(a, dict) or set(a) - {'name', 'parts'}: raise PlaceError(f'{where}: bad assembled object')
    parts = a.get('parts')
    if not isinstance(a.get('name'), str) or not 1 <= len(a['name']) <= 40 or not isinstance(parts, list) or not 1 <= len(parts) <= 16: raise PlaceError(f'{where}: an assembled object has 1-16 parts')
    for p in parts:
        if not isinstance(p, dict) or set(p) - {'shape', 'size', 'pos', 'color', 'glow', 'glass'} or p.get('shape') not in SHAPES: raise PlaceError(f'{where}: bad part')
        for key in ('size', 'pos', 'color'):
            v = p.get(key)
            if not (isinstance(v, list) and len(v) == 3 and all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in v)): raise PlaceError(f'{where}: part {key} needs 3 numbers')
        if any(not 0.01 <= x <= 20 for x in p['size']) or any(abs(x) > 20 for x in p['pos']) or any(not 0 <= x <= 1 for x in p['color']): raise PlaceError(f'{where}: part numbers out of range')
        if not isinstance(p.get('glow', 0), (int, float)) or not 0 <= p.get('glow', 0) <= 20: raise PlaceError(f'{where}: glow 0-20')
        if not isinstance(p.get('glass', False), bool): raise PlaceError(f'{where}: glass is true or false')


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
COAST_Y = 11.0       # the sea starts this far from the cast (the beach slopes down to it)


def height(terrain, x, y, seed=0, params=None):
    """Ground height in metres; flat (0) inside the cast area so feet, shadows and camera fits stay valid."""
    r = math.hypot(x, y); n = noise(x, y, seed, 7.0); big = noise(x, y, seed + 1, 22.0)
    if terrain == 'custom':
        p = params or {}; relief = p.get('relief', 'hills'); water = p.get('water', 'none')
        if r <= CLEAR - 0.5 or relief == 'street': return 0.0
        edge = ramp(r, CLEAR + 2, 8)
        base = {'flat': 0.25 * n, 'hills': 5 + 6 * big, 'mountains': 14 + 14 * big, 'canyon': 11 * abs(math.sin(x * 0.08 + big * 3)) + 2 * n, 'dunes': 1.6 + 1.6 * math.sin(x * 0.11 + big * 6) * math.cos(y * 0.09 + n * 3)}.get(relief, 0)
        far = {'flat': 20, 'hills': 18, 'mountains': 14, 'canyon': 12, 'dunes': 16}.get(relief, 18)
        h = ramp(r, far, 26) * base + edge * n * (0.3 if relief == 'flat' else 0.7)
        if water in ('sea', 'lake') and y > COAST_Y - 1: h = -1.4 * ramp(y, COAST_Y - 1.0, 4.0)
        if water == 'river':
            bank = abs(y - RIVER_Y)
            if bank < RIVER_HALF + 1.5: return -1.1 * (1 - ramp(bank, RIVER_HALF - 0.8, 2.3))
        return h
    if terrain == 'mountain_pass':
        side = abs(x)
        return ramp(side, 7, 18) * (22 + 18 * big) + ramp(r, CLEAR + 2, 6) * n * 0.6
    if terrain == 'valley':
        return ramp(r, 16, 30) * (10 + 10 * big) + ramp(r, CLEAR + 2, 8) * n * 0.8
    if terrain == 'river_crossing':
        bank = abs(y - RIVER_Y)
        if bank < RIVER_HALF + 1.5: return -1.1 * (1 - ramp(bank, RIVER_HALF - 0.8, 2.3)) if r > CLEAR - 0.5 else 0.0
        return ramp(r, 26, 30) * (8 + 8 * big) + ramp(r, CLEAR + 2, 8) * n * 0.5
    if terrain == 'snow_mountain':
        return ramp(abs(x), 8, 20) * (26 + 20 * big) + ramp(r, CLEAR + 2, 6) * n * 0.9
    if terrain == 'desert':
        dunes = math.sin(x * 0.11 + big * 6) * math.cos(y * 0.09 + n * 3)
        return ramp(r, CLEAR + 2, 14) * (1.6 + 1.6 * dunes) + ramp(r, 45, 35) * (7 + 6 * big)
    if terrain == 'jungle':
        return ramp(r, CLEAR + 2, 10) * (1.2 * n) + ramp(r, 38, 30) * (9 + 7 * big)
    if terrain == 'ancient_city':
        return ramp(r, 60, 30) * (9 + 7 * big)
    if terrain == 'coast':
        if r <= CLEAR - 0.5: return 0.0
        return -1.4 * ramp(y, COAST_Y - 1.0, 4.0) + ramp(r, 50, 30) * (3 + 3 * big) * (1 - ramp(y, 0, 6)) + ramp(r, CLEAR + 2, 8) * n * 0.25
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


def _open_xy(layout, c, count, k, seed, t, h):
    """Where copy c of an open-dressing item stands. near = ring just outside the cast, far = landmark ahead, row = line across the scene,
    cluster = bunch ahead of the cast, line = along the view axis (a street, a rail, a fence)."""
    r = lambda tag: _rand(seed, f'{tag}{k}:{c}')
    if layout == 'far' or h >= 12:
        sx = -1 if r('s') < 0.5 else 1
        return sx * (8 + 16 * r('fx')) * (0.5 if count > 1 and c % 2 else 1), 22 + 16 * r('fy') + 3 * c
    if layout == 'row': return (c - (count - 1) / 2) * max(1.6, h * 0.9) , 9.0 + 0.6 * r('ry')
    if layout == 'cluster':
        a = r('ca') * 2 * math.pi; d = 1.5 + 3.5 * r('cd'); return 1.5 * math.cos(a) * d, 10 + math.sin(a) * d * 0.8
    if layout == 'line': return (3.5 if c % 2 else -3.5) + 0.3 * r('lx'), 5 + c * max(2.5, h * 1.1)
    a = (c + r('na')) * 2 * math.pi / max(count, 1) + 0.6 * k; d = CLEAR + 1.2 + 4 * r('nd')
    x, y = math.cos(a) * d, math.sin(a) * d
    if t == 'river_crossing' and abs(y - RIVER_Y) < RIVER_HALF + 1.2: y = RIVER_Y + (RIVER_HALF + 2) * (1 if y > RIVER_Y else -1)
    return x, y


KIT_SPOTS = [(-2.4, 2.6), (2.4, 2.8), (-2.2, 4.6), (2.3, 4.8), (0.0, 6.0), (-3.2, 3.6), (3.2, 3.7), (-1.0, 2.0), (1.1, 2.2), (-3.0, 5.6), (3.0, 5.7), (0.0, 3.4)]


def _kit_xy(layout, c, count, k, seed, h):
    """Spots on the floor of an indoor kit (about 7 m wide): row = a line along the back, line = along the side walls, others = fixed floor spots."""
    if layout == 'row': return (c - (count - 1) / 2) * max(0.9, min(1.6, h * 0.8)), 5.6
    if layout == 'line': return (2.9 if c % 2 else -2.9), 2.2 + c * max(1.0, h * 0.9)
    i = (k * 3 + c) % len(KIT_SPOTS)
    return KIT_SPOTS[i]


def _at(d, c):
    """Exact spot of copy c when the recipe pins it ('at' plus 'step' per copy), else None."""
    a = d.get('at')
    if not a: return None
    s = d.get('step') or [0, 0]
    return a[0] + s[0] * c, a[1] + s[1] * c


def _place_open(out, d, t, seed, params, k0, H):
    """Library model or assembled shape object, any number of copies, in real-world metres."""
    for c in range(d.get('count', 1)):
        h = float(d.get('height', 1.0))
        x, y = _at(d, c) or _open_xy(d.get('layout', 'near'), c, d.get('count', 1), k0, seed, t, h)
        water = (params or {}).get('water', 'none') != 'none' or t in ('coast', 'river_crossing')
        z = H(x, y)
        if water and z < -0.2: z = -0.4          # standing in the water: boats and piers float, not sink
        item = {'pos': [round(x, 3), round(y, 3), round(z, 3)], 'height': round(h, 3), 'yaw': float(d['yaw']) if d.get('yaw') is not None else (round(_rand(seed, f'oy{k0}:{c}') * 50 - 25, 1) if 'asm' in d else round(_rand(seed, f'oy{k0}:{c}') * 360 - 180, 1))}
        if 'lib' in d: item.update({'id': 'lib:' + d['lib'], 'model': d['lib']})
        else: item.update({'id': 'asm:' + d['asm']['name'][:30], 'asm': d['asm']})
        out['items'].append(item)


def compile_place(spec, seed=0):
    spec = resolve(spec)
    """Fixed layout: [{'id','model','pos':[x,y,z],'height','yaw', ...}] plus lighting/haze for the shot."""
    t = spec['terrain']; seed = int(spec.get('seed', seed))
    out = {'terrain': t, 'time': spec['time'], 'weather': spec.get('weather', 'clear'), 'seed': seed, 'items': []}
    BENCH = {'name': 'lab bench', 'parts': [{'shape': 'box', 'size': [3.6, 1.0, .09], 'pos': [0, 0, .86], 'color': [.46, .31, .17], 'glow': 0}] + [
        {'shape': 'box', 'size': [.12, .12, .82], 'pos': [sx * 1.7, sy * .42, .41], 'color': [.36, .24, .13], 'glow': 0} for sx in (-1, 1) for sy in (-1, 1)]}
    if spec.get('shell'): out['shell'] = spec['shell']
    if t in KITS:   # an indoor set (lab/workshop, room, office...) can be furnished: library and assembled props stand on its floor
        # registry props (well, cart, barrel, tent...) are real library models too: a kit set used to drop them, which left every farm, street and
        # rail-yard shot empty. They now stand in the set like any library prop.
        reg = [{'lib': DRESSING[d['id']]['model'], 'count': min(int(d.get('count', 1)), 6), 'height': float(DRESSING[d['id']].get('height', 1.0)),
                'layout': 'far' if DRESSING[d['id']].get('far') else 'near', **({'at': [-5.5, 13.0]} if DRESSING[d['id']].get('far') else {})}
               for d in spec.get('dressing', []) if 'id' in d and isinstance(DRESSING.get(d['id']), dict) and DRESSING[d['id']].get('model') and library.known(DRESSING[d['id']]['model'])]
        dress = [d for d in spec.get('dressing', []) if 'lib' in d or 'asm' in d] + reg
        tabled = [d for d in dress if d.get('layout') == 'table']
        if tabled:   # one bench in front of the back wall, props evenly spaced on top
            total = sum(d.get('count', 1) for d in tabled)
            out['items'].append({'id': 'asm:lab bench', 'asm': BENCH, 'pos': [-0.4, 1.9, 0.0], 'height': 0.9, 'yaw': 180.0})
            slot = 0
            for d in tabled:
                for c in range(d.get('count', 1)):
                    x = -0.4 + (slot - (total - 1) / 2) * min(0.8, 3.0 / max(total, 1)); slot += 1
                    item = {'pos': [round(x, 3), 1.9, 0.9], 'height': round(float(d.get('height', .4)), 3), 'yaw': 180.0}
                    if 'lib' in d: item.update({'id': 'lib:' + d['lib'], 'model': d['lib']})
                    else: item.update({'id': 'asm:' + d['asm']['name'][:30], 'asm': d['asm']})
                    out['items'].append(item)
        for k, d in enumerate([d for d in dress if d.get('layout') != 'table']):
            for c in range(d.get('count', 1)):
                h = float(d.get('height', 1.0)); x, y = _at(d, c) or _kit_xy(d.get('layout', 'near'), c, d.get('count', 1), k, seed, h)
                item = {'pos': [round(x, 3), round(y, 3), 0.0], 'height': round(h, 3), 'yaw': float(d['yaw']) if d.get('yaw') is not None else round(_rand(seed, f'ky{k}:{c}') * 70 - 35 + 180, 1)}
                if 'lib' in d: item.update({'id': 'lib:' + d['lib'], 'model': d['lib']})
                else: item.update({'id': 'asm:' + d['asm']['name'][:30], 'asm': d['asm']})
                out['items'].append(item)
        return out
    params = None
    if t == 'custom':
        params = {'ground': spec.get('ground', 'grass'), 'relief': spec.get('relief', 'hills'), 'water': spec.get('water', 'none')}; out['params'] = params
        base = CUSTOM_BASE.get(params['ground'], [])
    else: base = REGISTRY['terrains'][t]['base']
    H = lambda x, y: height(t, x, y, seed, params)
    wanted = [{'id': i, 'count': 1} for i in base if i in DRESSING] + list(spec.get('dressing', []))
    near_i = 0; k = 0
    for d in wanted:
        if 'lib' in d or 'asm' in d:
            _place_open(out, d, t, seed, params, k, H); k += d.get('count', 1); continue
        e = DRESSING[d['id']]
        for c in range(d.get('count', 1)):
            k += 1
            if e.get('water') and t == 'coast':
                x, y = {'ship': (-9 + 9 * c, COAST_Y + 9), 'dock': (4.5, COAST_Y + 0.8), 'boat': (-3 + 4 * c, COAST_Y + 4)}.get(d['id'], (0.0, COAST_Y + 3))
                z = -0.5 if d['id'] != 'dock' else -0.35
            elif e.get('water') and t == 'river_crossing':
                x, y = (-4 + 4 * c, RIVER_Y + 0.4) if d['id'] == 'boat' else (0.0, RIVER_Y)
                z = -0.45 if d['id'] == 'boat' else 0.0
            elif e.get('far'):
                x, y = _spot(t, k, seed, True)
                if e['height'] >= 8 and t != 'mountain_pass':   # landmarks (pyramid, tower) stand well ahead of the cast, never beside or behind the lens
                    sx = -1 if _rand(seed, f'lx{k}') < 0.5 else 1
                    x, y = sx * (9 + 13 * _rand(seed, f'lm{k}')), 24 + 14 * _rand(seed, f'ly{k}')
                z = H(x, y)
            else:
                if (e.get('horns') or e.get('animate')) and d.get('count', 1) > 1:   # a herd or cavalry: rows behind the cast
                    x, y = -4 + (c % 4) * 2.6, 7.5 + (c // 4) * 2.8
                else:
                    x, y = NEAR[near_i % len(NEAR)]; near_i += 1
                z = H(x, y)
            item = {'id': d['id'], 'model': e['model'], 'pos': [round(x, 3), round(y, 3), round(z, 3)], 'height': e['height'],
                    'yaw': round(_rand(seed, f'yaw{k}') * 360 - 180, 1)}
            if e.get('horns') or e.get('animate'): item['yaw'] = 0.0 if d.get('count', 1) > 1 else item['yaw']
            for f in ('horns', 'fire', 'animate'):
                if e.get(f): item[f] = e[f]
            out['items'].append(item)
    return out


def validate_compiled(p):
    """Worker/renderer-side check of a compiled place carried in a shot (numbers and whitelisted models only)."""
    if not isinstance(p, dict) or set(p) - {'terrain', 'time', 'weather', 'seed', 'items', 'params', 'shell', 'streetscape', 'townhouses', 'street_trees', 'high_street'}: raise ValueError('invalid place')
    if p.get('terrain') not in TERRAINS | KITS or p.get('time') not in TIMES or p.get('weather') not in WEATHER: raise ValueError('invalid place')
    items = p.get('items', [])
    if not isinstance(items, list) or len(items) > 90: raise ValueError('up to 90 place items')
    for it in items:
        if set(it) - {'id', 'model', 'pos', 'height', 'yaw', 'horns', 'fire', 'animate', 'asm'}: raise ValueError('invalid place item')
        iid = it.get('id')
        if isinstance(iid, str) and iid.startswith('lib:'):
            if it.get('model') != iid[4:] or not library.known(it['model']): raise ValueError('unknown library model in place')
        elif isinstance(iid, str) and iid.startswith('asm:'):
            try: _check_assembly(it.get('asm'), 'place')
            except PlaceError as e: raise ValueError(str(e))
        elif iid in DRESSING:
            if it['model'] != DRESSING[iid]['model']: raise ValueError('place item model mismatch')
        else: raise ValueError('invalid place item')
        if not (isinstance(it.get('pos'), list) and len(it['pos']) == 3 and all(isinstance(v, (int, float)) and abs(v) < 200 for v in it['pos'])): raise ValueError('place item pos')
        if not 0.02 <= it.get('height', 1) <= 60 or not -720 <= it.get('yaw', 0) <= 720: raise ValueError('place item size')
    if p.get('shell') is not None:
        try: validate_shell(p['shell'])
        except PlaceError as e: raise ValueError(str(e))
    pr = p.get('params')
    if pr is not None and (not isinstance(pr, dict) or pr.get('ground') not in GROUNDS or pr.get('relief') not in RELIEFS or pr.get('water') not in WATERS): raise ValueError('invalid place params')
    return p


def smooth_story_time(manifest, min_run=3):
    """Time of day is a story constant, not a per-shot coin flip. Only a FLICKER is removed: a run of fewer than `min_run` shots that is
    sandwiched between two runs of the SAME time (day, night, day). A real transition (night -> dawn, or an ending run) is kept.
    Idempotent; mutates the manifest's place specs and returns the list of changes for the log."""
    shots = [s for s in manifest.get('shots', []) if isinstance(s.get('place'), dict)]
    times = [s['place']['time'] for s in shots]

    def runs_of(ts):
        out = []
        for i, x in enumerate(ts):
            if out and out[-1][0] == x: out[-1][2] += 1
            else: out.append([x, i, 1])
        return out

    changed = True
    while changed and len(times) > 2:
        changed = False; runs = runs_of(times)
        for k in range(1, len(runs) - 1):
            x, start, n = runs[k]
            if n < min_run and runs[k - 1][0] == runs[k + 1][0] and runs[k - 1][0] != x:
                for j in range(start, start + n): times[j] = runs[k - 1][0]
                changed = True; break
    log = []
    for s, t in zip(shots, times):
        if s['place']['time'] != t:
            log.append({'from': s['place']['time'], 'to': t}); s['place'] = {**s['place'], 'time': t}
    return log
