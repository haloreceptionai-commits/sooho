"""Advanced Video AI on the Blender engine: turns each locked manifest shot into a validated
declarative Blender shot (via the step-6 shot_director compiler), renders one frame batch on the
GPU, upscales to 1080x1920 and burns in the same captions as the web engine. Output files and the
checkpoint use capture.py's format and input hash, so joining, mixing and QA are unchanged.
"""
import argparse, hashlib, json, math, os, re, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'blender'))
from animals import ANIMAL  # noqa: E402
from shot_director import compile_one, ZONES  # noqa: E402
from shot_schema import validate_shot  # noqa: E402
from place_spec import compile_place, LIGHTING as PLACE_LIGHT  # noqa: E402

# Old-engine worlds -> Blender set kits (+ forced lighting).
WORLD = {'ship': ('ship_deck', None), 'storm_sea': ('ship_deck', 'rain'), 'town': ('village', None), 'market': ('street', None),
         'bridge': ('street', None), 'modern_street': ('street', None), 'lab': ('workshop', None), 'device_cutaway': ('workshop', None),
         'landscape': ('battlefield', None), 'night_camp': ('battlefield', 'night'), 'castle': ('castle', None), 'mine': ('mine_tunnel', None),
         'map': ('battlefield', None)}
LIGHT = {'day': 'day', 'golden': 'sunset', 'night_bright': 'night'}
ACTION = {'idle': 'stand', 'walk': 'walk', 'run': 'run', 'point': 'point', 'lift': 'carry', 'carry': 'carry', 'hold': 'carry', 'grab': 'carry',
          'place': 'carry', 'pour': 'pour', 'react': 'panic', 'shout': 'panic', 'cower': 'crouch', 'worried': 'panic', 'wave': 'cheer',
          'cheer': 'cheer', 'thumbs_up': 'cheer', 'aim': 'aim', 'fire': 'aim', 'load': 'load', 'strike': 'swing', 'throw': 'swing',
          'inspect': 'crouch', 'tap': 'point'}
FACE = {'grin': 'happy', 'smile': 'happy', 'laugh': 'happy', 'relief': 'happy', 'whistle': 'smug', 'stern': 'determined',
        'nervous': 'worried', 'shock': 'shock', 'dazed': 'sad', 'pained': 'sad', 'neutral': 'neutral'}
OUTFIT = {'soldier': ('soldier', 'helmet'), 'veteran': ('soldier', 'helmet'), 'knight': ('soldier', 'helmet'), 'captain': ('sailor', 'tricorne'),
          'pirate': ('sailor', 'tricorne'), 'sailor': ('sailor', 'beanie'), 'fisherman': ('sailor', 'beanie'), 'merchant': ('merchant', 'top'),
          'noble': ('merchant', 'top'), 'king': ('merchant', 'top'), 'cowboy': ('worker', 'none'), 'worker': ('worker', 'beanie'),
          'blacksmith': ('worker', 'none'), 'farmer': ('worker', 'none')}
PROP = {'magnifier': ('magnifier', 'swing'), 'coins': ('money_bag', 'hold'), 'gold_piece': ('money_bag', 'hold'), 'chest': ('money_bag', 'hold'),
        'cart': ('covered_cart', 'hold'), 'pan': ('gold_pan', 'pour'), 'cannon': ('gold_shotgun', 'fire')}
FX = {'smoke': 'smoke', 'fire': 'fire', 'dust': 'dust', 'burst': 'explosion', 'sparkle': 'sparks', 'rain': 'rain', 'splash': 'dust'}
SHIRTS = [[0.72, 0.42, 0.22], [0.2, 0.32, 0.6], [0.55, 0.2, 0.2], [0.3, 0.5, 0.3]]
SCALE = (810, 1440)  # rendered size, upscaled to 1080x1920 (about 1.8x faster on the T4)


