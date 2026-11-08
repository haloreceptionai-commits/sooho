"""A full-duration, paginated contact sheet; never only the first twenty seconds."""
import argparse
import json
from pathlib import Path
from PIL import Image, ImageDraw

def jsround(x):
    # Match JavaScript Math.round so frame counts agree with the scene validator (106.5 -> 107).
    import math
    return math.floor(x+0.5)


def preflight_frames(shots, words, total):
    frames = {0, total-1}
    for shot in shots:
        frames.update([shot['start'], shot['end']-1, (shot['start']+shot['end']-1)//2])
        for event in shot.get('events',[]):
            frame = jsround(words[event['word']]['start']*30)-event['lead']
            frames.update([frame-1,frame,frame+1])
    return sorted(f for f in frames if 0 <= f < total)

def shot_labels(m, frames):
    # Stage 7: every review frame names the sentence and direction it must illustrate.
    out={}
    texts=m.get('caption_words') or [w['text'] for w in m['words']]
    for f in frames:
        s=next(x for x in m['shots'] if x['start']<=f<x['end'])
        ws=[texts[i] for i,w in enumerate(m['words']) if s['start']<=jsround(w['start']*30)<s['end']]
        out[f]=(' '.join(ws)[:46], f"{s.get('shot','')} {s.get('move','')} {'+'.join(p['kind'] for p in s.get('props',[]))}".strip()[:46])
    return out

def sheet(folder, frames, output, labels=None):
    output.mkdir(parents=True, exist_ok=True)
    for batch_start in range(0,len(frames),12):
        batch = frames[batch_start:batch_start+12]
        columns=min(4,len(batch)); rows=(len(batch)+columns-1)//columns
        canvas = Image.new('RGB',(columns*270,rows*540),'white'); draw=ImageDraw.Draw(canvas)
        for i,f in enumerate(batch):
            file=folder/f'f{f:06d}.jpg'
            with Image.open(file) as im:
                im.load(); im=im.convert('RGB'); im.thumbnail((270,480))
                x=(i%columns)*270; y=(i//columns)*540; canvas.paste(im,(x,y))
                draw.text((x+6,y+484),f'Frame {f} / {f/30:.2f}s',fill='black')
                if labels and f in labels:
                    draw.text((x+6,y+500),labels[f][0],fill='black'); draw.text((x+6,y+516),labels[f][1],fill='#555555')
        canvas.save(output/f'sheet-{batch_start//12+1:02d}.jpg',quality=94)

if __name__ == '__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--frames',required=True); parser.add_argument('--manifest',required=True); parser.add_argument('--out',required=True)
    args=parser.parse_args(); m=json.loads(Path(args.manifest).read_text())
    total=jsround(m['narration']['samples']/48000*30)
    selected=preflight_frames(m['shots'],m['words'],total)
    sheet(Path(args.frames),selected,Path(args.out),shot_labels(m,selected))
    Path(args.out,'frames.json').write_text(json.dumps(selected))