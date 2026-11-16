"""Isolated local still-only preview; never dispatches or completes a video job."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
from art_director import plan, text_of, spoken


def run(manifest, cards, out, blender, seconds=1200):
    out = Path(out); out.mkdir(parents=True, exist_ok=True)
    # OS lease: a concurrent preview cannot start a second renderer. No cloud
    # dispatch or paid operation exists on this path.
    import fcntl
    lock = open(out/'preview.lock','a')
    fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    m = json.loads(Path(manifest).read_text())
    from composition_rules import emotion_line, preview_frames
    segments = plan(m, set(os.listdir(cards)))
    start = time.monotonic(); results = []
    for i, g in enumerate(segments):
        folder = out / f'shot-{i+1:02d}'; folder.mkdir(exist_ok=True)
        shot = g['shot']; full_line = text_of(spoken(m, m['shots'][g['shot_index']]['start'], m['shots'][g['shot_index']]['end']))
        burst = g['notes'].get('sequence_step') == 'molasses_wave'
        shot.update(size=[270,480], samples=2, engine='cycles', frames=preview_frames(round(shot['duration']*30), burst),
                    composition={'face_max': .4, 'wave_min': .25 if burst else 0, 'emotion': emotion_line(full_line)})
        sp = folder / 'shot.json'; sp.write_text(json.dumps(shot))
        remain = seconds - (time.monotonic()-start)
        if remain < 5: raise RuntimeError('preview wall-time budget exhausted; no retry')
        with open(folder / 'render.log', 'w') as log:
            result = subprocess.run([blender, '-b', '--factory-startup', '--python-exit-code','1','--threads','4','--python',str(Path(__file__).parent/'render_shot.py'),'--',str(sp),str(folder)],
                env={**os.environ, 'CARD_DIR':str(Path(cards).resolve()),'SHOT_ENGINE':'cycles','CYCLES_DEVICE':'CPU','NO_COMPOSITE':'1'}, stdout=log, stderr=log, timeout=min(180,remain))
        if result.returncode: raise RuntimeError(f'shot {i+1} failed; see {folder}/render.log')
        results.append({'number':i+1,'source_line':g['shot_index']+1,'line':full_line,'start':g['start']/30,'end':g['end']/30,'notes':g['notes'],'frame':str(folder / f"f_{shot['frames'][0]:05d}.png"),'qa':json.loads((folder/'composition-qa.json').read_text())})
        assets = {p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(Path(cards).glob('*.png'))}
        rules_hash=hashlib.sha256((Path(__file__).parent/'composition.py').read_bytes()).hexdigest()
        (out/'results.json').write_text(json.dumps({'input_hash':hashlib.sha256(Path(manifest).read_bytes()).hexdigest(),'card_hashes':assets,'composition_hash':rules_hash,'seconds':time.monotonic()-start,'azure_jobs':0,'paid_art_calls':0,'shots':results},indent=2))
        print(f'Preview {i+1}/{len(segments)} complete',flush=True)


if __name__ == '__main__':
    p=argparse.ArgumentParser();p.add_argument('--manifest',required=True);p.add_argument('--cards',required=True);p.add_argument('--out',required=True);p.add_argument('--blender',required=True);p.add_argument('--seconds',type=int,default=1200)
    a=p.parse_args();run(a.manifest,a.cards,a.out,a.blender,a.seconds)