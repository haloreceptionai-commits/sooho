"""Deterministic half of the step-6 shot director.

The language model only proposes a declarative plan (which drawable concepts each spoken sentence
shows, split into 1-2 shots).  This module never trusts it: it re-derives the spoken concrete words
from the sentence itself, rejects invented mentions, checks every spoken drawable concept is on
screen while its words are heard, enforces benchmark pacing and compiles the plan into shots that
must pass shot_schema.validate_shot.  It runs without Blender.
"""
import json, re
from pathlib import Path
from shot_schema import validate_shot, SETS
from object_specs import OBJECTS
from character_motion import ACTIONS, EXPRESSIONS, OUTFITS, HATS

HERE = Path(__file__).parent
VOCAB = json.loads((HERE / 'director-vocabulary.json').read_text())
FRAMINGS = {'wide', 'medium', 'close', 'insert'}
# Benchmark band measured in step 1 (results/report.md): Mine 17.7 and Cart 14.4 set changes/min,
# median shot ~1.9-2.7s.  The gate is deliberately a band around those numbers, not a guess.
PACE = {'set_changes_per_min': (12.0, 22.0), 'shot_len': (0.5, 5.0), 'mean_shot_len': (1.4, 3.0)}


def norm(text):
    return re.sub(r"[^a-z0-9' -]", ' ', text.lower().replace('-', ' ')).split()


def has_phrase(tokens, phrase):
    p = norm(phrase); n = len(p)
    return any(tokens[i:i + n] == p for i in range(len(tokens) - n + 1))


def syllables(word):
    w = re.sub(r'[^a-z]', '', word.lower())
    if not w: return 2 if any(ch.isdigit() for ch in word) else 1
    n = len(re.findall(r'[aeiouy]+', w)) - (1 if w.endswith('e') and not w.endswith('le') and len(w) > 2 else 0)
    return max(1, n)


def estimated_timing(words, total, pause=0.25):
    """Syllable-proportional word starts over the measured narration length, with a short pause after
    each sentence.  Used only for benchmark transcripts whose OCR anchors are unreliable; production
    plans use CTC-aligned word times."""
    ends = sum(1 for w in words if w['w'][-1] in '.?!')
    speak = total - pause * ends; per = speak / sum(syllables(w['w']) for w in words); t = 0; out = []
    for w in words:
        out.append({'w': w['w'], 't': round(t, 3)}); t += syllables(w['w']) * per + (pause if w['w'][-1] in '.?!' else 0)
    return out


def sentences(words):
    """Group timed benchmark words into sentences; end = next sentence's first word time."""
    out, cur = [], []
    for w in words:
        cur.append(w)
        if w['w'][-1] in '.?!':
            out.append(cur); cur = []
    if cur: out.append(cur)
    res = []
    for i, s in enumerate(out):
        end = out[i + 1][0]['t'] if i + 1 < len(out) else s[-1]['t'] + 0.45
        res.append({'index': i, 'text': ' '.join(w['w'] for w in s), 'words': [w['w'] for w in s],
                    'times': [w['t'] for w in s], 'start': s[0]['t'], 'end': end})
    return res


def lexical_concepts(text):
    """Concepts any reader can verify from the words alone (object nouns, their verbs in the same
    sentence, place nouns, character verbs).  The plan must show every one of them."""
    t = norm(text); found = set()
    for set_id, ws in VOCAB['sets'].items():
        if any(has_phrase(t, w) for w in ws): found.add(f'set:{set_id}')
    owners = {}
    for kind, spec in VOCAB['objects'].items():
        for act, ws in spec['actions'].items():
            for w in ws: owners.setdefault(w, set()).add((kind, act))
    for w, ks in owners.items():
        # a verb only one drawable object performs ("kink", "spin") requires that object action
        if len({k for k, _ in ks}) == 1 and has_phrase(t, w):
            (kind, act), = ks; found |= {f'obj:{kind}', f'obj:{kind}:{act}'}
    for kind, spec in VOCAB['objects'].items():
        if any(has_phrase(t, w) for w in spec['words']):
            found.add(f'obj:{kind}')
            for act, ws in spec['actions'].items():
                if any(has_phrase(t, w) for w in ws): found.add(f'obj:{kind}:{act}')
    for act, ws in VOCAB['character_actions'].items():
        if any(has_phrase(t, w) for w in ws): found.add(f'char:{act}')
    if any(has_phrase(t, w) for w in VOCAB['people']): found.add('cast:person')
    for o, ws in VOCAB['outfits'].items():
        if any(has_phrase(t, w) for w in ws): found.add(f'outfit:{o}')
    return found


