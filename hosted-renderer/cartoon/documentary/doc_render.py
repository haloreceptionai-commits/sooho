"""Renders ranges of documentary frames to H.264 pieces, and joins the pieces. Driven by doc_cli.py (worker) and by the local tests."""
import os
import subprocess
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from doc_camera import StillShot, estimate_depth, pack_depth, unpack_depth  # noqa: E402
from doc_frame import Composer  # noqa: E402
from doc_timeline import FPS  # noqa: E402

FFMPEG = os.environ.get('FFMPEG') or 'ffmpeg'


def read_rgb(path):
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f'Picture could not be read: {os.path.basename(path)}')
    return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)


def load_shots(manifest, images_dir, depth_dir, W, H, needed=None):
    """One StillShot per picture the shard needs (depth read from the saved maps; estimated only when a map is missing)."""
    shots = {}
    for i in sorted(needed if needed is not None else range(len(manifest['images']))):
        img = read_rgb(os.path.join(images_dir, f'img-{i}.jpg'))
        dpath = os.path.join(depth_dir, f'depth-{i}.png')
        if os.path.exists(dpath):
            d = unpack_depth(cv2.imread(dpath, cv2.IMREAD_UNCHANGED))
            if d.shape[:2] != img.shape[:2]:
                d = cv2.resize(d, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_CUBIC)
        else:
            d = estimate_depth(img)
        shots[i] = StillShot(img, d, W, H)
    return shots


def beats_in_range(timeline, first, last):
    t0, t1 = first / FPS, (last + 1) / FPS
    used = set()
    for bi, b in enumerate(timeline['beats']):
        if b['end'] > t0 - 1.5 and b['start'] < t1 + .5:   # a little either side for transitions
            used.add(bi)
    return used


def pictures_for(timeline, beats):
    need = set()
    for bi in beats:
        v = timeline['beats'][bi]['visual']
        if v['type'] == 'image':
            need.add(v['src'])
        elif v.get('bg') is not None:
            need.add(v['bg'])
        if bi > 0:
            pv = timeline['beats'][bi - 1]['visual']
            if pv['type'] == 'image':
                need.add(pv['src'])
            elif pv.get('bg') is not None:
                need.add(pv['bg'])
    return need


def encode_range(composer, first, last, out_path, crf=23, preset='veryfast'):
    W, H = composer.W, composer.H
    cmd = [FFMPEG, '-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
           '-an', '-c:v', 'libx264', '-preset', preset, '-crf', str(crf), '-maxrate', '6M', '-bufsize', '12M', '-pix_fmt', 'yuv420p', '-g', str(FPS * 2), '-keyint_min', str(FPS * 2), '-sc_threshold', '0',
           '-movflags', '+faststart', out_path]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        for i in range(first, last + 1):
            p.stdin.write(np.ascontiguousarray(composer.frame(i)).tobytes())
        p.stdin.close()
        err = p.stderr.read().decode(errors='replace')
        if p.wait() != 0:
            raise RuntimeError('Video encoder failed: ' + err[-300:])
    finally:
        if p.poll() is None:
            p.kill()


def join_parts(parts, audio, out_path, duration):
    """Joins encoded pieces without re-encoding and adds the finished soundtrack."""
    listing = out_path + '.parts.txt'
    with open(listing, 'w', encoding='utf8') as f:
        for part in parts:
            f.write("file '" + part.replace('\\', '/').replace("'", "'\\''") + "'\n")
    cmd = [FFMPEG, '-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listing, '-i', audio, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy',
           *(['-c:a', 'copy'] if audio.endswith('.m4a') else ['-c:a', 'aac', '-b:a', '256k', '-ar', '48000']), '-t', f'{duration:.3f}', '-movflags', '+faststart', out_path]
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0:
        raise RuntimeError('Join failed: ' + r.stderr.decode(errors='replace')[-300:])