def plan_cast(m):
    out = []
    for i, c in enumerate(m['cast']):
        outfit, hat = OUTFIT.get(c.get('outfit'), ('worker', 'none'))
        out.append({'id': c['id'], 'outfit': outfit, 'hat': hat, 'shirt': SHIRTS[i % len(SHIRTS)]})
    return out


def is_card(m, cid, cards):
    return ANIMAL.search(cid.lower()) is not None and f'{cid}.png' in cards


def compile_shot(m, i, cards=()):
    """Manifest shot i -> renderable Blender shot (validated). Never raises for vocabulary gaps."""
    s = m['shots'][i]
    st, forced = WORLD.get(s.get('world'), ('village', None))
    lighting = forced or LIGHT.get(s.get('light'), 'day')
    if 'rain' in (s.get('fx') or []): lighting = 'rain'
    zones = list(ZONES.get(st, {'center': 0}))
    framing = {'wide': 'wide', 'high': 'wide', 'low': 'medium', 'medium': 'medium', 'over_shoulder': 'medium', 'close': 'close',
               'extreme_close': 'close', 'insert': 'insert'}.get(s.get('shot'), 'medium')
    actors = [a for a in s.get('actors') or [] if not ANIMAL.search(a['id'].lower())]
    beasts = [a for a in s.get('actors') or [] if ANIMAL.search(a['id'].lower()) and f"{a['id']}.png" in cards]
    objects = []
    for p in s.get('props') or []:
        hit = PROP.get(p.get('kind'))
        if hit and all(o['kind'] != hit[0] for o in objects): objects.append({'kind': hit[0], 'action': hit[1]})
    if framing == 'insert' and not objects: framing = 'close' if actors else 'wide'
    plan_shot = {'set': st, 'zone': zones[i % len(zones)], 'framing': framing, 'lighting': lighting,
                 'cast': [{'id': a['id'], 'action': ACTION.get(a.get('action'), 'stand'),
                           'expression': 'talk' if a['id'] == s.get('speaker') else FACE.get(a.get('expression'), 'neutral')} for a in actors[:3]],
                 'objects': objects[:2]}
    n = max(1, s['end'] - s['start'])
    shot = compile_one(plan_shot, {'cast': plan_cast(m)}, min(12, max(0.2, n / 30)), i)
    cam = shot['camera']; f, la = cam['from'], cam['look_at']
    mv = s.get('move')
    toward = [la[k] - f[k] for k in range(3)]
    if mv == 'push_in': cam['to'] = [round(f[k] + toward[k] * 0.22, 3) for k in range(3)]
    elif mv == 'pull_back': cam['to'] = f; cam['from'] = [round(f[k] + toward[k] * 0.22, 3) for k in range(3)]
    elif mv in ('pan_left', 'pan_right', 'orbit'):
        side = -1 if mv == 'pan_left' else 1; L = math.hypot(toward[0], toward[1]) or 1
        cam['to'] = [round(f[0] - toward[1] / L * 0.8 * side, 3), round(f[1] + toward[0] / L * 0.8 * side, 3), f[2]]
    elif mv == 'whip': cam['whip_from'] = [round(f[0] + 1.5, 3), f[1], f[2]]
    else: cam['to'] = [round(f[k] + toward[k] * 0.08, 3) for k in range(3)]  # 'static' still drifts: a frozen picture fails video QA
    if st == 'mine_tunnel':
        for k in ('from', 'to', 'whip_from'):
            if k in cam: cam[k][0] = max(-0.9, min(0.9, cam[k][0]))
    if mv == 'shake' or s.get('shake'): cam['shake'] = [{'t': round(min(shot['duration'], 0.15), 3), 'amp': 0.04}]
    # Painted animal cards stand beside the people (or alone at the zone centre).
    if beasts:
        base = shot['cast'][0]['pos'] if shot['cast'] else [round((la[0] + f[0]) / 2 + (la[0] - f[0]) * 0.3, 3), round((la[1] + f[1]) / 2 + (la[1] - f[1]) * 0.3, 3)]
        shot['cards'] = [{'image': f"{b['id']}.png", 'pos': [round(base[0] + (j - (len(beasts) - 1) / 2) * 1.1 + (0.9 if shot['cast'] else 0), 3), round(base[1] + 0.4, 3)], 'height': 1.5}
                         for j, b in enumerate(beasts[:6])]
    fx = []
    for j, kind in enumerate(k for k in (s.get('fx') or []) if k in FX and FX[k] != 'rain'):
        if j >= 3: break
        fx.append({'kind': FX[kind], 'pos': [round(la[0] + 0.6 * (j - 1), 3), round(la[1] + 1.0, 3), 0], 'start': 0, 'scale': 1, 'seed': i * 7 + j})
    if 'rain' in (s.get('fx') or []): fx.append({'kind': 'rain', 'pos': [la[0], la[1], 0], 'start': 0, 'scale': 1, 'seed': i})
    if fx: shot['effects'] = fx
    if s.get('place'):  # manifest v3: the fallback path must still build the real 3D place, never the empty neutral world
        shot['place'] = compile_place(s['place'], seed=i)
        shot['lighting'] = 'rain' if s['place'].get('weather') == 'rain' else PLACE_LIGHT[s['place']['time']]
        shot.pop('backdrop', None)
    shot.update({'samples': 12, 'size': list(SCALE), 'engine': 'cycles'})
    return validate_shot(shot)