def concept_valid(c):
    p = c.split(':')
    if p[0] == 'set': return len(p) == 2 and p[1] in SETS
    if p[0] == 'obj': return p[1] in OBJECTS and (len(p) == 2 or (len(p) == 3 and p[2] in OBJECTS[p[1]]['actions']))
    if p[0] == 'char': return len(p) == 2 and p[1] in ACTIONS
    if p[0] == 'light': return len(p) == 2 and p[1] in VOCAB['lighting']
    if p[0] == 'cast': return c == 'cast:person'
    if p[0] == 'outfit': return len(p) == 2 and p[1] in OUTFITS
    return False


def shot_concepts(shot):
    got = {f"set:{shot['set']}", f"light:{shot.get('lighting', 'day')}"}
    for o in shot.get('objects', []):
        got.add(f"obj:{o['kind']}"); got.add(f"obj:{o['kind']}:{o.get('action', 'hold')}")
        if o['kind'] == 'rail_joint': got.add('set:rail_yard')  # the joint itself is two full rails on sleepers
    for c in shot.get('cast', []):
        got.add(f"char:{c.get('action', 'stand')}"); got.add('cast:person'); got.add(f"outfit:{c.get('outfit', 'worker')}")
    return got


def validate_plan(plan, story, concrete=None):
    """Return (errors, report).  An empty error list is the only accepted outcome."""
    errs = []; sents = sentences(story['words']); cast_ids = set()
    if not isinstance(plan, dict) or not isinstance(plan.get('sentences'), list): return ['plan.sentences missing'], {}
    for c in plan.get('cast', []):
        if c.get('outfit', 'worker') not in OUTFITS or c.get('hat', 'none') not in HATS: errs.append(f'cast {c.get("id")} outfit/hat')
        cast_ids.add(c.get('id'))
    if len(plan['sentences']) != len(sents): errs.append(f'plan has {len(plan["sentences"])} sentences, story has {len(sents)}')
    required_total = covered_total = 0; misses = []; undrawable = []
    story_sets = {c[4:] for s_ in sents for c in lexical_concepts(s_['text']) if c.startswith('set:')}
    extra = [w for w in plan.get('worlds', []) if w in SETS]
    if len(extra) > 2: errs.append('at most 2 extra worlds')
    worlds = story_sets | set(extra[:2])
    for s, ps in zip(sents, plan['sentences']):
        shots = ps.get('shots', [])
        if not 1 <= len(shots) <= 2: errs.append(f's{s["index"]}: needs 1-2 shots, got {len(shots)}'); continue
        tokens = norm(s['text'])
        for m in ps.get('mentions', []):
            if not has_phrase(tokens, m.get('word', '')): errs.append(f's{s["index"]}: invented mention {m.get("word")!r}')
            elif m.get('concept') is None and m.get('kind') == 'abstract': continue
            elif m.get('concept') is None: undrawable.append({'sentence': s['index'], 'word': m['word']})
            elif not concept_valid(m['concept']): errs.append(f's{s["index"]}: unknown concept {m["concept"]}')
        lo_, hi_ = PACE['shot_len']; dur = s['end'] - s['start']
        valid = [i for i in range(1, len(s['words'])) if lo_ <= s['times'][i] - s['start'] <= hi_ and lo_ <= s['end'] - s['times'][i] <= hi_]
        bad = (len(shots) == 1 and not lo_ <= dur <= hi_) or (len(shots) == 2 and shots[1].get('start_word') not in valid)
        if bad:
            hint = f'valid start_word values for a 2-shot split: {valid}' if valid else 'no 2-shot split fits; use 1 shot'
            errs.append(f's{s["index"]}: shot timing out of {lo_}-{hi_}s (sentence {dur:.2f}s); {hint}')
        starts = [0] + [sh.get('start_word', 0) for sh in shots[1:]]
        if len(shots) == 2 and not 0 < starts[1] < len(s['words']): errs.append(f's{s["index"]}: bad start_word'); continue
        shown = set()
        for sh in shots:
            for c in sh.get('cast', []):
                if c.get('id') not in cast_ids: errs.append(f's{s["index"]}: unknown cast {c.get("id")}')
                if c.get('action', 'stand') not in ACTIONS or c.get('expression', 'neutral') not in EXPRESSIONS: errs.append(f's{s["index"]}: bad cast action/expression')
            if sh.get('framing') not in FRAMINGS: errs.append(f's{s["index"]}: framing')
            try: shown |= shot_concepts(compile_one(sh, plan, 1.0, s['index']))
            except (ValueError, AssertionError, KeyError, TypeError) as e: errs.append(f's{s["index"]}: {e}')
        need = lexical_concepts(s['text']) | {m['concept'] for m in ps.get('mentions', []) if m.get('concept') and concept_valid(m['concept'])}
        for sh in shots:
            # no unmotivated props: every object on screen must be spoken in this sentence
            for o in sh.get('objects', []):
                if f"obj:{o.get('kind')}" not in need and f"obj:{o.get('kind')}:{o.get('action', 'hold')}" not in need:
                    errs.append(f's{s["index"]}: object {o.get("kind")} is not spoken in this sentence; remove it')
            if sh.get('set') not in worlds and f"set:{sh.get('set')}" not in need:
                errs.append(f's{s["index"]}: set {sh.get("set")} is not a story world {sorted(worlds)}; use a story world (change zone for variety)')
        need = {c for c in need if not c.startswith('char:stand')}
        # a shown object action also covers the bare object; character stand is never "required"
        missing = sorted(c for c in need if c not in shown)
        # words an independent reader judged concrete must map to something on screen
        for w in (concrete or {}).get(s['index'], []):
            via = {m['concept'] for m in ps.get('mentions', []) if m.get('concept') and norm(m.get('word', '')) == norm(w)} | lexical_concepts(w)
            need.add(f'word:{w}')
            if not via & shown: missing.append(f'word:{w}')
        required_total += len(need) + sum(1 for u in undrawable if u['sentence'] == s['index'])
        covered_total += len(need) - len(missing)
        for c in missing: misses.append({'sentence': s['index'], 'concept': c})
    for m in misses: errs.append(f's{m["sentence"]}: spoken {m["concept"]} not shown' + (' (independent reader marked it concrete: map it to a drawable concept and show it)' if m['concept'].startswith('word:') else ''))
    for u in undrawable: errs.append(f's{u["sentence"]}: spoken {u["word"]!r} has no drawable concept')
    shots = compile_plan(plan, story, strict=False)
    lens = [s['duration'] for s in shots]; total = sum(lens) or 1
    changes = sum(1 for a, b in zip(shots, shots[1:]) if (a['set'], a['_zone']) != (b['set'], b['_zone']))
    rate = changes / total * 60
    report = {'sentences': len(sents), 'shots': len(shots), 'required': required_total, 'covered': covered_total,
              'coverage': round(covered_total / required_total, 4) if required_total else 1.0,
              'undrawable': undrawable, 'missing': misses, 'set_changes_per_min': round(rate, 2),
              'mean_shot_len': round(total / max(1, len(shots)), 2), 'max_shot_len': round(max(lens or [0]), 2),
              'min_shot_len': round(min(lens or [0]), 2), 'sets_used': sorted({s['set'] for s in shots})}
    lo, hi = PACE['set_changes_per_min']
    if not lo <= rate <= hi:
        errs.append(f'set changes {rate:.1f}/min outside benchmark band {lo}-{hi}: {changes} backdrop (set or zone) changes in {total:.1f}s; '
                     f'need {int(-(-lo * total // 60))}-{int(hi * total // 60)} changes across {len(shots)} shots')
    lo, hi = PACE['mean_shot_len']
    if not lo <= report['mean_shot_len'] <= hi: errs.append(f'mean shot {report["mean_shot_len"]}s outside {lo}-{hi}')
    lo, hi = PACE['shot_len']
    for i, l in enumerate(lens):
        if not lo <= l <= hi: errs.append(f'shot {i} length {l:.2f}s outside {lo}-{hi}')
    return errs, report


