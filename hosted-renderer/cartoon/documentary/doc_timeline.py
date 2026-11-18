"""Turns a documentary plan (beats named by words) plus measured speech timings into an exact timeline on the narration clock.

The plan never contains seconds: a beat starts when its first word is spoken. That keeps every card (a number, a date, a place) on the
word it illustrates, whatever voice or speed produced the narration. Planned pauses are spliced into the narration at word boundaries and
every later time moves with them.
"""
import bisect
import math

from doc_cards import KINDS, OVERLAYS
from doc_camera import MOVES

FPS = 30
TAKE_GAP = .18          # breath between two recorded takes
TAIL = .6               # picture held after the last word
LEAD = .07              # a cut lands just before its word, the way an editor places it
MIN_BEAT = {'image': .8, 'card': 1.7}
CARD_MIN = {'timeline': 2.6, 'location': 3.2, 'compare': 2.6, 'steps': 3.0, 'document': 2.6, 'chapter': 2.0, 'title': 2.4}
TRANSITIONS = ('cut', 'cross', 'dip', 'whip', 'flash')
MOODS = ('neutral', 'tension', 'reveal', 'warm', 'cold', 'dark')
MUSIC = ('lofi', 'epic', 'suspense', 'sad')
SFX = ('none', 'hit', 'riser', 'whoosh', 'sting')


def validate_manifest(m):
    """Raises ValueError with a plain message if the plan could not be drawn. Unknown extras are ignored, never executed."""
    if m.get('kind') != 'documentary' or m.get('version') != 1:
        raise ValueError('Not a documentary manifest v1')
    scenes, images = m.get('scenes'), m.get('images')
    if not isinstance(scenes, list) or not scenes or len(scenes) > 3000:
        raise ValueError('Documentary needs scenes')
    if not isinstance(images, list) or not images:
        raise ValueError('Documentary needs images')
    for sc in scenes:
        if not str(sc.get('text', '')).split():
            raise ValueError('A scene has no narration')
    beats = m.get('beats')
    if not isinstance(beats, list) or not beats or len(beats) > 6000:
        raise ValueError('Documentary needs beats')
    for b in beats:
        si = b.get('scene')
        if not isinstance(si, int) or not 0 <= si < len(scenes):
            raise ValueError('A beat points at a missing scene')
        n = len(str(scenes[si]['text']).split())
        w0, w1 = b.get('w0', 0), b.get('w1', n)
        if not (isinstance(w0, int) and isinstance(w1, int) and 0 <= w0 < n and w0 < w1 <= n):
            raise ValueError('A beat has an invalid word range')
        v = b.get('visual') or {}
        if v.get('type') == 'image':
            if not isinstance(v.get('src'), int) or not 0 <= v['src'] < len(images):
                raise ValueError('A beat points at a missing picture')
            if v.get('move', 'drift') not in MOVES:
                raise ValueError('Unknown camera move')
        elif v.get('type') == 'card':
            if v.get('card') not in KINDS:
                raise ValueError('Unknown card kind')
            if v.get('bg') is not None and (not isinstance(v['bg'], int) or not 0 <= v['bg'] < len(images)):
                raise ValueError('A card points at a missing background picture')
        else:
            raise ValueError('A beat has no visual')
        if b.get('transition', 'cut') not in TRANSITIONS:
            raise ValueError('Unknown transition')
        for o in b.get('overlays') or []:
            if o.get('kind') not in OVERLAYS and o.get('kind') not in KINDS:
                raise ValueError('Unknown overlay')
        for c in b.get('cast') or []:
            if c.get('id') not in {x.get('id') for x in (m.get('cast') or [])} or c.get('side') not in ('left', 'right', 'center'):
                raise ValueError('A beat shows someone who is not in the cast')
    for c in m.get('cast') or []:
        if not isinstance(c.get('cutout'), int) or not 0 <= c['cutout'] < len(m.get('cutouts') or []):
            raise ValueError('A cast member points at a missing cutout')
    return True


