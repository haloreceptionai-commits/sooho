"""Strict validator for one declarative Blender shot. No free code is ever accepted."""
import json, re
from pathlib import Path
from character_motion import ACTIONS, EXPRESSIONS, OUTFITS, HATS
from object_specs import validate_object
from effects import KINDS as EFFECT_KINDS

SETS = set(json.loads((Path(__file__).parent / 'set-kits.json').read_text())) | {'open_day', 'neutral'}
HOLD_PROPS = {'pan','spatula','knife','food','cup','pen','paper','book','phone','camera','magnifier','cash','hammer','shovel','broom','brush','rod','ball','guitar','crate'}
def _known_model(i):
    import library
    return library.known(i)


PROP_IDS = set(json.loads((Path(__file__).parent / 'asset-spec.json').read_text())['models'])
GRADES = {'Medium High Contrast', 'High Contrast', 'Base Contrast', 'Punchy'}
KEYS = {'rigs', 'set', 'duration', 'camera', 'cast', 'objects', 'haze', 'grade', 'samples', 'size', 'fps', 'frames', 'engine', 'haze_color', 'lighting', 'effects', 'crowd', 'cards', 'props', 'composition', 'backdrop', 'place', 'tint', 'label', 'overlay', 'era'}


def _vec(v, n, name, limit=1000):
    if not (isinstance(v, (list, tuple)) and len(v) == n and all(isinstance(x, (int, float)) and not isinstance(x, bool) and abs(x) <= limit for x in v)):
        raise ValueError(f'{name} must be {n} numbers')