# ---------- compilation into renderable declarative shots ----------
SET_CAMS = {}
for f in (HERE / 'shots').glob('set-*.json'):
    SET_CAMS[f.stem[4:]] = json.loads(f.read_text())['camera']
# Zones: open floor spots inside each kit (chosen from set-kits.json model positions) with the
# heading the camera looks along, so one location yields several distinct backdrops like the
# benchmark's "tunnel" vs "mine entrance" shots.  heading is degrees in the ground plane (90 = +y).
_INDOOR = {'front': ((0, 0.6), 90), 'back': ((-1.2, 5.6), 100), 'left_wall': ((-3.2, 2.6), 160), 'right': ((2.4, 2.2), 70)}
_OPEN = {'center': ((0, -1), 90), 'left': ((-1.2, 3.2), 120), 'right': ((2.6, 2), 70)}
ZONES = {
    'rail_yard': {'track_side': ((2.0, 1.0), 90), 'locomotive': ((2.0, 4.2), 115), 'house': ((-3.2, 7.6), 125), 'open_yard': ((4.2, 0.8), 155)},
    'mine_tunnel': {'entrance': ((0, 0.6), 90), 'crates': ((0.3, 2.0), 95), 'deep': ((0, 4.6), 90), 'looking_back': ((0, 3.6), 270)},
    'ship_deck': {'bow': ((0, 1), 90), 'port_rail': ((-1.8, 4.6), 175), 'mast': ((0.4, 5.6), 95)},
    'office': _INDOOR, 'saloon': _INDOOR, 'workshop': _INDOOR, 'room': _INDOOR,
    'castle': _OPEN, 'village': _OPEN, 'battlefield': _OPEN, 'street': _OPEN, 'open_day': {'center': ((0, 0), 90)},
}
# Insert framings reuse the exact cameras that passed the step-5 recognition and motion reviews.
OBJ_CAMS = {}
for f in (HERE / 'shots').glob('mechanism-*.json'):
    s = json.loads(f.read_text()); o = s['objects'][0]
    OBJ_CAMS[(o['kind'], o.get('action', 'hold'))] = s['camera']; OBJ_CAMS.setdefault(o['kind'], s['camera'])


