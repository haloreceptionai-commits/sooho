"""Renders close-up test frames of the 3D cast in several actions, for design and motion review.

Usage (from hosted-renderer/cartoon): python tools/cast_sheet.py <outdir> [blender-bin]
Writes <outdir>/<action>/shot.json and frames, then runs Blender once per action.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'blender'))

ACTIONS = ['stand', 'walk', 'point', 'carry', 'cheer', 'shout']
EXPRESSIONS = {'stand': 'neutral', 'walk': 'neutral', 'point': 'happy', 'carry': 'determined', 'cheer': 'happy', 'shout': 'shock'}


def shot_for(action, outfit='worker'):
    from shot_director import compile_one, SETS
    from shot_schema import validate_shot
    sh = {'set': 'open_day', 'framing': 'medium', 'lighting': 'day', 'objects': [],   # open ground: no trunks in front of the lens
          'cast': [{'id': 'worker_a', 'action': action, 'expression': EXPRESSIONS[action]}]}
    plan = {'cast': [{'id': 'worker_a', 'outfit': outfit, 'hat': 'beanie'}]}
    shot = compile_one(sh, plan, 0.2, 0)
    x, y = shot['cast'][0]['pos']
    # three-quarter front view from the face side (the face points to -y), 6 m out so the whole figure fits. Blender space: z is up.
    shot['camera'] = {'from': [x + 4.3, y - 4.3, 1.5], 'look_at': [x, y, 1.0], 'lens': 50}
    shot.update({'duration': 0.2, 'fps': 24, 'size': [640, 360], 'samples': 16, 'engine': 'cycles'})
    return validate_shot(shot)


def main():
    out = Path(sys.argv[1]).resolve()
    blender = sys.argv[2] if len(sys.argv) > 2 else os.environ.get('BLENDER_BIN', 'blender')
    for action in ACTIONS:
        d = out / action
        d.mkdir(parents=True, exist_ok=True)
        (d / 'shot.json').write_text(json.dumps(shot_for(action)), encoding='utf-8')
        subprocess.run([blender, '-b', '--python', str(ROOT / 'blender' / 'render_shot.py'), '--',
                        str(d / 'shot.json'), str(d / 'frames')], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print(action, 'frames:', len(list((d / 'frames').glob('*.png'))) if (d / 'frames').exists() else 0, flush=True)


if __name__ == '__main__':
    main()
