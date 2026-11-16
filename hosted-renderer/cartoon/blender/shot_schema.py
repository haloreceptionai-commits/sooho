"""Strict validator for one declarative Blender shot. No free code is ever accepted."""
import json, re
from pathlib import Path
from character_motion import ACTIONS, EXPRESSIONS, OUTFITS, HATS
from object_specs import validate_object
from effects import KINDS as EFFECT_KINDS

SETS = set(json.loads((Path(__file__).parent / 'set-kits.json').read_text())) | {'open_day'}
GRADES = {'Medium High Contrast', 'High Contrast', 'Base Contrast', 'Punchy'}
KEYS = {'set', 'duration', 'camera', 'cast', 'objects', 'haze', 'grade', 'samples', 'size', 'fps', 'frames', 'engine', 'haze_color', 'lighting', 'effects', 'crowd', 'cards'}


def _vec(v, n, name, limit=1000):
    if not (isinstance(v, (list, tuple)) and len(v) == n and all(isinstance(x, (int, float)) and not isinstance(x, bool) and abs(x) <= limit for x in v)):
        raise ValueError(f'{name} must be {n} numbers')


def validate_shot(s):
    if not isinstance(s, dict): raise ValueError('shot must be an object')
    extra = set(s) - KEYS
    if extra: raise ValueError(f'unknown shot keys {sorted(extra)}')
    if s.get('set') not in SETS: raise ValueError(f'unknown set {s.get("set")!r}')
    if s.get('lighting', 'day') not in {'day', 'sunset', 'night', 'rain'}: raise ValueError('lighting day|sunset|night|rain')
    d = s.get('duration')
    if not isinstance(d, (int, float)) or not 0.2 <= d <= 12: raise ValueError('duration 0.2-12s')
    c = s.get('camera')
    if not isinstance(c, dict): raise ValueError('camera required')
    if set(c) - {'from', 'to', 'look_at', 'lens', 'fstop', 'whip_from', 'shake'}: raise ValueError('unknown camera keys')
    _vec(c.get('from'), 3, 'camera.from'); _vec(c.get('look_at'), 3, 'camera.look_at')
    if 'to' in c: _vec(c['to'], 3, 'camera.to')
    if 'whip_from' in c: _vec(c['whip_from'], 3, 'camera.whip_from')
    sh = c.get('shake', [])
    if not isinstance(sh, list) or len(sh) > 6: raise ValueError('up to 6 shake hits')
    for h in sh:
        if set(h) - {'t', 'amp'} or not 0 <= h.get('t', -1) <= d or not 0 < h.get('amp', .04) <= .08: raise ValueError('shake hit {t within shot, amp<=0.08}')
    fx = s.get('effects', [])
    if not isinstance(fx, list) or len(fx) > 6: raise ValueError('up to 6 effects')
    for e in fx:
        if set(e) - {'kind', 'pos', 'start', 'scale', 'seed'} or e.get('kind') not in EFFECT_KINDS: raise ValueError('unknown effect')
        _vec(e.get('pos'), 3, 'effect.pos')
        if not 0 <= e.get('start', 0) <= d or not .2 <= e.get('scale', 1) <= 4: raise ValueError('effect start within shot, scale 0.2-4')
    cr = s.get('crowd')
    if cr is not None:
        if set(cr) - {'count', 'center', 'size', 'action', 'yaw', 'seed'}: raise ValueError('unknown crowd keys')
        if not isinstance(cr.get('count'), int) or not 1 <= cr['count'] <= 400: raise ValueError('crowd 1-400')
        _vec(cr.get('center'), 2, 'crowd.center'); _vec(cr.get('size'), 2, 'crowd.size', 60)
        if cr.get('action', 'stand') not in ('stand', 'cheer', 'run'): raise ValueError('crowd action stand|cheer|run')
    if not 12 <= c.get('lens', 35) <= 200: raise ValueError('lens 12-200mm')
    if not 0.8 <= c.get('fstop', 2.8) <= 32: raise ValueError('fstop 0.8-32')
    objects=s.get('objects',[])
    if not isinstance(objects,list) or len(objects)>12:raise ValueError('up to 12 story objects')
    for obj in objects:validate_object(obj)
    cast = s.get('cast', [])
    if not isinstance(cast, list) or len(cast) > 12: raise ValueError('cast must be a list of up to 12')
    for ch in cast:
        if set(ch) - {'pos', 'yaw', 'scale', 'shirt', 'hat', 'hat_color','id','expression','outfit','action','held'}: raise ValueError('unknown cast keys')
        _vec(ch.get('pos'), 2, 'cast.pos')
        for k in ('shirt', 'hat_color'):
            if k in ch: _vec(ch[k], 3, k); assert all(0 <= x <= 1 for x in ch[k]), k
        if ch.get('hat', 'beanie') not in HATS: raise ValueError('unknown hat')
        if ch.get('action','stand') not in ACTIONS:raise ValueError('unknown action')
        if ch.get('expression','neutral') not in EXPRESSIONS:raise ValueError('unknown expression')
        if ch.get('outfit','worker') not in OUTFITS:raise ValueError('unknown outfit')
        if ch.get('held') not in (None,'crate','tool','cup'):raise ValueError('unknown held prop')
    cards = s.get('cards', [])
    if not isinstance(cards, list) or len(cards) > 6: raise ValueError('up to 6 painted cards')
    for cd in cards:
        if not isinstance(cd, dict) or set(cd) - {'image', 'pos', 'height'}: raise ValueError('unknown card keys')
        if not isinstance(cd.get('image'), str) or not re.fullmatch(r'[a-z0-9_-]{1,40}\.png', cd['image']): raise ValueError('card image must be a plain png name')
        _vec(cd.get('pos'), 2, 'card.pos')
        if not 0.3 <= cd.get('height', 1.6) <= 4: raise ValueError('card height 0.3-4')
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
