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


for name, fn in (('sound library + mix', sound), ('captions + UI with the real font', ui), ('place recipes', places), ('vocabulary', words)): step(name, fn)
print(f'SELFCHECK PASSED in {time.time() - t0:.1f}s')