def compile_all(m, cards=()):
    return [compile_shot(m, i, cards) for i in range(len(m['shots']))]


def caption_at(m, f):
    if not m.get('captions'): return None
    W = m['words']; t = f / 30
    shot = next((s for s in m['shots'] if s['start'] <= f < s['end']), m['shots'][-1])
    i = next((k for k, w in enumerate(W) if t < w['end']), len(W) - 1)
    if t < W[0]['start'] - .1: return None
    first = next((k for k, w in enumerate(W) if round(w['start'] * 30) >= shot['start']), -1)
    if first < 0 or first > i: first = i
    g = i - ((i - first) % 3)
    last = next((k for k, w in enumerate(W) if round(w['start'] * 30) >= shot['end']), len(W))
    return [{'text': m['caption_words'][k], 'key': (k == shot['keyword']) if shot.get('keyword') is not None else k == i, 'live': k == i,
             'shown': W[k]['start'] <= t + .05} for k in range(g, min(last, g + 3))]


def burn(img, words):
    from PIL import ImageDraw, ImageFont
    shown = [w for w in words or [] if w['shown']]
    if not shown: return img
    W, H = img.size; size = round(min(W, H) * .085); y = round(H * (.82 if W > H else .7))
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', size)
    d = ImageDraw.Draw(img); texts = [w['text'].upper() for w in shown]
    widths = [d.textlength(t, font=font) for t in texts]; gap = size * .42
    total = sum(widths) + gap * (len(shown) - 1)
    if total > W * .9:
        size = max(20, int(size * W * .9 / total)); font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', size)
        widths = [d.textlength(t, font=font) for t in texts]; gap = size * .42; total = sum(widths) + gap * (len(shown) - 1)
    x = (W - total) / 2
    for w, t, wd in zip(shown, texts, widths):
        d.text((x, y), t, font=font, anchor='lm', fill=(255, 212, 0) if w['key'] else (255, 255, 255), stroke_width=max(2, round(size * .1)), stroke_fill=(0, 0, 0))
        x += wd + gap
    return img


def segments(m, cards=()):
    """Benchmark-paced setups from the art director; if planning ever fails, one legacy shot per manifest shot."""
    try:
        from art_director import plan
        return [(g['shot_index'], g['start'], g['end'], g['shot']) for g in plan(m, cards)]
    except Exception as e:  # never stop a paid render over a planning slip
        print(json.dumps({'art_director_fallback': str(e)[:300]}), flush=True)
        return [(i, s['start'], s['end'], compile_shot(m, i, cards)) for i, s in enumerate(m['shots'])]


