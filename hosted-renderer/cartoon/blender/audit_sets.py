"""Reproducible still-only benchmark audit; never imply motion from a still.

Usage: python3 audit_sets.py /tmp/rendered-sets output.json
Reuses the unchanged benchmark anchors/schema and states that repeated images
are one still, not evidence of movement. Entries map by i, never list order.
"""
import json
from pathlib import Path
import sys
import tempfile
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'benchmark'))
import vision


def audit(directory):
    paths=sorted(Path(directory).glob('*.png'))
    result=[]
    with tempfile.TemporaryDirectory(prefix='set-audit-') as temp:
        shots=[]
        for i,path in enumerate(paths):
            base=Path(temp)/f'{i}.jpg'
            with Image.open(path) as image:
                image=image.convert('RGB').resize((540,960))
                for suffix in ['', 'a', 'z']:image.save(base.with_name(base.stem+suffix+'.jpg'))
            shots.append(dict(i=i,keyframe=str(base),len=0,words='',kit=path.stem))
        vision.SYSTEM += '\nIMPORTANT: These are SET STILL TESTS. Each triptych repeats ONE identical still. Camera and action MUST be static/none; no inference of movement is permitted. Judge environment, lighting, depth and render quality only from the actual still; no characters is expected for this set-building step.'
        for start in range(0,len(shots),4):
            group=shots[start:start+4];labels=vision.call(group);by={l['i']:l for l in labels}
            for s in group:
                if s['i'] not in by or 'error' in by[s['i']]:raise RuntimeError(f'Missing valid score for {s["kit"]}')
                l=by[s['i']];l['kit']=s['kit'];l['evidence']='single_still';result.append(l)
                print(s['kit'],l['depth'],l['environment_richness'],l['render_quality'],flush=True)
    return result


if __name__=='__main__':
    Path(sys.argv[2]).write_text(json.dumps(audit(sys.argv[1]),indent=2)+'\n')