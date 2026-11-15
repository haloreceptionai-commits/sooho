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
    changes = sum(1 for a, b in zip(shots, shots[1:]) if a['set'] != b['set'])
    rate = changes / total * 60
    report = {'sentences': len(sents), 'shots': len(shots), 'required': required_total, 'covered': covered_total,
              'coverage': round(covered_total / required_total, 4) if required_total else 1.0,
              'undrawable': undrawable, 'missing': misses, 'set_changes_per_min': round(rate, 2),
              'mean_shot_len': round(total / max(1, len(shots)), 2), 'max_shot_len': round(max(lens or [0]), 2),
              'min_shot_len': round(min(lens or [0]), 2), 'sets_used': sorted({s['set'] for s in shots})}
    lo, hi = PACE['set_changes_per_min']
    if not lo <= rate <= hi: errs.append(f'set changes {rate:.1f}/min outside benchmark band {lo}-{hi}')
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
SET_CAMS['open_day'] = {'from': [3, -5, 2.4], 'look_at': [0, 0.5, 1.2], 'lens': 42, 'fstop': 5.6}
# Free floor slots per set, chosen from set-kits.json model positions (clear of props and walls).
SLOTS = {'mine_tunnel': [(-0.35, 0.9), (0.45, 1.5), (0, 2.4)], 'rail_yard': [(1.7, 1.0), (2.6, 2.2), (-1.7, 1.4)],
         'ship_deck': [(-0.9, 2), (1, 3), (0, 4.5)]}
DEFAULT_SLOTS = [(-0.75, 1.0), (0.85, 1.6), (0, 2.8)]
# Insert framings reuse the exact cameras that passed the step-5 recognition and motion reviews.
OBJ_CAMS = {}
for f in (HERE / 'shots').glob('mechanism-*.json'):
    s = json.loads(f.read_text()); o = s['objects'][0]
    OBJ_CAMS[(o['kind'], o.get('action', 'hold'))] = s['camera']; OBJ_CAMS.setdefault(o['kind'], s['camera'])
OBJ_CAMS.setdefault('perforated_cart', {'from': [3.6, -6.4, 3.3], 'look_at': [0, -1.4, 0.75], 'lens': 35, 'fstop': 8})


def _off(v, d): return [round(a + b, 3) for a, b in zip(v, d)]


def compile_one(sh, plan, duration, si=0):
    st = sh.get('set')
    if st not in SETS: raise ValueError(f'unknown set {st!r}')
    framing = sh.get('framing'); slots = SLOTS.get(st, DEFAULT_SLOTS)
    looks = {c['id']: c for c in plan.get('cast', [])}
    cast = []
    for i, c in enumerate(sh.get('cast', [])[:3]):
        base = looks.get(c['id'], {}); x, y = slots[i % len(slots)]
        ch = {'id': c['id'], 'pos': [x, y], 'yaw': 0, 'action': c.get('action', 'stand'), 'expression': c.get('expression', 'neutral'),
              'outfit': base.get('outfit', 'worker'), 'hat': base.get('hat', 'none')}
        if base.get('shirt'): ch['shirt'] = base['shirt']
        cast.append(ch)
    objects = []
    for o in sh.get('objects', [])[:2]:
        if o.get('kind') not in OBJECTS: raise ValueError(f'unknown story object {o.get("kind")!r}')
        objects.append({'kind': o['kind'], 'action': o.get('action', 'hold'), 'pos': [0, 0, 0], 'scale': 1})
    if framing == 'insert':
        if not objects: raise ValueError('insert framing needs an object')
        # object at the frame centre with its reviewed camera; cast stands behind it, out of the way
        ox, oy = (0, 0.4) if st == 'mine_tunnel' else (0.3, 0.2)
        objects[0]['pos'] = [ox, oy, 0]
        cam = dict(OBJ_CAMS.get((objects[0]['kind'], objects[0]['action']), OBJ_CAMS[objects[0]['kind']])); cam['from'] = _off(cam['from'], [ox, oy, 0]); cam['look_at'] = _off(cam['look_at'], [ox, oy, 0])
        for j, o in enumerate(objects[1:], 1): o['pos'] = [ox + 0.9 * j, oy + 0.6, 0]; o['scale'] = 0.6
        for ch in cast: ch['pos'] = [round(ox + 1.4 * (1 if ch['pos'][0] >= 0 else -1), 3), round(oy + 2.2, 3)]
    else:
        # object stands beside its user at a person-readable size
        for j, o in enumerate(objects):
            px, py = cast[j % len(cast)]['pos'] if cast else slots[0]
            o['pos'] = [round(px + 0.55, 3), round(py - 0.35, 3), 0]; o['scale'] = 0.5
        if framing == 'wide' or not cast:
            cam = dict(SET_CAMS.get(st, SET_CAMS['open_day']))
        else:
            x, y = cast[0]['pos']; d = 3.6 if framing == 'medium' else 2.2
            cam = {'from': [round(x + 0.35 * d, 3), round(y - d, 3), 1.55], 'look_at': [x, round(y + 0.2, 3), 1.05 if framing == 'medium' else 1.3],
                   'lens': 40 if framing == 'medium' else 55, 'fstop': 4}
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
            c['_sentence'] = s['index']; c['_words'] = ' '.join(s['words'][(0 if i == 0 else shots[1]['start_word']):(shots[1]['start_word'] if i == 0 and len(bounds) == 3 else None)])
            out.append(c)
    return out


def renderable(shot):
    return {k: v for k, v in shot.items() if not k.startswith('_')}
