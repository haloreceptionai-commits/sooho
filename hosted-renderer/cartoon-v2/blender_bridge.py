"""Advanced Video AI on the Blender engine: turns each locked manifest shot into a validated
declarative Blender shot (via the step-6 shot_director compiler), renders one frame batch on the
GPU, upscales to 1080x1920 and burns in the same captions as the web engine. Output files and the
checkpoint use capture.py's format and input hash, so joining, mixing and QA are unchanged.
"""
import argparse, hashlib, json, math, os, re, shutil, subprocess, sys, tempfile, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'blender'))
from animals import ANIMAL  # noqa: E402
from shot_director import compile_one, ZONES  # noqa: E402
from shot_schema import validate_shot  # noqa: E402
from place_spec import compile_place, LIGHTING as PLACE_LIGHT, smooth_story_time  # noqa: E402
import ui_overlays  # noqa: E402
import atmosphere  # noqa: E402

# Old-engine worlds -> Blender set kits (+ forced lighting).
WORLD = {'ship': ('ship_deck', None), 'storm_sea': ('ship_deck', 'rain'), 'town': ('village', None), 'market': ('street', None),
         'bridge': ('street', None), 'modern_street': ('street', None), 'lab': ('workshop', None), 'device_cutaway': ('workshop', None),
         'landscape': ('battlefield', None), 'night_camp': ('battlefield', 'night'), 'castle': ('castle', None), 'mine': ('mine_tunnel', None),
         'map': ('battlefield', None)}
