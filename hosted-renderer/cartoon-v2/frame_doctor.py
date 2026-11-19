"""Frame doctor: the last line of defence before the paid video is encoded.
A frame that came out black (a crashed or glitched draw) must never fail a finished render at 95%. The doctor finds such frames, draws them
again with the gentlest settings, and only if that also fails copies the nearest good neighbour in, so the video always completes.
Usage: python frame_doctor.py --frames DIR --manifest M --web WEB --cards CARDS --bridge blender_bridge.py [--python PY]
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

DARK_MEAN, DARK_STD = 10.0, 8.0       # a frame this dark and this flat is a failed draw, not a night scene (night frames are lifted to stay readable)


def is_bad(path):
    """True when the frame is unreadable, or nearly black and flat."""
    import numpy as np
    from PIL import Image
    try:
        with Image.open(path) as im: a = np.asarray(im.convert('L').resize((108, 192)), dtype=float)
    except Exception:
        return True
    return bool(a.mean() < DARK_MEAN and a.std() < DARK_STD)


def groups(frames):
    """Consecutive frame numbers as (first, last) ranges."""
    out = []
    for f in sorted(frames):
        if out and f == out[-1][1] + 1: out[-1][1] = f
        else: out.append([f, f])
    return [tuple(g) for g in out]


def scan(folder, total):
    return [f for f in range(total) if is_bad(folder / f'f{f:06d}.jpg')]


def replace_with_neighbours(folder, checkpoint, bad, total):
    """Copies the nearest good frame (the one before, else the one after) over each remaining bad frame and updates the checkpoint hash."""
    badset = set(bad); done = []
    for f in sorted(bad):
        src = next((g for g in range(f - 1, -1, -1) if g not in badset), None)
        if src is None: src = next((g for g in range(f + 1, total) if g not in badset), None)
        if src is None: raise ValueError('Every frame is black; nothing to repair from')
        data = (folder / f'f{src:06d}.jpg').read_bytes()
        (folder / f'f{f:06d}.jpg').write_bytes(data)
        checkpoint['frames'][str(f)] = {'sha256': hashlib.sha256(data).hexdigest()}
        done.append((f, src))
    return done


def heal(folder, total, rerender, log=print):
    """folder holds f%06d.jpg and checkpoint.json. rerender(first, last, outdir) must draw that range gently into outdir (f%06d.jpg + checkpoint.json)."""
    ck = json.loads((folder / 'checkpoint.json').read_text())
    bad = scan(folder, total)
    report = {'bad_found': len(bad), 'redrawn': 0, 'copied': 0}
    if not bad: return report
    log(json.dumps({'frame_doctor': 'bad frames', 'count': len(bad), 'ranges': groups(bad)[:12]}))
    for first, last in groups(bad):
        with tempfile.TemporaryDirectory() as tmp:
            try: rerender(first, last, Path(tmp))
            except Exception as e: log(json.dumps({'frame_doctor': 'redraw failed', 'range': [first, last], 'error': str(e)[-200:]})); continue
            fix = {}
            try: fix = json.loads((Path(tmp) / 'checkpoint.json').read_text()).get('frames', {})
            except Exception: pass
            for f in range(first, last + 1):
                p = Path(tmp) / f'f{f:06d}.jpg'
                if p.exists() and not is_bad(p):
                    data = p.read_bytes(); (folder / f'f{f:06d}.jpg').write_bytes(data)
                    ck['frames'][str(f)] = fix.get(str(f)) or {'sha256': hashlib.sha256(data).hexdigest()}; report['redrawn'] += 1
    left = scan(folder, total)
    if left:
        report['copied'] = len(replace_with_neighbours(folder, ck, left, total))
        log(json.dumps({'frame_doctor': 'copied neighbours', 'count': report['copied']}))
    (folder / 'checkpoint.json').write_text(json.dumps(ck))
    log(json.dumps({'frame_doctor': 'done', **report}))
    return report


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--frames', required=True); p.add_argument('--manifest', default=''); p.add_argument('--web', default=''); p.add_argument('--cards', default='')
    p.add_argument('--bridge', default=''); p.add_argument('--python', default=sys.executable)
    a = p.parse_args()
    folder = Path(a.frames); total = max(int(k) for k in json.loads((folder / 'checkpoint.json').read_text())['frames']) + 1

    def rerender(first, last, out):
        if not a.bridge: raise RuntimeError('no Blender bridge: copying neighbours instead')
        env = {**os.environ, 'BLENDER_SAFE': '1', 'BLENDER_SAMPLES': '3', 'BLENDER_LANES': '1'}
        subprocess.run([a.python, a.bridge, '--manifest', a.manifest, '--web', a.web, '--out', str(out), '--first', str(first), '--last', str(last), '--cards', a.cards], check=True, env=env, capture_output=True, text=True, timeout=1500)
    heal(folder, total, rerender)


if __name__ == '__main__': main()
