"""Benchmark scorecard: turns measure.py + vision.py output into comparable numbers.

Targets are the average of the benchmark videos, so a render scores 100 only
when it matches them on every dimension.  Sound-hit density is reported but not scored: without separated stems speech
consonants count as hits, so step 8 measures sound sync from our own stems.
Weights favour what viewers notice
first: built sets, real objects that match the words, and changing views.
"""
from __future__ import annotations
import json, math, sys
from collections import Counter
from pathlib import Path
from statistics import median, mean

# (metric, weight, direction) - direction 'up' = more is better, 'down' = less is better
WEIGHTS: list[tuple[str, float, str]] = [
    ('spoken_visible_rate', 14, 'up'),
    ('environment_richness', 10, 'up'),
    ('render_quality', 10, 'up'),
    ('character_quality', 8, 'up'),
    ('depth', 6, 'up'),
    ('views_per_min', 8, 'up'),
    ('median_shot_len', 5, 'down'),
    ('set_changes_per_min', 7, 'up'),
    ('distinct_sets', 5, 'up'),
    ('shot_type_variety', 5, 'up'),
    ('object_insert_share', 5, 'up'),
    ('action_rate', 6, 'up'),
    ('effects_per_min', 4, 'up'),
    ('moving_camera_share', 3, 'up'),
    ('lighting_variety', 2, 'up'),
    ('sharpness', 2, 'up'),
]


def _set_key(s: str) -> str:
    return ' '.join(sorted(w for w in s.lower().replace('-', ' ').split() if w not in {'the', 'a', 'an', 'of', 'interior', 'exterior'}))


def metrics(measure: dict, vision: list[dict]) -> dict:
    dur = measure['duration']
    shots = measure['shots']
    labs = [v for v in vision if 'error' not in v]
    n = max(1, len(labs))
    sets = [_set_key(v['set']) for v in labs]
    changes = sum(1 for a, b in zip(sets, sets[1:]) if a != b)
    types = Counter(v['shot_type'] for v in labs)
    entropy = -sum(c / n * math.log(c / n) for c in types.values()) / math.log(len(_types_universe())) if labs else 0.0
    worded = [v for v in labs if v['spoken_visible'] != 'no_words']
    vis = sum(1 if v['spoken_visible'] == 'yes' else 0.5 if v['spoken_visible'] == 'partial' else 0 for v in worded)
    return {
        'duration': round(dur, 2),
        'shots': len(shots),
        'median_shot_len': round(median(s['len'] for s in shots), 2),
        'views_per_min': round(sum(min(3, max(1, v['distinct_framings'])) for v in labs) / dur * 60, 1),
        'set_changes_per_min': round(changes / dur * 60, 1),
        'distinct_sets': len(set(sets)),
        'shot_type_variety': round(entropy, 3),
        'object_insert_share': round(types.get('object_insert', 0) / n, 3),
        'spoken_visible_rate': round(vis / max(1, len(worded)), 3),
        'action_rate': round(sum(1 for v in labs if v['action'].strip().lower() not in {'none', ''}) / n, 3),
        'effects_per_min': round(sum(len(v['effects']) for v in labs) / dur * 60, 1),
        'moving_camera_share': round(sum(1 for v in labs if v['camera'] != 'static') / n, 3),
        'lighting_variety': len({v['lighting'] for v in labs}),
        'environment_richness': round(mean(v['environment_richness'] for v in labs), 2) if labs else 0,
        'render_quality': round(mean(v['render_quality'] for v in labs), 2) if labs else 0,
        'character_quality': round(mean(v['character_quality'] for v in labs if v['characters'] > 0) if any(v['characters'] > 0 for v in labs) else 0, 2),
        'depth': round(mean(v['depth'] for v in labs), 2) if labs else 0,
        'sharpness': round(median(s['sharpness'] for s in shots), 1),
        'colorfulness': round(median(s['colorfulness'] for s in shots), 1),
        'lufs': measure['audio']['lufs'] if measure.get('audio') else None,
        'transients_per_min': measure['audio']['transients_per_min'] if measure.get('audio') else 0,
        'labelled_shots': len(labs), 'unlabelled_shots': len(vision) - len(labs),
    }


def _types_universe() -> list[str]:
    from vision import SHOT_TYPES
    return SHOT_TYPES


def targets(benchmarks: list[dict]) -> dict:
    return {k: round(mean(b[k] for b in benchmarks), 3) for k, _, _ in WEIGHTS}


def score(m: dict, target: dict) -> dict:
    parts = {}
    for k, w, d in WEIGHTS:
        t, v = target[k], m[k]
        if d == 'up':
            r = 1.0 if t <= 0 else v / t
        else:
            r = 1.0 if v <= 0 else t / v
        parts[k] = round(max(0.0, min(1.0, r)) * 100, 1)
    if m.get('lufs') is not None:
        parts['loudness'] = round(max(0.0, 1 - abs(m['lufs'] + 14) / 4) * 100, 1)
    total_w = sum(w for _, w, _ in WEIGHTS) + (2 if 'loudness' in parts else 0)
    overall = (sum(parts[k] * w for k, w, _ in WEIGHTS) + parts.get('loudness', 0) * 2) / total_w
    return {'overall': round(overall, 1), 'parts': parts}


def load(outdir: Path, name: str) -> dict:
    m = json.loads((outdir / f'{name}.measure.json').read_text())
    v = json.loads((outdir / f'{name}.vision.json').read_text())
    return {'name': name, 'measure': m, 'vision': v, 'metrics': metrics(m, v)}


if __name__ == '__main__':
    outdir = Path(sys.argv[1]); bench = sys.argv[2].split(','); ours = sys.argv[3].split(',')
    vids = {n: load(outdir, n) for n in bench + ours}
    tgt = targets([vids[n]['metrics'] for n in bench])
    result = {'targets': tgt, 'videos': {n: {**vids[n]['metrics'], 'score': score(vids[n]['metrics'], tgt)} for n in vids}}
    (outdir / 'scorecard.json').write_text(json.dumps(result, indent=1))
    for n, r in result['videos'].items():
        print(n, r['score']['overall'])
