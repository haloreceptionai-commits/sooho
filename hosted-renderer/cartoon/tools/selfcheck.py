"""Image self-check: run inside a built worker image (python = the venv) to prove the sound library, caption/UI templates and place builder work
with the exact numpy / Pillow / fonts that ship there. Usage: cd /usr/src/app && /opt/cartoon/venv/bin/python tools/selfcheck.py"""
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(ROOT / 'blender'))
t0 = time.time(); R = 48000


def step(name, fn):
    s = time.time(); out = fn(); print(f'ok {name} ({time.time() - s:.1f}s) {out or ""}', flush=True)


def sound():
    import numpy as np
    import sound_lib, stems
    from mix import mix_stems
    n = R * 6; cues = [{'frame': 15, 'kind': 'boing'}, {'frame': 40, 'kind': 'punch'}, {'frame': 70, 'kind': 'ding'}, {'frame': 0, 'kind': 'rain', 'end': 150}, {'frame': 30, 'kind': 'trombone'}]
    if (ROOT / 'assets' / 'sound' / 'splash.wav').exists(): cues += [{'frame': 100, 'kind': 'pour'}, {'frame': 110, 'kind': 'impact'}]   # the pinned recordings exist in the built image
    seen = []
    for mood in (None, 'lofi', 'epic', 'suspense', 'sad'):
        music, sfx = stems.synthesize(n, 120, cues, seed=5, advanced=True, mood=mood)
        assert music.shape == (n, 1) and sfx.shape == (n, 1) and np.isfinite(music).all() and np.isfinite(sfx).all()
        assert float(np.abs(sfx[R // 2:R // 2 + R]).max()) > 0          # the boing at frame 15 is audible
        voice = np.zeros((n, 1)); voice[R:R * 5, 0] = .2 * np.sin(np.arange(R * 4) * .05)
        mixed, rep = mix_stems(voice, music, sfx, R, advanced=True); assert np.isfinite(mixed).all() and float(np.abs(mixed).max()) < 1.5
        seen.append(mood or 'quirky')
    return ' '.join(seen)


def ui():
    from PIL import Image, ImageFont
    import ui_overlays as U
    f = U.font(40); assert isinstance(f, ImageFont.FreeTypeFont), 'no TrueType font in this image: captions would use the tiny bitmap fallback'
    from PIL import ImageChops
    base = Image.new('RGB', (1080, 1920), (60, 100, 150))
    for style in U.STYLES:
        im = base.copy(); U.burn_caption(im, [{'text': 'the', 'key': False, 'live': False, 'shown': True, 'age': 30}, {'text': 'army', 'key': True, 'live': True, 'shown': True, 'age': 12}], style)
        assert ImageChops.difference(im, base).getbbox(), style
    for ev in ({'kind': 'sticker', 'icon': 'shock', 'side': -1}, {'kind': 'subscribe'}, {'kind': 'chat', 'text': 'hello there', 'incoming': True}, {'kind': 'health'},
               {'kind': 'levelup'}, {'kind': 'achievement', 'text': 'Crossed the Alps'}, {'kind': 'xp', 'text': '+100 XP'}):
        im = base.copy(); U.draw(im, [{**ev, 'start': 0, 'end': 90}], 30)
        assert ImageChops.difference(im, base).getbbox(), ev['kind']
    return f'font {getattr(f, "path", "?")}'


def places():
    import place_spec
    reg = json.loads((ROOT / 'blender' / 'place-registry.json').read_text())['recipes']
    for name in reg: place_spec.compile_place({'terrain': name, 'time': 'day', 'weather': 'clear', 'seed': 1, 'dressing': []}, seed=1)
    return f'{len(reg)} recipes compile'


def words():
    import sound_words
    assert sound_words.WORD_SOUNDS['punched'] == 'punch'
    voc = json.loads((ROOT / 'vocabulary.json').read_text())['sounds']
    import sound_lib
    missing = [k for k in sound_lib.NEW_KINDS if k not in voc]
    assert not missing, missing
    return f'{len(voc)} sound kinds'


def acting():
    """The director: lines of narration become the right activity, with its props, furniture and vehicle, and the shot validates."""
    import art_director
    sys.path.insert(0, str(ROOT / 'blender'))
    def manifest(lines, cast, secs=3.5):   # a tiny manifest of our own: test files are not shipped in the image
        words, cap, shots, t = [], [], [], 0.2
        for k, line in enumerate(lines):
            start = t
            for w in line.split():
                words.append({'text': w.lower(), 'start': round(t, 3), 'end': round(t + .3, 3)}); cap.append(w); t += secs / len(line.split())
            shots.append({'start': round(start * 30) if k else 0, 'end': round(t * 30), 'world': 'landscape', 'light': 'day', 'shot': 'medium', 'move': 'static', 'mood': 'calm', 'speaker': None, 'keyword': 0,
                          'props': [], 'fx': [], 'actors': [{'id': 'major', 'action': 'idle', 'expression': 'neutral', 'slot': 'center', 'facing': 0}]})
        return {'words': words, 'caption_words': cap, 'shots': shots, 'cast': cast}
    seen = {}
    for line in ('She was baking cookies for the town.', 'He drove his red car down the highway.', 'The hacker typed on a laptop.', 'She rode her bike to school.'):
        shot = art_director.plan(manifest([line], cast=[{'id': 'major', 'outfit': 'worker'}], secs=3.5))[0]['shot']
        seen[shot['cast'][0]['action']] = len(shot.get('props', [])) + len(shot.get('rigs', []))
    assert set(seen) == {'cook', 'drive', 'type', 'ride'}, seen
    return f'{len(seen)} activities staged'


def finishing():
    """The end of the pipeline on synthetic data: black frames are repaired by the frame doctor, and finish.py encodes and passes its QA."""
    import hashlib, shutil, subprocess, tempfile
    import numpy as np
    from PIL import Image
    import frame_doctor
    if not (shutil.which('ffmpeg') and shutil.which('ffprobe')): return 'skipped (no ffmpeg here)'
    with tempfile.TemporaryDirectory() as d:
        d = Path(d); frames = d / 'frames'; frames.mkdir(); total = 60; ck = {'input_hash': 'x', 'frames': {}}
        for i in range(total):
            colour = (0, 0, 0) if 20 <= i < 24 else (90 + i, 120, 160 - i)       # four black frames in the middle
            img = Image.new('RGB', (1080, 1920), colour)
            if colour != (0, 0, 0):
                for x in range(0, 1080, 60): img.paste((255, 255, 255), (x, (i * 17) % 1900, x + 20, (i * 17) % 1900 + 20))
            p = frames / f'f{i:06d}.jpg'; img.save(p, 'JPEG', quality=92); ck['frames'][str(i)] = {'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
        (frames / 'checkpoint.json').write_text(json.dumps(ck))
        def boom(*_): raise RuntimeError('redraw unavailable')
        r = frame_doctor.heal(frames, total, boom, log=lambda *_: None)
        assert r['bad_found'] == 4 and r['copied'] == 4, r
        t = np.arange(48000 * 2) / 48000; mix = (.2 * np.sin(2 * np.pi * 220 * t) * (1 + .5 * np.sin(2 * np.pi * 3 * t)))[:, None]
        np.save(d / 'mix.npy', mix.astype('float64'))
        out = d / 'out.mp4'
        subprocess.run([sys.executable, str(ROOT / 'finish.py'), '--frames', str(frames), '--mix', str(d / 'mix.npy'), '--out', str(out)], check=True, capture_output=True, text=True)
        qa = json.loads(out.with_suffix('.qa.json').read_text())
        assert out.exists() and not qa['review_required'], qa
    return f"4 black frames repaired, encoded, QA ok ({len(qa['warnings'])} notes)"


for name, fn in (('sound library + mix', sound), ('captions + UI with the real font', ui), ('place recipes', places), ('vocabulary', words), ('acting: activities staged', acting), ('finishing: frame doctor + encode + QA', finishing)): step(name, fn)
print(f'SELFCHECK PASSED in {time.time() - t0:.1f}s')