LIGHT = {'day': 'day', 'golden': 'sunset', 'night_bright': 'night'}
ACTION = {'idle': 'stand', 'walk': 'walk', 'run': 'run', 'point': 'point', 'lift': 'carry', 'carry': 'carry', 'hold': 'carry', 'grab': 'carry',
          'place': 'carry', 'pour': 'pour', 'react': 'react', 'shout': 'shout', 'cower': 'crouch', 'worried': 'worry', 'wave': 'cheer',
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
SHIRTS = [[0.95, 0.32, 0.25], [0.2, 0.55, 0.95], [0.98, 0.78, 0.15], [0.2, 0.75, 0.5]]
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


CREAM = (247, 239, 217)


def dip_frames(m):
    """Frames where the LOCATION changes between consecutive shots (a different place), for the 0.4 s dip to cream."""
    def sig(sh):
        p = sh.get('place') or {}
        return (p.get('terrain'), p.get('ground'), p.get('relief'), p.get('water')) if p else (sh.get('world'),)
    shots = m['shots']
    return [b['start'] for a, b in zip(shots, shots[1:]) if sig(a) != sig(b)]


def dip_alpha(bounds, f, half=6):
    """Legacy cream dip (only when TRANSITION=dip); the benchmark cuts hard with a short whip blur instead."""
    if os.environ.get('TRANSITION') != 'dip': return 0.0
    d = min((abs(f - b) for b in bounds), default=999)
    return max(0.0, 1 - d / half) * 0.92


def whip_strength(bounds, f, half=3):
    """0..1 horizontal whip blur in the 3 frames either side of a place change (strongest on the cut)."""
    if os.environ.get('TRANSITION', 'whip') != 'whip': return 0.0
    d = min((f - b + .5 for b in bounds), key=abs, default=999)
    return max(0.0, 1 - abs(d) / half)


def whip(img, k):
    """A fast pan blur across the frame: averaged sideways copies, slightly brighter at the peak, like a whip pan between places."""
    import numpy as np
    from PIL import Image, ImageFilter
    a = np.asarray(img).astype(np.float32); W = a.shape[1]; span = int(W * .22 * k)
    if span < 4: return img
    acc = np.zeros_like(a); n = 0
    for dx in range(-span, span + 1, max(1, span // 12)):
        acc += np.roll(a, dx, axis=1); n += 1
    out = acc / n * (1 + .08 * k)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


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
             'shown': W[k]['start'] <= t + .05, 'age': f - round(W[k]['start'] * 30)} for k in range(g, min(last, g + 3))]


def burn_legacy(img, words):
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


def burn(img, words, style='bold'):
    """Caption templates (bold, pop, box, neon, karaoke): see ui_overlays.burn_caption. Never stops a paid render over a styling slip."""
    try: return ui_overlays.burn_caption(img, words, style)
    except Exception as e:
        print(json.dumps({'caption_fallback': str(e)[:200]}), flush=True); return burn_legacy(img, words)


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
    from PIL import Image, ImageFilter
    from capture import fingerprint, atomic_json, valid_frame
    m = json.loads(Path(manifest_path).read_text()); out = Path(out); out.mkdir(parents=True, exist_ok=True)
    smooth_story_time(m)
    signature = fingerprint(Path(web))
    ck = out / 'checkpoint.json'
    saved = json.loads(ck.read_text()) if ck.exists() else {'input_hash': signature, 'frames': {}}
    if saved['input_hash'] != signature: raise ValueError('Inputs changed; stale frames cannot resume')
    cards = set(os.listdir(card_dir)) if card_dir and os.path.isdir(card_dir) else set()
    bounds = dip_frames(m)
    ui_events, cap_style = [], ui_overlays.caption_style(m)
    if os.environ.get('UI_OVERLAYS', '1') != '0':
        try: ui_events = ui_overlays.plan(m)
        except Exception as e: print(json.dumps({'ui_plan_skipped': str(e)[:200]}), flush=True)
    blender = os.environ.get('BLENDER_BIN', '/opt/blender/blender')
    lock = threading.Lock(); eng = engine_env()
    samples = int(os.environ.get('BLENDER_SAMPLES', '16' if eng['SHOT_ENGINE'] == 'eevee' else '5'))  # Cycles + denoiser: 5 samples measured identical to 10
    jobs = []
    for k, (i, a, b, shot) in enumerate(segments(m, cards)):
        want = [f for f in range(max(first, a), min(last, b - 1) + 1) if not valid_frame(out / f'f{f:06d}.jpg', saved['frames'].get(str(f)))]
        if want: jobs.append((k, i, a, shot, want))

    def shot_for(job):
        k, i, a, shot, want = job
        shot = dict(shot); shot['engine'] = eng['SHOT_ENGINE']; shot['samples'] = samples
        if os.environ.get('BLENDER_SAFE') == '1':   # last-resort retry: the same shot without the extra dressing, effects and overlays
            if shot.get('place'): shot['place'] = {**shot['place'], 'items': []}
            shot['effects'] = []; shot['overlay'] = []; shot.pop('rigs', None)   # a vehicle or ladder that fails to build must never stop the video
        return shot

    def blender_run(sp, outdir, env, what):
        t_run = time.time()
        r = subprocess.run([blender, '-b', '--factory-startup', '--python-exit-code', '1', '--python', str(ROOT / 'blender' / 'render_shot.py'), '--', str(sp), str(outdir)],
                           env=env, capture_output=True, text=True, timeout=1500)
        if r.returncode != 0: raise RuntimeError(f'Blender {what} failed: {(r.stdout + r.stderr)[-1500:]}')
        stats = {}
        for line in r.stdout.splitlines():     # what the process itself reports: build time, file open time and pure drawing time
            if line.startswith('{"') and any(k in line for k in ('built_seconds', 'opened_seconds', '"frames"')):
                try: stats.update(json.loads(line))
                except ValueError: pass
        print(json.dumps({'blender_process': what[:40], 'wall': round(time.time() - t_run, 1), **stats}), flush=True)
        return r.stdout

    # The scene build (importing models, rigging, keyframing) is single-threaded CPU work that used to keep the GPU waiting. It now runs ahead on
    # spare CPU cores into a saved .blend; the GPU lanes only open the file and draw, and finished frames are post-processed on a third pool.
    cpus = os.cpu_count() or 4
    split = os.environ.get('BLEND_SPLIT', '1') != '0'
    lanes = max(1, int(os.environ.get('BLENDER_LANES', '2')))                       # GPU drawing processes
    bake_lanes = max(1, int(os.environ.get('BAKE_LANES', str(max(2, min(6, cpus - 2))))))  # CPU scene builders
    post_lanes = max(1, int(os.environ.get('POST_LANES', '3')))                      # upscale, captions, UI, JPEG
    work = Path(tempfile.mkdtemp(prefix='bridge-'))

    def bake(job):
        k = job[0]; shot = shot_for(job); d = work / f'seg-{k}'; d.mkdir(parents=True, exist_ok=True)
        (d / 'shot.json').write_text(json.dumps(shot))
        t = time.time()
        blender_run(d / 'shot.json', d, {**os.environ, **eng, 'CYCLES_DEVICE': 'CPU', 'BLEND_MODE': 'bake', 'CARD_DIR': card_dir or ''}, f'bake of segment {k}')
        print(json.dumps({'baked_segment': k, 'seconds': round(time.time() - t, 1)}), flush=True)
        return d / 'scene.blend'

    def draw(job, baked):
        """Draws the wanted frames into a fresh folder; returns (folder, shot, local frame numbers). Falls back to build-and-draw in one process if the bake failed."""
        k, i, a0, _, want = job
        shot = shot_for(job); n = round(shot['duration'] * 30)
        local = {f: min(n, f - a0 + 1) for f in want}; shot['frames'] = sorted(set(local.values()))
        tmp = Path(tempfile.mkdtemp(prefix=f'draw-{k}-', dir=work)); sp = tmp / 'shot.json'; sp.write_text(json.dumps(shot))
        env = {**os.environ, **eng, 'CARD_DIR': card_dir or ''}
        blend = None
        if baked is not None:
            try: blend = baked.result()
            except Exception as e: print(json.dumps({'bake_failed_using_single_process': k, 'why': str(e)[-300:]}), flush=True)
        if blend is not None and blend.exists():
            try: blender_run(sp, tmp, {**env, 'BLEND_MODE': 'render', 'BLEND_FILE': str(blend)}, f'draw of segment {k} (shot {i})')
            except Exception as e:
                print(json.dumps({'draw_from_blend_failed_using_single_process': k, 'why': str(e)[-300:]}), flush=True)
                blender_run(sp, tmp, env, f'segment {k} (shot {i})')
        else:
            blender_run(sp, tmp, env, f'segment {k} (shot {i})')
        return tmp, shot, local

    def post(job, drawn):
        k, i, a0, _, want = job; tmp, shot, local = drawn
        for f in want:
            img = Image.open(tmp / f'f_{local[f]:05d}.png').convert('RGB').resize((1080, 1920), Image.LANCZOS)
            # the render is drawn at 810x1440 and upscaled: a light unsharp pass puts back some of the edge detail the upscale softens
            img = img.filter(ImageFilter.UnsharpMask(radius=2, percent=70, threshold=2))
            alpha = dip_alpha(bounds, f)
            if alpha > 0: img = Image.blend(img, Image.new('RGB', img.size, CREAM), alpha)
            wk = whip_strength(bounds, f)
            if wk > 0: img = whip(img, wk)
            if os.environ.get('ATMOSPHERE', '1') != '0':
                try: img = atmosphere.draw(img, f, atmosphere.kind_for(shot), seed=i)
                except Exception as e: print(json.dumps({'atmosphere_skipped': str(e)[:160]}), flush=True)
            ev = ui_overlays.active(ui_events, f)
            if ev:
                try: img = ui_overlays.draw(img, ui_events, f, ui_overlays.target_px(shot, local[f], img.size) if ev['kind'] == 'highlight' else None)
                except Exception as e: print(json.dumps({'ui_skipped': ev['kind'], 'why': str(e)[:200]}), flush=True)
            img = burn(img, caption_at(m, f), cap_style)
            file = out / f'f{f:06d}.jpg'; tmpf = file.with_suffix(f'.{k}.tmp')
            img.save(tmpf, 'JPEG', quality=93)
            meta = {'sha256': hashlib.sha256(tmpf.read_bytes()).hexdigest()}
            tmpf.replace(file)
            with lock: saved['frames'][str(f)] = meta
        with lock: atomic_json(ck, saved)
        shutil.rmtree(tmp, ignore_errors=True); shutil.rmtree(work / f'seg-{k}', ignore_errors=True)
        print(json.dumps({'blender_segment': k, 'shot': i, 'frames': len(want)}), flush=True)

    t_all = time.time()
    try:
        with ThreadPoolExecutor(bake_lanes) as bakers, ThreadPoolExecutor(lanes) as drawers, ThreadPoolExecutor(post_lanes) as posters:
            bakes = {j[0]: bakers.submit(bake, j) for j in jobs} if split else {}
            def one(job):
                drawn = draw(job, bakes.get(job[0]))
                return posters.submit(post, job, drawn)
            for fut in [f.result() for f in [drawers.submit(one, j) for j in jobs]]: fut.result()
    finally:
        shutil.rmtree(work, ignore_errors=True)
    print(json.dumps({'bridge_seconds': round(time.time() - t_all, 1), 'segments': len(jobs), 'split': split, 'bake_lanes': bake_lanes, 'draw_lanes': lanes}), flush=True)


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--manifest', required=True); p.add_argument('--web', required=True); p.add_argument('--out', required=True)
    p.add_argument('--first', type=int, required=True); p.add_argument('--last', type=int, required=True); p.add_argument('--cards', default='')
    a = p.parse_args()
    render_range(a.manifest, a.web, a.out, a.first, a.last, a.cards)
