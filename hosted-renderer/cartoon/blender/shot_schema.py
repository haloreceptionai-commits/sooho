"""Strict validator for one declarative Blender shot. No free code is ever accepted."""
SETS = {'mine_tunnel', 'open_day'}
GRADES = {'Medium High Contrast', 'High Contrast', 'Base Contrast', 'Punchy'}
KEYS = {'set', 'duration', 'camera', 'cast', 'haze', 'grade', 'samples', 'size', 'fps', 'frames', 'engine', 'haze_color'}


def _vec(v, n, name, limit=1000):
    if not (isinstance(v, (list, tuple)) and len(v) == n and all(isinstance(x, (int, float)) and not isinstance(x, bool) and abs(x) <= limit for x in v)):
        raise ValueError(f'{name} must be {n} numbers')


def validate_shot(s):
    if not isinstance(s, dict): raise ValueError('shot must be an object')
    extra = set(s) - KEYS
    if extra: raise ValueError(f'unknown shot keys {sorted(extra)}')
    if s.get('set') not in SETS: raise ValueError(f'unknown set {s.get("set")!r}')
    d = s.get('duration')
    if not isinstance(d, (int, float)) or not 0.2 <= d <= 12: raise ValueError('duration 0.2-12s')
    c = s.get('camera')
    if not isinstance(c, dict): raise ValueError('camera required')
    if set(c) - {'from', 'to', 'look_at', 'lens', 'fstop'}: raise ValueError('unknown camera keys')
    _vec(c.get('from'), 3, 'camera.from'); _vec(c.get('look_at'), 3, 'camera.look_at')
    if 'to' in c: _vec(c['to'], 3, 'camera.to')
    if not 12 <= c.get('lens', 35) <= 200: raise ValueError('lens 12-200mm')
    if not 0.8 <= c.get('fstop', 2.8) <= 32: raise ValueError('fstop 0.8-32')
    cast = s.get('cast', [])
    if not isinstance(cast, list) or len(cast) > 12: raise ValueError('cast must be a list of up to 12')
    for ch in cast:
        if set(ch) - {'pos', 'yaw', 'scale', 'shirt', 'hat', 'hat_color'}: raise ValueError('unknown cast keys')
        _vec(ch.get('pos'), 2, 'cast.pos')
        for k in ('shirt', 'hat_color'):
            if k in ch: _vec(ch[k], 3, k); assert all(0 <= x <= 1 for x in ch[k]), k
        if ch.get('hat', 'beanie') not in ('beanie', 'none'): raise ValueError('hat beanie|none')
    if not 0 <= s.get('haze', 0) <= 0.2: raise ValueError('haze 0-0.2')
    if s.get('grade', 'Medium High Contrast') not in GRADES: raise ValueError('unknown grade')
    if not 1 <= s.get('samples', 32) <= 256: raise ValueError('samples 1-256')
    if 'size' in s: _vec(s['size'], 2, 'size', 4096); assert all(64 <= x <= 2160 for x in s['size']), 'size'
    if s.get('fps', 30) not in (24, 25, 30): raise ValueError('fps 24|25|30')
    if 'frames' in s and not (isinstance(s['frames'], list) and all(isinstance(f, int) and f >= 1 for f in s['frames'])):
        raise ValueError('frames must be positive ints')
    if 'haze_color' in s: _vec(s['haze_color'], 3, 'haze_color', 1)
    if s.get('engine', 'eevee') not in ('eevee', 'cycles'): raise ValueError('engine eevee|cycles')
    return s