def validate_shot(s):
    if not isinstance(s, dict): raise ValueError('shot must be an object')
    extra = set(s) - KEYS
    if extra: raise ValueError(f'unknown shot keys {sorted(extra)}')
    if 'composition' in s:
        r = s['composition']
        if not isinstance(r, dict) or set(r) != {'face_max', 'wave_min', 'emotion'}: raise ValueError('invalid composition rules')
        if r['face_max'] != .4 or r['wave_min'] not in (0, .25) or not isinstance(r['emotion'], bool): raise ValueError('invalid composition limits')
    bd = s.get('backdrop', [])
    if not isinstance(bd, list) or len(bd) > 2: raise ValueError('up to 2 backdrop layers')
    for b in bd:
        if not isinstance(b, dict) or set(b) != {'image', 'layer'} or b['layer'] not in ('far', 'mid') or not re.fullmatch(r'bg-[a-z0-9_]{1,20}-(far|mid)\.png', str(b['image'])) or not str(b['image']).endswith(f"-{b['layer']}.png"):
            raise ValueError('invalid backdrop layer')
    if 'era' in s and not (isinstance(s['era'], int) and not isinstance(s['era'], bool) and -6000 <= s['era'] < 1900): raise ValueError('era is a whole year before 1900')
    if 'tint' in s:
        t = s['tint']
        if not (isinstance(t, list) and len(t) == 3 and all(isinstance(v, (int, float)) and 0.3 <= v <= 1.6 for v in t)): raise ValueError('tint needs three numbers 0.3-1.6')
    if 'label' in s:
        lb = s['label']
        if not isinstance(lb, dict) or set(lb) - {'text', 'pos', 'yaw', 'scale'} or not re.fullmatch(r"[A-Z0-9 ,.'&-]{1,24}", str(lb.get('text', ''))): raise ValueError('invalid label')
        _vec(lb.get('pos'), 2, 'label.pos', 200)
    if 'place' in s:
        from place_spec import validate_compiled
        validate_compiled(s['place'])
        if s.get('backdrop'): raise ValueError('a 3D place never carries painted backdrops')
    if s.get('set') not in SETS: raise ValueError(f'unknown set {s.get("set")!r}')
    if s.get('lighting', 'day') not in {'day', 'sunset', 'night', 'rain'}: raise ValueError('lighting day|sunset|night|rain')
    d = s.get('duration')
    if not isinstance(d, (int, float)) or not 0.2 <= d <= 12: raise ValueError('duration 0.2-12s')
    c = s.get('camera')
    if not isinstance(c, dict): raise ValueError('camera required')
    if set(c) - {'from', 'to', 'look_at', 'look_to', 'lens', 'fstop', 'whip_from', 'shake'}: raise ValueError('unknown camera keys')
    _vec(c.get('from'), 3, 'camera.from'); _vec(c.get('look_at'), 3, 'camera.look_at')
    if 'to' in c: _vec(c['to'], 3, 'camera.to')
    if 'whip_from' in c: _vec(c['whip_from'], 3, 'camera.whip_from')
    if 'look_to' in c: _vec(c['look_to'], 3, 'camera.look_to')
    sh = c.get('shake', [])
    if not isinstance(sh, list) or len(sh) > 6: raise ValueError('up to 6 shake hits')
    for h in sh:
        if set(h) - {'t', 'amp'} or not 0 <= h.get('t', -1) <= d or not 0 < h.get('amp', .04) <= .08: raise ValueError('shake hit {t within shot, amp<=0.08}')
    ov = s.get('overlay', [])
    if not isinstance(ov, list) or len(ov) > 4 or any(x not in ('speed_lines', 'flash', 'light_leak', 'glitch', 'grain') for x in ov): raise ValueError('overlay: up to 4 of speed_lines flash light_leak glitch grain')
    fx = s.get('effects', [])
    if not isinstance(fx, list) or len(fx) > 6: raise ValueError('up to 6 effects')
    for e in fx:
        if set(e) - {'kind', 'pos', 'start', 'scale', 'seed'} or e.get('kind') not in EFFECT_KINDS: raise ValueError('unknown effect')
        _vec(e.get('pos'), 3, 'effect.pos')
        if not 0 <= e.get('start', 0) <= d or not .2 <= e.get('scale', 1) <= 4: raise ValueError('effect start within shot, scale 0.2-4')
    cr = s.get('crowd')
    if cr is not None:
        if set(cr) - {'count', 'center', 'size', 'action', 'yaw', 'seed', 'kind'}: raise ValueError('unknown crowd keys')
        if cr.get('kind', 'civil') not in ('civil', 'army'): raise ValueError('crowd kind civil|army')
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
        if set(ch) - {'pos', 'yaw', 'scale', 'shirt', 'hat', 'hat_color','id','expression','outfit','action','held','model','skin','facial','trim','style','pants','hair','eyes','species','glasses','seat','holds','to'}: raise ValueError('unknown cast keys')
        if 'model' in ch:
            from human_clips import MODELS, clips_for
            if ch['model'] not in MODELS: raise ValueError('unknown human model')
            if ch['model'] != 'ual-mannequin' and ch.get('action', 'stand') not in clips_for(ch['model']) or ch.get('held'): raise ValueError('uploaded human action/attachment not verified')   # the library maps every action (unmapped -> idle)
        _vec(ch.get('pos'), 2, 'cast.pos')
        for k in ('shirt', 'hat_color'):
            if k in ch: _vec(ch[k], 3, k); assert all(0 <= x <= 1 for x in ch[k]), k
        if ch.get('hat', 'beanie') not in HATS: raise ValueError('unknown hat')
        if ch.get('action','stand') not in ACTIONS:raise ValueError('unknown action')
        if ch.get('expression','neutral') not in EXPRESSIONS:raise ValueError('unknown expression')
        if ch.get('outfit','worker') not in OUTFITS:raise ValueError('unknown outfit')
        if ch.get('species','human') not in ('human','alien','monster','ghost'):raise ValueError('unknown species')
        if ch.get('held') not in (None,'crate','tool','cup','rifle'):raise ValueError('unknown held prop')
        if ch.get('seat') is not None and not .3<=ch['seat']<=.8:raise ValueError('seat height .3-.8')
        if ch.get('to') is not None:_vec(ch['to'],2,'cast.to',200)
        for h in ch.get('holds',[]):
            if not isinstance(h,dict) or set(h)-{'prop','hand'} or h.get('prop') not in HOLD_PROPS or h.get('hand') not in ('left','right','both'):raise ValueError('unknown hold')
    cards = s.get('cards', [])
    if not isinstance(cards, list) or len(cards) > 6: raise ValueError('up to 6 painted cards')
    for cd in cards:
        if not isinstance(cd, dict) or set(cd) - {'image', 'pos', 'height', 'to', 'hop'}: raise ValueError('unknown card keys')
        if 'to' in cd: _vec(cd['to'], 2, 'card.to')
        if not 0 <= cd.get('hop', 0) <= 0.5: raise ValueError('card hop 0-0.5')
        if not isinstance(cd.get('image'), str) or not re.fullmatch(r'[a-z0-9_-]{1,40}\.png', cd['image']): raise ValueError('card image must be a plain png name')
        _vec(cd.get('pos'), 2, 'card.pos')
        if not 0.3 <= cd.get('height', 1.6) <= 8: raise ValueError('card height 0.3-8')
    rigs = s.get('rigs', [])
    if not isinstance(rigs, list) or len(rigs) > 4: raise ValueError('up to 4 rigs')
    for r in rigs:
        if not isinstance(r, dict) or set(r) - {'kind', 'pos', 'yaw', 'to', 'color'} or r.get('kind') not in ('car', 'bike', 'ladder'): raise ValueError('unknown rig')
        _vec(r.get('pos'), 2, 'rig.pos', 200)
        if 'to' in r: _vec(r['to'], 2, 'rig.to', 200)
        if 'color' in r: _vec(r['color'], 3, 'rig.color', 1)
    props = s.get('props', [])
    if not isinstance(props, list) or len(props) > 8: raise ValueError('up to 8 props')
    for p in props:
        if not isinstance(p, dict) or set(p) - {'id', 'pos', 'height', 'yaw'}: raise ValueError('unknown prop keys')
        if p.get('id') not in PROP_IDS and not _known_model(p.get('id')): raise ValueError(f'prop {p.get("id")!r} is not a whitelisted offline model')
        _vec(p.get('pos'), 2, 'prop.pos')
        if not 0.1 <= p.get('height', 1) <= 12: raise ValueError('prop height 0.1-12')
        if not -720 <= p.get('yaw', 0) <= 720: raise ValueError('prop yaw')
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