def engine_env():
    """Eevee only where the graphics driver really runs it (BLENDER_ENGINE=eevee); otherwise Cycles on the card."""
    eng = os.environ.get('BLENDER_ENGINE', 'cycles')
    return {'SHOT_ENGINE': eng, 'CYCLES_DEVICE': os.environ.get('CYCLES_DEVICE', 'GPU')}


def render_range(manifest_path, web, out, first, last, card_dir):
    import threading
    from concurrent.futures import ThreadPoolExecutor
    from PIL import Image
    from capture import fingerprint, atomic_json, valid_frame
    m = json.loads(Path(manifest_path).read_text()); out = Path(out); out.mkdir(parents=True, exist_ok=True)
    signature = fingerprint(Path(web))
    ck = out / 'checkpoint.json'
    saved = json.loads(ck.read_text()) if ck.exists() else {'input_hash': signature, 'frames': {}}
    if saved['input_hash'] != signature: raise ValueError('Inputs changed; stale frames cannot resume')
    cards = set(os.listdir(card_dir)) if card_dir and os.path.isdir(card_dir) else set()
    blender = os.environ.get('BLENDER_BIN', '/opt/blender/blender')
    lock = threading.Lock(); eng = engine_env()
    samples = int(os.environ.get('BLENDER_SAMPLES', '16' if eng['SHOT_ENGINE'] == 'eevee' else '5'))  # Cycles + denoiser: 5 samples measured identical to 10
    jobs = []
    for k, (i, a, b, shot) in enumerate(segments(m, cards)):
        want = [f for f in range(max(first, a), min(last, b - 1) + 1) if not valid_frame(out / f'f{f:06d}.jpg', saved['frames'].get(str(f)))]
        if want: jobs.append((k, i, a, shot, want))

    def run(job):
        k, i, a, shot, want = job
        shot = dict(shot); shot['engine'] = eng['SHOT_ENGINE']; shot['samples'] = samples
        n = round(shot['duration'] * 30)
        local = {f: min(n, f - a + 1) for f in want}
        shot['frames'] = sorted(set(local.values()))
        with tempfile.TemporaryDirectory() as tmp:
            sp = Path(tmp) / 'shot.json'; sp.write_text(json.dumps(shot))
            env = {**os.environ, **eng, 'CARD_DIR': card_dir or ''}
            r = subprocess.run([blender, '-b', '--factory-startup', '--python-exit-code', '1', '--python', str(ROOT / 'blender' / 'render_shot.py'), '--', str(sp), tmp],
                               env=env, capture_output=True, text=True, timeout=1500)
            if r.returncode != 0: raise RuntimeError(f'Blender segment {k} (shot {i}) failed: {(r.stdout + r.stderr)[-1500:]}')
            for f in want:
                png = Path(tmp) / f'f_{local[f]:05d}.png'
                img = Image.open(png).convert('RGB').resize((1080, 1920), Image.LANCZOS)
                img = burn(img, caption_at(m, f))
                file = out / f'f{f:06d}.jpg'; tmpf = file.with_suffix(f'.{k}.tmp')
                img.save(tmpf, 'JPEG', quality=93)
                meta = {'sha256': hashlib.sha256(tmpf.read_bytes()).hexdigest()}
                tmpf.replace(file)
                with lock: saved['frames'][str(f)] = meta
            with lock: atomic_json(ck, saved)
            print(json.dumps({'blender_segment': k, 'shot': i, 'frames': len(want)}), flush=True)

    # Two Blender processes per machine: one builds its scene on the CPU while the other draws on the card.
    lanes = max(1, int(os.environ.get('BLENDER_LANES', '2')))
    with ThreadPoolExecutor(lanes) as pool:
        for fut in [pool.submit(run, j) for j in jobs]: fut.result()


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--manifest', required=True); p.add_argument('--web', required=True); p.add_argument('--out', required=True)
    p.add_argument('--first', type=int, required=True); p.add_argument('--last', type=int, required=True); p.add_argument('--cards', default='')
    a = p.parse_args()
    render_range(a.manifest, a.web, a.out, a.first, a.last, a.cards)