def _rot(v, deg):
    """Rotate an object-space offset (authored for a camera looking along +y) to a zone heading."""
    import math
    a = math.radians(deg - 90); c, s_ = math.cos(a), math.sin(a)
    return [round(v[0] * c - v[1] * s_, 3), round(v[0] * s_ + v[1] * c, 3)] + ([round(v[2], 3)] if len(v) > 2 else [])


def _at(origin, off, deg, z=None):
    r = _rot(off, deg); p = [round(origin[0] + r[0], 3), round(origin[1] + r[1], 3)]
    return p + [z if z is not None else (r[2] if len(r) > 2 else 0)]


def zone_of(sh):
    st = sh.get('set'); zones = ZONES.get(st, {'center': ((0, 0), 90)})
    z = sh.get('zone') or next(iter(zones))
    if z not in zones: raise ValueError(f'unknown zone {z!r} for set {st} (zones: {sorted(zones)})')
    return z, zones[z]


def compile_one(sh, plan, duration, si=0):
    st = sh.get('set')
    if st not in SETS: raise ValueError(f'unknown set {st!r}')
    framing = sh.get('framing'); _, (origin, head) = zone_of(sh); yaw = head - 90
    looks = {c['id']: c for c in plan.get('cast', [])}
    slots = [(-0.6, 0), (0.65, 0.45), (0, 1.1)]
    cast = []
    for i, c in enumerate(sh.get('cast', [])[:3]):
        base = looks.get(c['id'], {}); x, y, _ = _at(origin, slots[i], head)
        ch = {'id': c['id'], 'pos': [x, y], 'yaw': round(yaw, 2), 'action': c.get('action', 'stand'), 'expression': c.get('expression', 'neutral'),
              'outfit': base.get('outfit', 'worker'), 'hat': base.get('hat', 'none')}
        if base.get('shirt'): ch['shirt'] = base['shirt']
        cast.append(ch)
    objects = []
    for o in sh.get('objects', [])[:2]:
        if o.get('kind') not in OBJECTS: raise ValueError(f'unknown story object {o.get("kind")!r}')
        objects.append({'kind': o['kind'], 'action': o.get('action', 'hold'), 'pos': [0, 0, 0], 'scale': 1, 'yaw': round(yaw, 2)})
    if framing == 'insert':
        if not objects: raise ValueError('insert framing needs an object')
        objects[0]['pos'] = _at(origin, (0, 0.3), head, 0)
        o0 = objects[0]['pos']; c0 = OBJ_CAMS.get((objects[0]['kind'], objects[0]['action']), OBJ_CAMS[objects[0]['kind']])
        cam = {'from': _at(o0, c0['from'][:2], head, c0['from'][2]), 'look_at': _at(o0, c0['look_at'][:2], head, c0['look_at'][2]), 'lens': c0['lens'], 'fstop': c0['fstop']}
        for j, o in enumerate(objects[1:], 1): o['pos'] = _at(o0, (0.9, 0.7), head, 0); o['scale'] = 0.6
        for i, ch in enumerate(cast): ch['pos'] = _at(o0, ((-1.3, 1.6), (1.3, 1.9), (0, 2.6))[i], head)[:2]
    else:
        for j, o in enumerate(objects):
            near = cast[j % len(cast)]['pos'] if cast else origin
            o['pos'] = _at(near, (0.55, -0.7), head, 0); o['scale'] = 0.85  # step-6 review: 0.5 props unreadable in medium shots
        if framing == 'wide' or not cast:
            d = 3.6 if st == 'mine_tunnel' else 5.2
            cam = {'from': _at(origin, (0.9, -d), head, 2.0), 'look_at': _at(origin, (0, 1.5), head, 1.2), 'lens': 26 if st == 'mine_tunnel' else 30, 'fstop': 5.6}
        else:
            sub = cast[0]['pos']
            if objects:  # frame the person and the named prop together
                p0 = objects[0]['pos']; sub = [(sub[0] + p0[0]) / 2, (sub[1] + p0[1]) / 2]
            d = 3.0 if framing == 'medium' else 2.0
            cam = {'from': _at(sub, (0.35 * d, -d), head, 1.55), 'look_at': _at(sub, (0, 0.2), head, 1.05 if framing == 'medium' else 1.3),
                   'lens': 40 if framing == 'medium' else 55, 'fstop': 4}
    if st == 'mine_tunnel':
        # the tunnel is ~3 m wide: keep every camera between the rock walls (step-6 render showed black frames)
        for k in ('from', 'look_at'): cam[k][0] = max(-0.9, min(0.9, cam[k][0]))
    shot = {'set': st, 'lighting': sh.get('lighting', 'day'), 'duration': round(duration, 3), 'camera': cam,
            'cast': cast, 'objects': objects, 'engine': 'cycles', 'samples': 24, 'size': [1080, 1920], 'grade': 'Punchy'}
    return validate_shot(shot)


def compile_plan(plan, story, strict=True):
    out = []
    for s, ps in zip(sentences(story['words']), plan.get('sentences', [])):
        shots = ps.get('shots', [])[:2]
        bounds = [s['start']] + ([s['times'][shots[1].get('start_word', 0)]] if len(shots) == 2 and 0 < shots[1].get('start_word', 0) < len(s['times']) else []) + [s['end']]
        for i, sh in enumerate(shots[:len(bounds) - 1]):
            try:
                c = compile_one(sh, plan, bounds[i + 1] - bounds[i], s['index'])
            except (ValueError, AssertionError, KeyError, TypeError):
                if strict: raise
                continue
            c['_sentence'] = s['index']; c['_zone'] = zone_of(sh)[0]; c['_words'] = ' '.join(s['words'][(0 if i == 0 else shots[1]['start_word']):(shots[1]['start_word'] if i == 0 and len(bounds) == 3 else None)])
            out.append(c)
    return out


def renderable(shot):
    return {k: v for k, v in shot.items() if not k.startswith('_')}
