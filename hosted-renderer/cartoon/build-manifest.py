"""Acoustic word clock to bounded, supported declarative scenes; no guessed timing."""
import argparse, hashlib, json, re, wave, math
from pathlib import Path

def jsround(x):
    # Match JavaScript Math.round so frame counts agree with the scene validator (106.5 -> 107).
    import math
    return math.floor(x+0.5)


def build(request, alignment, voice):
    with wave.open(str(voice)) as w:
        if w.getframerate()!=48000 or w.getsampwidth()!=2: raise ValueError('Expected locked PCM48k')
        samples=w.getnframes()
    total=jsround(samples/48000*30)
    words=alignment['words']
    if not words or len(words)>600:raise ValueError('Invalid alignment size')
    previous=0
    for word in words:
        if not all(math.isfinite(word[k]) for k in ['start','end','confidence']) or word['start']<previous or word['end']<=word['start'] or word['end']>samples/48000 or not 0<=word['confidence']<=1:raise ValueError('Invalid acoustic word timing')
        previous=word['end']
    if len(request['narration'])!=len(request['direction']['scenes']):raise ValueError('Incomplete scene direction')
    normalize=lambda text: [re.sub(r"[^a-z']",'',t.lower()) for t in text.split()]
    if normalize(request['script'])!=[w['text'] for w in words]: raise ValueError('Aligned text differs from narration')
    shots=[]; index=0; start=0
    for i,(text,d) in enumerate(zip(request['narration'],request['direction']['scenes'])):
        count=len(text.split()); end_index=index+count
        if end_index>len(words):raise ValueError('Incomplete aligned narration')
        end=total if i==len(request['narration'])-1 else jsround(words[end_index]['start']*30)
        if end<=start: raise ValueError('Scene too short on acoustic clock')
        x=1.8 if d['wide'] else 1.4; z=7 if d['wide'] else 3.5
        cues=[]
        for wi in range(index,end_index):
            token=words[wi]['text']
            kind=next((k for stem,k in [('pour','pour'),('splash','splash'),('crash','impact'),('creak','creak')] if token.startswith(stem)),None)
            if kind and request['sfx']: cues.append({'word':wi,'lead':0,'kind':kind})
        shots.append({'start':start,'end':end,'world':d['world'],'light':d['light'],
          'camera':[{'frame':start,'pos':[x,1.5,z],'look':[0,1.2,0],'fov':40,'roll':0}, {'frame':end-1,'pos':[x-.2,1.5,z-.2],'look':[0,1.2,0],'fov':38,'roll':0}] if end-start>1 else [{'frame':start,'pos':[x,1.5,z],'look':[0,1.2,0],'fov':40,'roll':0}],
          'actors':[{'id':d['actor'],'pos':[0,0,0],'expression':d['expression'],'action':d['action']}], 'events':cues})
        index=end_index;start=end
    if index!=len(words):raise ValueError('Scenes must cover every aligned word')
    return {'version':'cartoon-v1','videoId':request['videoId'],'fps':30,'width':1080,'height':1920,'captions':False,
      'narration':{'path':'voice.wav','sha256':hashlib.sha256(voice.read_bytes()).hexdigest(),'samples':samples,'rate':48000},
      'words':words,'cast':request['direction']['cast'],'shots':shots}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--request',required=True);p.add_argument('--alignment',required=True);p.add_argument('--voice',required=True);p.add_argument('--out',required=True)
    a=p.parse_args();m=build(json.loads(Path(a.request).read_text()),json.loads(Path(a.alignment).read_text()),Path(a.voice));Path(a.out).write_text(json.dumps(m))