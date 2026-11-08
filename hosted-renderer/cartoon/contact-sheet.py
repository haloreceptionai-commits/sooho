"""A full-duration, paginated contact sheet; never only the first twenty seconds."""
import argparse
import json
from pathlib import Path
from PIL import Image, ImageDraw

def preflight_frames(shots, words, total):
    frames = {0, total-1}
    for shot in shots:
        frames.update([shot['start'], shot['end']-1, (shot['start']+shot['end']-1)//2])
        for event in shot.get('events',[]):
            frame = round(words[event['word']]['start']*30)-event['lead']
            frames.update([frame-1,frame,frame+1])
    return sorted(f for f in frames if 0 <= f < total)

def sheet(folder, frames, output):
    output.mkdir(parents=True, exist_ok=True)
    for batch_start in range(0,len(frames),12):
        batch = frames[batch_start:batch_start+12]
        canvas = Image.new('RGB',(4*270,3*510),'white'); draw=ImageDraw.Draw(canvas)
        for i,f in enumerate(batch):
            file=folder/f'f{f:06d}.jpg'
            with Image.open(file) as im:
                im.load(); im=im.convert('RGB'); im.thumbnail((270,480))
                x=(i%4)*270; y=(i//4)*510; canvas.paste(im,(x,y))
                draw.text((x+6,y+484),f'Frame {f} / {f/30:.2f}s',fill='black')
        canvas.save(output/f'sheet-{batch_start//12+1:02d}.jpg',quality=94)

if __name__ == '__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--frames',required=True); parser.add_argument('--manifest',required=True); parser.add_argument('--out',required=True)
    args=parser.parse_args(); m=json.loads(Path(args.manifest).read_text())
    total=round(m['narration']['samples']/48000*30)
    selected=preflight_frames(m['shots'],m['words'],total)
    sheet(Path(args.frames),selected,Path(args.out))
    Path(args.out,'frames.json').write_text(json.dumps(selected))