def build(manifest, aligned, durations):
    """aligned: per take, a list of {scene, words:[{start,end}]} (from align-ink.py); durations: seconds of each take's audio.

    Returns the timeline: spoken words on the final clock, beats with start/end, audio edit list and total duration.
    """
    validate_manifest(manifest)
    scenes = manifest['scenes']
    takes = manifest['voice']
    if len(aligned) != len(takes) or len(durations) != len(takes):
        raise ValueError('Alignment does not match the recorded takes')
    pauses = {}
    for p in manifest.get('pauses') or []:
        if isinstance(p.get('scene'), int) and isinstance(p.get('after_word'), int) and 0 < float(p.get('sec', 0)) <= 1.6:
            pauses[(p['scene'], p['after_word'])] = float(p['sec'])
    words, by_scene, edits = [], {}, []
    cursor = 0.0
    for k, take in enumerate(aligned):
        local = []
        for item in take:
            for wi, w in enumerate(item['words']):
                local.append((item['scene'], wi, float(w['start']), float(w['end']), w.get('text', '')))
        shift, last_cut = 0.0, 0.0
        for idx, (si, wi, s, e, text) in enumerate(local):
            sec = pauses.get((si, wi - 1)) if wi > 0 else None
            if wi == 0 and si > 0:
                sec = pauses.get((si - 1, len(str(scenes[si - 1]['text']).split()) - 1))
            if sec and idx == 0:   # the pause falls on a take boundary: it is silence in front of this take
                edits.append(('silence', sec))
                shift += sec
            elif sec and idx > 0:
                prev_end = local[idx - 1][3]
                cut = (prev_end + s) / 2 if s - prev_end > .12 else max(prev_end, s - .03)
                edits.append(('take', k, last_cut, cut))
                edits.append(('silence', sec))
                last_cut = cut
                shift += sec
            w = {'t0': cursor + s + shift, 't1': cursor + e + shift, 'text': text, 'scene': si, 'wi': wi}
            words.append(w)
            by_scene.setdefault(si, []).append(w)
        edits.append(('take', k, last_cut, durations[k]))
        cursor += durations[k] + shift + (TAKE_GAP if k < len(aligned) - 1 else 0.0)
        if k < len(aligned) - 1:
            edits.append(('silence', TAKE_GAP))
    speech_end = max((w['t1'] for w in words), default=cursor)
    duration = max(cursor, speech_end) + TAIL
    for si in range(len(scenes)):
        if si not in by_scene:
            raise ValueError('A scene was not found in the alignment')
    beats = [dict(b) for b in manifest['beats']]
    beats.sort(key=lambda b: (b['scene'], b.get('w0', 0)))
    seen = {b['scene'] for b in beats}
    for si in range(len(scenes)):
        if si not in seen:   # a scene the planner skipped still gets its own picture
            beats.append({'scene': si, 'w0': 0, 'w1': len(by_scene[si]), 'visual': {'type': 'image', 'src': min(si, len(manifest['images']) - 1), 'move': 'drift'}})
    beats.sort(key=lambda b: (b['scene'], b.get('w0', 0)))
    starts = []
    for i, b in enumerate(beats):
        ws = by_scene[b['scene']]
        t = ws[min(b.get('w0', 0), len(ws) - 1)]['t0']
        if i == 0:
            t = 0.0
        else:
            t = max(0.0, t - LEAD)
        starts.append(t)
    # keep the order, and give every card long enough to be read
    for i in range(1, len(starts)):
        starts[i] = max(starts[i], starts[i - 1] + .25)
    for i in range(len(beats) - 1):
        v = beats[i]['visual']
        need = CARD_MIN.get(v.get('card'), MIN_BEAT['card']) if v['type'] == 'card' else MIN_BEAT['image']
        if starts[i + 1] - starts[i] < need:
            starts[i + 1] = starts[i] + need
    out = []
    for i, b in enumerate(beats):
        end = starts[i + 1] if i + 1 < len(beats) else duration
        end = min(end, duration)
        out.append({**b, 'start': starts[i], 'end': max(end, starts[i] + .3)})
    # a cutout slides in only when it was not already standing there on the previous beat
    for i, b in enumerate(out):
        prev = out[i - 1].get('cast') or [] if i else []
        if b.get('cast'):
            b['cast'] = [dict(c, enter=not any(p['id'] == c['id'] and p['side'] == c['side'] for p in prev)) for c in b['cast']]
    duration = max(duration, out[-1]['end'])
    out[-1]['end'] = duration
    return {'duration': duration, 'words': words, 'beats': out, 'edits': edits, 'frames': int(math.ceil(duration * FPS))}


def beat_at(timeline, t):
    starts = timeline.setdefault('_starts', [b['start'] for b in timeline['beats']])
    i = bisect.bisect_right(starts, t) - 1
    return max(0, min(i, len(timeline['beats']) - 1))


def phrases(words, max_words=7, max_span=3.4, gap=.45):
    """Caption phrases: words grouped at punctuation or pauses, 7 at most, never held for longer than max_span."""
    out, cur = [], []
    for w in words:
        if cur and (len(cur) >= max_words or w['t1'] - cur[0]['t0'] > max_span or w['t0'] - cur[-1]['t1'] > gap or cur[-1]['text'][-1:] in '.!?;:'):
            out.append(cur)
            cur = []
        cur.append(w)
        if len(cur) >= 3 and w['text'][-1:] in ',.!?;:':
            out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return [{'t0': p[0]['t0'], 't1': p[-1]['t1'], 'words': p, 'text': ' '.join(x['text'] for x in p)} for p in out]
