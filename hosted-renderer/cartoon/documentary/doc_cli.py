"""Command line steps of the documentary worker. Each step reads and writes plain files so the Node orchestrator can run them on any machine.

  timeline  --manifest m.json --aligned-dir D --out timeline.json
  depth     --image img.jpg --out depth.png
  shard     --manifest m.json --timeline t.json --images D --depth D --first N --last N --out part.mp4 [--captions 0]
  audio     --manifest m.json --timeline t.json --takes-dir D --out audio.m4a --stats stats.json [--workers 3]
  join      --parts a.mp4 b.mp4 ... --audio audio.m4a --out final.mp4 --duration S
"""
import argparse
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cv2  # noqa: E402

FFMPEG = os.environ.get('FFMPEG') or 'ffmpeg'


def load(path):
    return json.load(open(path, encoding='utf8'))


def cmd_timeline(a):
    import doc_timeline as T
    m = load(a.manifest)
    aligned, durations = [], []
    for k in range(len(m['voice'])):
        r = load(os.path.join(a.aligned_dir, f'aligned-{k}.json'))
        aligned.append(r['scenes'])
        durations.append(float(r['duration']))
    tl = T.build(m, aligned, durations)
    tl.pop('_starts', None)
    json.dump(tl, open(a.out, 'w'))
    print(json.dumps({'duration': tl['duration'], 'frames': tl['frames'], 'beats': len(tl['beats'])}))


def cmd_depth(a):
    from doc_camera import estimate_depth, pack_depth, model_available
    img = cv2.imread(a.image, cv2.IMREAD_COLOR)
    if img is None:
        raise SystemExit('Picture could not be read')
    d = estimate_depth(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    cv2.imwrite(a.out, pack_depth(d))
    print(json.dumps({'depth': a.out, 'model': model_available()}))


def cmd_shard(a):
    import doc_render as R
    from doc_frame import Composer
    m, tl = load(a.manifest), load(a.timeline)
    W, H = int(m.get('width', 1920)), int(m.get('height', 1080))
    beats = R.beats_in_range(tl, a.first, a.last)
    shots = R.load_shots(m, a.images, a.depth, W, H, R.pictures_for(tl, beats))
    R.encode_range(Composer(m, tl, shots, W, H, bool(a.captions)), a.first, min(a.last, tl['frames'] - 1), a.out)
    print(json.dumps({'first': a.first, 'last': a.last}))


def cmd_audio(a):
    import doc_audio as A
    m, tl = load(a.manifest), load(a.timeline)
    takes = [A.read_wav(os.path.join(a.takes_dir, f'take-{k}.wav')) for k in range(len(m['voice']))]
    mix, report = A.build(m, tl, takes, workers=a.workers)
    raw = a.out + '.raw.wav'
    A.write_wav(raw, mix)
    norm = a.out + '.norm.wav'
    stats = A.loudnorm(raw, norm)
    r = subprocess.run([FFMPEG, '-y', '-hide_banner', '-loglevel', 'error', '-i', norm, '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', a.out], capture_output=True)
    if r.returncode != 0:
        raise SystemExit('Audio encode failed: ' + r.stderr.decode(errors='replace')[-300:])
    json.dump({**stats, **report}, open(a.stats, 'w'))
    print(json.dumps(stats))


def cmd_join(a):
    import doc_render as R
    R.join_parts(a.parts, a.audio, a.out, a.duration)
    print(json.dumps({'out': a.out}))


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('timeline'); p.add_argument('--manifest', required=True); p.add_argument('--aligned-dir', required=True); p.add_argument('--out', required=True); p.set_defaults(fn=cmd_timeline)
    p = sub.add_parser('depth'); p.add_argument('--image', required=True); p.add_argument('--out', required=True); p.set_defaults(fn=cmd_depth)
    p = sub.add_parser('shard')
    for n in ('manifest', 'timeline', 'images', 'depth', 'out'):
        p.add_argument('--' + n, required=True)
    p.add_argument('--first', type=int, required=True); p.add_argument('--last', type=int, required=True); p.add_argument('--captions', type=int, default=1); p.set_defaults(fn=cmd_shard)
    p = sub.add_parser('audio')
    for n in ('manifest', 'timeline', 'takes-dir', 'out', 'stats'):
        p.add_argument('--' + n, required=True)
    p.add_argument('--workers', type=int, default=3); p.set_defaults(fn=cmd_audio)
    p = sub.add_parser('join'); p.add_argument('--parts', nargs='+', required=True); p.add_argument('--audio', required=True); p.add_argument('--out', required=True)
    p.add_argument('--duration', type=float, required=True); p.set_defaults(fn=cmd_join)
    a = ap.parse_args()
    a.fn(a)


if __name__ == '__main__':
    main()
