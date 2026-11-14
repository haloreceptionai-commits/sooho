"""Shot-by-shot visual labelling with the owner's Azure vision model.

Each shot is shown as three frames (start, middle, end) with the words spoken
during it.  The model fills a strict schema; every number later scored comes
from these labels or from measure.py, so the same judge scores the benchmarks
and our renders.  The API key is read from AZURE_OPENAI_API_KEY and never
printed.
"""
from __future__ import annotations
import base64, io, json, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image

ENDPOINT = 'https://robiulalamsuleman-5258-resource.services.ai.azure.com'
DEPLOYMENT = os.environ.get('BENCH_VISION_DEPLOYMENT', 'gpt-5')
SHOT_TYPES = ['establishing', 'wide', 'medium', 'character_closeup', 'object_insert', 'action', 'crowd', 'effect', 'diagram', 'other']
CAMERA = ['static', 'push_in', 'pull_out', 'pan', 'tracking', 'orbit', 'whip', 'shake']

SHOT = {
    'type': 'object', 'additionalProperties': False,
    'required': ['i', 'shot_type', 'camera', 'distinct_framings', 'set', 'set_detail', 'objects', 'spoken_visible',
                 'action', 'effects', 'characters', 'lighting', 'depth', 'environment_richness', 'character_quality', 'render_quality', 'note'],
    'properties': {
        'i': {'type': 'integer'},
        'shot_type': {'type': 'string', 'enum': SHOT_TYPES},
        'camera': {'type': 'string', 'enum': CAMERA},
        'distinct_framings': {'type': 'integer', 'description': 'How many clearly different views/subjects appear across the three frames (1-3).'},
        'set': {'type': 'string', 'description': 'Short place label, e.g. "mine tunnel", "castle gate", "classroom".'},
        'set_detail': {'type': 'string'},
        'objects': {'type': 'array', 'items': {'type': 'string'}},
        'spoken_visible': {'type': 'string', 'enum': ['yes', 'partial', 'no', 'no_words']},
        'action': {'type': 'string', 'description': 'What physically happens, or "none".'},
        'effects': {'type': 'array', 'items': {'type': 'string'}},
        'characters': {'type': 'integer'},
        'lighting': {'type': 'string', 'enum': ['day_sun', 'sunset', 'night', 'interior_lamps', 'rain_storm', 'flat']},
        'depth': {'type': 'integer', 'description': '0-10: shadows, background blur, layered depth.'},
        'environment_richness': {'type': 'integer', 'description': '0-10: built 3D place with textured ground, walls, props, foliage.'},
        'character_quality': {'type': 'integer', 'description': '0-10: real 3D bodies posed with the action, expressive faces; flat cut-outs score low. 0 if no characters.'},
        'render_quality': {'type': 'integer', 'description': '0-10 overall cinematic quality of a 3D-animated YouTube Short.'},
        'note': {'type': 'string'},
    },
}
SCHEMA = {'type': 'object', 'additionalProperties': False, 'required': ['shots'],
          'properties': {'shots': {'type': 'array', 'items': SHOT}}}

SYSTEM = """You label shots of vertical 3D-animated YouTube Shorts for an objective quality audit.
Judge only what is visible. Each image shows one shot: start, middle and end frames left to right.
Ignore the burned-in caption text when judging the picture, but use the spoken words to decide
spoken_visible: "yes" when the thing or action the words name is clearly shown, "partial" when only
loosely related, "no" when not shown. Scale anchors for 0-10 scores: 10 = polished studio 3D short
(real lit 3D sets, soft shadows, depth of field, posed 3D characters); 5 = clean but simple 3D;
2 = flat cut-out cards or plain backdrops. Be strict and consistent."""


def strip(shot: dict) -> str:
    base = Path(shot['keyframe'])
    parts = [base.with_name(base.stem + 'a.jpg'), base, base.with_name(base.stem + 'z.jpg')]
    ims = [Image.open(p).convert('RGB').resize((270, 480)) for p in parts]
    out = Image.new('RGB', (810, 480))
    for k, im in enumerate(ims):
        out.paste(im, (k * 270, 0))
    buf = io.BytesIO(); out.save(buf, 'JPEG', quality=80)
    return base64.b64encode(buf.getvalue()).decode()


def call(shots: list[dict]) -> list[dict]:
    content: list[dict] = [{'type': 'text', 'text': 'Label every shot below. Return one entry per shot with the same i.'}]
    for s in shots:
        content.append({'type': 'text', 'text': f"Shot i={s['i']} ({s['len']}s). Spoken during it: \"{s['words'] or '(none)'}\""})
        content.append({'type': 'image_url', 'image_url': {'url': 'data:image/jpeg;base64,' + strip(s), 'detail': 'high'}})
    body = {'messages': [{'role': 'system', 'content': SYSTEM}, {'role': 'user', 'content': content}],
            'response_format': {'type': 'json_schema', 'json_schema': {'name': 'shot_labels', 'strict': True, 'schema': SCHEMA}},
            'max_completion_tokens': 16000, 'reasoning_effort': 'low'}
    req = urllib.request.Request(f'{ENDPOINT}/openai/deployments/{DEPLOYMENT}/chat/completions?api-version=2025-04-01-preview',
                                 data=json.dumps(body).encode(), method='POST',
                                 headers={'api-key': os.environ['AZURE_OPENAI_API_KEY'], 'Content-Type': 'application/json'})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=240) as r:
                j = json.load(r)
            return json.loads(j['choices'][0]['message']['content'])['shots']
        except Exception as e:  # network/429: retry with backoff, never print secrets
            code = getattr(e, 'code', '')
            detail = ''
            if hasattr(e, 'read'):
                try: detail = json.loads(e.read()).get('error', {}).get('message', '')[:300]
                except Exception: pass
            if code == 400 or attempt == 4:
                if code == 400 and len(shots) > 1:   # one shot can trip a filter: label the rest one by one
                    return [x for s in shots for x in call([s])]
                if code == 400:
                    return [{'i': shots[0]['i'], 'error': detail or 'rejected'}]
                raise RuntimeError(f'vision labelling failed: {type(e).__name__} {code} {detail}') from None
            time.sleep(20 * (attempt + 1))
    return []


def label(measure: dict, batch: int = 6) -> list[dict]:
    shots = measure['shots']
    groups = [shots[i:i + batch] for i in range(0, len(shots), batch)]
    with ThreadPoolExecutor(2) as ex:
        out = [x for g in ex.map(call, groups) for x in g]
    by = {x['i']: x for x in out}
    missing = [s['i'] for s in shots if s['i'] not in by]
    if missing:
        raise RuntimeError(f'vision labels missing for shots {missing}')
    return [by[s['i']] for s in shots]


if __name__ == '__main__':
    m = json.loads(Path(sys.argv[1]).read_text())
    labels = label(m)
    Path(sys.argv[1].replace('.measure.json', '.vision.json')).write_text(json.dumps(labels, indent=1))
    print(m['name'], len(labels), 'labelled')
