"""Step 8: frame-exact sound cues derived from a compiled shot, never from AI text.

Each cue time is the instant the picture's own motion rules put the event on screen
(effects.py, object_motion.py, character_motion.py), so sound and picture share one clock.
"""
import math
from effects import particles, state

# sound id -> (library file, loop?) ; files are pinned in assets/sound/library-pins.json
SOUNDS = {'explosion': 'explosion', 'rumble': 'rumble', 'debris': 'debris', 'sparks': 'sparks', 'fire': 'fire', 'crowd': 'crowd',
          'whoosh': 'whoosh', 'gunshot': 'gunshot', 'pickaxe': 'pickaxe', 'clank': 'clank', 'creak': 'creak', 'coins': 'coins',
          'footstep': 'footstep', 'impact': 'impact', 'stone': 'stone', 'handling': 'handling'}
LOOPS = {'fire', 'crowd'}
TIMES = {  # object (kind, action) -> list of (seconds, sound) taken from object_motion / story_objects timing
    ('gold_shotgun', 'fire'): [(.4, 'gunshot')], ('gold_shotgun', 'load'): [(.25, 'handling'), (.75, 'handling')],
    ('dynamite', 'explode'): [(.65, 'explosion'), (.65, 'rumble')], ('gold_vein', 'explode'): [(.65, 'explosion'), (.65, 'rumble')],
    ('dynamite', 'fire'): [(0.0, 'sparks')],
    ('rail_joint', 'break'): [(.5, 'clank'), (.95, 'impact')], ('rail_joint', 'expand'): [(.1, 'creak')], ('rail_joint', 'buckle'): [(.2, 'creak')],
    ('gold_pan', 'pour'): [(.45, 'stone')], ('money_bag', 'hold'): [(0.0, 'coins')], ('rocket_arrow', 'fire'): [(0.0, 'whoosh')],
    ('fuse_bundle', 'fire'): [(0.0, 'sparks')], ('covered_cart', 'open'): [(0.0, 'creak')],
}


def _debris_landings(e, fps):
    """First frames at which explosion debris touches the ground, clustered into at most 3 cues."""
    lands = []
    for p in particles('explosion', e.get('seed', 0)):
        if p['role'] != 'debris': continue
        for f in range(1, 400):
            if state('explosion', p, f / fps, e.get('scale', 1))[2] == 0.0: lands.append(f / fps); break
    lands.sort(); out = []
    for t in lands:
        if not out or t - out[-1] > .18: out.append(t)
    return out[:3]


def footfalls(action, duration):
    """Foot-down instants for walk/run, matching character_motion.pose stance phases."""
    if action not in ('walk', 'run'): return []
    period = 1 / 1.2 if action == 'walk' else 1 / 2.8; out = []
    for k in range(0, int(duration / period) + 2):
        for off in (0, .5):
            t = (k + off) * period
            if 0 <= t < duration: out.append(round(t, 4))
    return sorted(out)


def swing_hits(duration):
    """Pickaxe contact at each grip peak: sin(t*tau*0.8) == 1."""
    return [t for k in range(10) if (t := (.25 + k) / .8) < duration]


def cues(shot):
    fps = shot.get('fps', 30); d = shot['duration']; out = []
    def add(t, sound, pos=None, gain=1.0, length=None):
        if 0 <= t < d: out.append({'t': round(round(t * fps) / fps, 5), 'sound': sound, 'pos': pos, 'gain': gain, **({'length': length} if length else {})})
    for e in shot.get('effects', []):
        st, pos = e.get('start', 0), e['pos']
        if e['kind'] == 'explosion':
            add(st, 'explosion', pos, 1.0); add(st, 'rumble', pos, .8)
            for t in _debris_landings(e, fps): add(st + t, 'debris', pos, .5)
        if e['kind'] == 'sparks': add(st, 'sparks', pos, .5)
        if e['kind'] == 'fire': add(st, 'fire', pos, 1.2, d - st)
    if shot.get('crowd'): add(0, 'crowd', [*shot['crowd']['center'], 1], .9 if shot['crowd'].get('action') == 'cheer' else .4, d)
    if 'whip_from' in shot['camera']: add(0, 'whoosh', None, 1.0)
    for o in shot.get('objects', []):
        for t, s in TIMES.get((o['kind'], o.get('action', 'hold')), []): add(t, s, o['pos'])
    for c in shot.get('cast', []):
        a = c.get('action', 'stand'); p = [*c['pos'], 0]
        for t in footfalls(a, d): add(t, 'footstep', p, .8)
        if a == 'swing': [add(t, 'pickaxe', p, 1.2) for t in swing_hits(d)]
        if a == 'fall': add(1.0, 'impact', p, .9)
    # one blast sound per visible blast: a scripted explosion effect within 0.3 s absorbs the object's own burst
    keep = []
    for c in sorted(out, key=lambda c: (c['t'], c['sound'])):
        if c['sound'] in ('explosion', 'rumble') and any(k['sound'] == c['sound'] and abs(k['t'] - c['t']) < .3 for k in keep): continue
        keep.append(c)
    return keep


def spatial(cue, cam_from, look_at):
    """Distance gain (inverse, clamped) and constant-power stereo pan from screen side."""
    if not cue['pos']: return 1.0, 0.0
    p = cue['pos']; dx, dy, dz = (p[i] - cam_from[i] for i in range(3))
    dist = max(1.0, math.sqrt(dx * dx + dy * dy + dz * dz))
    fx, fy = look_at[0] - cam_from[0], look_at[1] - cam_from[1]; n = math.hypot(fx, fy) or 1
    side = (dx * fy - dy * fx) / n / dist  # >0 right of view direction
    return max(.45, min(1.0, 3.0 / dist)), max  # floor: a visible action must stay audible (step-8 listening review)
    return None, max(-1.0, min(1.0, side * 1.5))
