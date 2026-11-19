"""One command: topic text -> validated shot JSON -> rendered frames (optional).

    python make_world_shot.py "war at night"
    python make_world_shot.py "high street with cars" --duration 2 --render
    python make_world_shot.py --list

--render runs Blender in background mode (BLENDER_BIN, default: the Blender 4.2 install path).
Output goes to cartoon-v2/out/<slug>/ : shot.json, f_00001.png ...
"""
import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import world_topics  # noqa: E402
from shot_schema import validate_shot  # noqa: E402

PIPE = HERE.parent
DEFAULT_BLENDER = r'C:\Program Files\Blender Foundation\Blender 4.2\blender.exe'


def build(topic, duration, fps, samples, size=(1920, 1080)):
    shot = world_topics.make_shot(topic, duration=duration, fps=fps, samples=samples, size=size)
    validate_shot(shot)
    return shot


def run(shot_path, out_dir):
    blender = os.environ.get('BLENDER_BIN', DEFAULT_BLENDER)
    cmd = [blender, '-b', '--python', str(HERE / 'render_shot.py'), '--', str(shot_path), str(out_dir)]
    print('RUN', ' '.join(cmd), flush=True)
    return subprocess.call(cmd, cwd=str(HERE))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('topic', nargs='?', help='what the shot is about, e.g. "war at night"')
    ap.add_argument('--duration', type=float, default=0.4, help='seconds (0.2-12)')
    ap.add_argument('--fps', type=int, default=24, choices=[24, 25, 30])
    ap.add_argument('--samples', type=int, default=64, help='Cycles samples')
    ap.add_argument('--size', default='1920x1080', help='WxH, e.g. 960x540 for quick tests')
    ap.add_argument('--render', action='store_true', help='render the frames with Blender')
    ap.add_argument('--list', action='store_true', help='list the 61 zones and exit')
    a = ap.parse_args(argv)

    if a.list:
        for idx, name, cat in world_topics.list_zones():
            print(f'{idx:>2}  {name}  [{cat}]')
        return 0
    if not a.topic:
        ap.error('give a topic, or --list')

    plan = world_topics.resolve(a.topic)
    w_, h_ = (int(v) for v in a.size.lower().split('x'))
    shot = build(a.topic, a.duration, a.fps, a.samples, size=(w_, h_))
    slug = re.sub(r'[^a-z0-9]+', '_', a.topic.lower()).strip('_')[:60] or 'shot'
    out = PIPE / 'out' / slug
    out.mkdir(parents=True, exist_ok=True)
    shot_path = out / 'shot.json'
    shot_path.write_text(json.dumps(shot, indent=1), encoding='utf-8')

    print(f"topic: {a.topic!r}")
    print(f"zone: {plan['zone']} (matched on {plan['matched_phrase']!r})" if plan['matched'] else
          f"zone: {plan['zone']} (no keyword matched, default zone used)")
    print(f"lighting: {plan['lighting']}  road: {plan['road']}")
    print(f"shot: {shot_path}")
    if a.render:
        return run(shot_path, out)
    print('render: python make_world_shot.py "<topic>" --render   (or run render_shot.py with the shot above)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
