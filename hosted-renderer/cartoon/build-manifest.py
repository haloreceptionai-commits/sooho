"""Acoustic word clock to bounded, supported declarative scenes; no guessed timing."""
import argparse, hashlib, json, re, wave, math
from pathlib import Path
from camera_fit import fit_camera_keys

def jsround(x):
    # Match JavaScript Math.round so frame counts agree with the scene validator (106.5 -> 107).
    import math
    return math.floor(x+0.5)


def build(request, alignment, voice):
    with wave.open(str(voice)) as w:
        if w.getframerate()!=48000 or w.getsampwidth()!=2: raise ValueError('Expected locked PCM48k')
        samples=w.getnframes()
    total=jsround(samples/48000*30)
    global ASPECT, ADVANCED
    ASPECT=16/9 if request.get('format')=='long' else 9/16
    ADVANCED=any(c.get('card') for c in request['direction'].get('cast',[]))
    words=alignment['words']
    if not words or len(words)>(9000 if request.get('format')=='long' else 600):raise ValueError('Invalid alignment size')
    previous=0
    for word in words:
        if not all(math.isfinite(word[k]) for k in ['start','end','confidence']) or word['start']<previous or word['end']<=word['start'] or word['end']>samples/48000 or not 0<=word['confidence']<=1:raise ValueError('Invalid acoustic word timing')
        previous=word['end']
    if len(request['narration'])!=len(request['direction']['scenes']):raise ValueError('Incomplete scene direction')
    normalize=lambda text: [re.sub(r"[^a-z']",'',t.lower()) for t in text.split()]
    if normalize(request['script'])!=[w['text'] for w in words]: raise ValueError('Aligned text differs from narration')
    tokens=request['script'].split()
    shots=[]; index=0; start=0
    for i,(text,d) in enumerate(zip(request['narration'],request['direction']['scenes'])):
        count=len(text.split()); end_index=index+count
        if end_index>len(words):raise ValueError('Incomplete aligned narration')
        end=total if i==len(request['narration'])-1 else jsround(words[end_index]['start']*30)
        if end<=start: raise ValueError('Scene too short on acoustic clock')
        shots.extend(sentence_shots(d,words,index,end_index,start,end,request['sfx'],shots[-1]['shot'] if shots else None))
        index=end_index;start=end
    if index!=len(words):raise ValueError('Scenes must cover every aligned word')
    width,height=(1920,1080) if request.get('format')=='long' else (1080,1920)
    return {'version':'cartoon-v2','videoId':request['videoId'],'fps':30,'width':width,'height':height,'captions':bool(request.get('captions')),
      'narration':{'path':'voice.wav','sha256':hashlib.sha256(voice.read_bytes()).hexdigest(),'samples':samples,'rate':48000},
      'words':words,'caption_words':[t[:40] for t in tokens],'cast':request['direction']['cast'],'shots':shots}

ASPECT=9/16
ADVANCED=False
SLOT_X={'left':-1.15,'center':0.0,'right':1.15}
# distance, camera height, look height, field of view (metres / degrees) for a 2.25 m character card.
SHOT={'wide':(7.5,1.8,1.2,42),'medium':(4.2,1.5,1.25,38),'close':(2.5,1.75,1.65,34),'extreme_close':(1.55,1.85,1.8,30),
      'low':(3.3,.35,1.5,44),'high':(5.2,4.6,.8,40),'over_shoulder':(2.6,1.65,1.6,36),'insert':(1.7,1.3,1.1,32)}
AUTO_SOUNDS=[('pour','pour'),('splash','splash'),('crash','impact'),('creak','creak'),('thunder','thunder'),('storm','wind'),('bell','bell'),('coin','coin'),('gold','coin'),('boom','impact'),('cannon','impact'),('crowd','crowd')]
REACTION={'wide':'close','medium':'close','close':'medium','extreme_close':'medium','low':'close','high':'medium','over_shoulder':'close','insert':'medium'}

def performers(d):
    cast=d.get('actors') or [{'actor':d['actor'],'action':d['action'],'expression':d['expression'],'slot':'center','facing':0}]
    if len(cast)==1 and not d.get('actors'): cast=[{**cast[0],'slot':'center'}]
    # Two performers stand closer so both fit the narrow 9:16 frame.
    spread={1:0,2:.72,3:1.05}[len(cast)]*(1.8 if ASPECT>1 else 1)
    xs={'left':-spread,'center':0.0,'right':spread} if len(cast)>1 else {'left':0.0,'center':0.0,'right':0.0}
    return [{'id':a['actor'],'pos':[xs[a['slot']],0,0],'expression':a['expression'],'action':a['action'],'facing':a.get('facing',0)} for a in cast]

def camera_keys(kind,move,subject,others,start,end,props):
    dist,height,look_y,fov=SHOT[kind]
    sx=subject['pos'][0]
    # Group framing: aim between performers and back off until all fit the horizontal field of view.
    if others and kind in('wide','medium','low','high'):
        xs=[subject['pos'][0]]+[o['pos'][0] for o in others]; sx=(min(xs)+max(xs))/2
        half=(max(xs)-min(xs))/2+.55; hfov=2*math.atan(math.tan(math.radians(fov)/2)*ASPECT)
        dist=max(dist,half/math.tan(hfov/2))
    look=[sx,look_y,0]
    if kind=='insert':
        held=any(p['place']=='hand' for p in props)
        ground=next((p for p in props if p['place'] in('ground_left','ground_right')),None)
        if held: look=[sx+.35,1.15,0]
        elif ground: look=[-.95 if ground['place']=='ground_left' else .95,.45,.7]
        else:
            dist,height,look_y,fov=SHOT['close']; look=[sx,look_y,0]  # nothing to insert: a reaction close-up
    side=.25 if sx<=0 else -.25
    if kind=='over_shoulder' and others: side=max(-1.2,min(1.2,others[0]['pos'][0]-sx))*.6
    def at(d,yaw=0.,dx=0.,lk=None):
        l=lk or look
        return {'pos':[round(l[0]+side+dx+math.sin(yaw)*d,3),height,round(math.cos(yaw)*d,3)],'look':[round(v,3) for v in l],'fov':fov,'roll':0}
    n=end-start
    if move=='pull_back': a,b=at(dist*.78),at(dist*1.3)
    elif move=='pan_left': a,b=at(dist,dx=.9),at(dist,dx=-.6)
    elif move=='pan_right': a,b=at(dist,dx=-.9),at(dist,dx=.6)
    elif move=='orbit': a,b=at(dist,yaw=-.35),at(dist,yaw=.35)
    elif move in('static','shake'): a,b=at(dist),at(dist*.97)
    else: a,b=at(dist*1.12),at(dist*.86)
    if n<=1: return [{'frame':start,**a}]
    keys=[{'frame':start,**a},{'frame':end-1,**b}]
    if move=='whip' and n>10:
        swing=at(dist*1.05,lk=[look[0]+3.2,look[1],look[2]-1])
        keys=[{'frame':start,**swing},{'frame':start+6,**at(dist*1.05)},{'frame':end-1,**at(dist*.9)}]
    return keys

def map_camera(m,move,start,end,battle):
    """Macro events: high orbiting view. Battles: low dramatic dolly toward the front line."""
    lon,lat,zoom=m['focus']; span=60/zoom*.5; x,z=lon*.5,-lat*.5
    h=span*(.95 if battle else 1.35); back=span*(.75 if battle else .42); fov=38 if battle else 40
    def at(k=1.,dx=0.):return {'pos':[round(x+dx,3),round(h*k,3),round(z+back*k,3)],'look':[round(x+dx*.4,3),0,round(z-span*.08,3)],'fov':fov,'roll':0}
    if move=='pull_back':a,b=at(.82),at(1.08)
    elif move in('pan_left','orbit'):a,b=at(1,span*.12),at(.95,-span*.12)
    elif move=='pan_right':a,b=at(1,-span*.12),at(.95,span*.12)
    else:a,b=at(1.08),at(.84)  # slow push-in by default
    return [{'frame':start,**a},{'frame':max(start+1,end-1),**b}] if end-start>1 else [{'frame':start,**a}]

def map_shots(d,words,first,last,start,end,sfx):
    m=d['map']; battle=bool(m.get('armies'))
    move=d.get('move') or ('push_in' if battle else 'orbit'); mood=d.get('mood') or ('tense' if battle else 'calm')
    events=[]
    if sfx:
        for wi in range(first,last):
            kind_s=next((k for stem,k in AUTO_SOUNDS if words[wi]['text'].startswith(stem)),None)
            if kind_s and len(events)<30: events.append({'word':wi,'lead':0,'kind':kind_s})
        if m.get('reveal')=='grow' and not any(e['word']==first for e in events): events.insert(0,{'word':first,'lead':0,'kind':'reveal'})
    shot={'world':'map','light':'day','shot':'high' if not battle else 'low','move':move,'mood':mood,'shake':0,'speaker':None,'keyword':None,
      'props':[],'fx':[],'actors':[],'map':{k:m[k] for k in ('regions','focus','reveal','label','years','cities','armies') if k in m}}
    return [{'start':start,'end':end,**shot,'camera':map_camera(m,move,start,end,battle),'events':events[:30]}]

def sentence_shots(d,words,first,last,start,end,sfx,previous):
    if d.get('world')=='map': return map_shots(d,words,first,last,start,end,sfx)
    actors=performers(d); props=d.get('props') or []
    speaker=d.get('speaker'); ids=[a['id'] for a in actors]
    subject=next((a for a in actors if a['id']==speaker),None) or next((a for a in actors if a['id']==d['actor']),actors[0])
    others=[a for a in actors if a is not subject]
    kind=d.get('shot') or ('wide' if d['wide'] else 'medium')
    if kind==previous and not ADVANCED: kind=REACTION[kind]  # legacy edit rhythm
    move=d.get('move') or 'push_in'; mood=d.get('mood') or 'calm'
    # Long sentences get a second angle on a word boundary, keeping the ~3 s cutting rhythm.
    cuts=[start]
    if end-start>132 and last-first>=4:
        mid=start+(end-start)//2
        wi=min(range(first+1,last),key=lambda k:abs(jsround(words[k]['start']*30)-mid))
        f=jsround(words[wi]['start']*30)
        if start+30<=f<=end-30: cuts.append(f)
    cuts.append(end)
    keyword=None
    if d.get('keyword'):
        want=re.sub(r"[^a-z']",'',d['keyword'].lower())
        keyword=next((k for k in range(first,last) if words[k]['text']==want),None)
    events=[]
    if sfx:
        for c in d.get('cues') or []:
            if first+c['word']<last: events.append({'word':first+c['word'],'lead':0,'kind':c['kind']})
        for wi in range(first,last):
            kind_s=next((k for stem,k in AUTO_SOUNDS if words[wi]['text'].startswith(stem) and not (ADVANCED and stem in ('gold','coin','storm','crowd'))),None)
            if kind_s: events.append({'word':wi,'lead':0,'kind':kind_s})
        if mood=='reveal': events.append({'word':first,'lead':0,'kind':'reveal'})
        if move=='whip': events.append({'word':first,'lead':0,'kind':'whoosh'})
        if move=='shake': events.append({'word':first,'lead':0,'kind':'impact'})
    seen=set(); unique=[]
    for e in events:
        if e['word'] not in seen and len(unique)<30: seen.add(e['word']); unique.append(e)
    out=[]
    for n,(a,b) in enumerate(zip(cuts,cuts[1:])):
        k=kind if n==0 else REACTION[kind]; mv=move if n==0 else ('push_in' if move!='push_in' else 'static')
        mine=[e for e in unique if a<=jsround(words[e['word']]['start']*30)-e['lead']<b]
        camera=camera_keys(k,mv,subject,others,a,b,props)
        if ADVANCED and k!='insert':
            targets=actors if k in ('wide','medium','low','high') else [subject]
            camera=fit_camera_keys(camera,targets,ASPECT,full_body=k in ('wide','medium','low','high'))
        out.append({'start':a,'end':b,'world':d['world'],'light':d['light'],'shot':k,'move':mv,'mood':mood,
          'shake':.6 if mv=='shake' else (.25 if 'lightning' in (d.get('fx') or []) else 0),
          'speaker':speaker if speaker in ids else None,'keyword':keyword,'props':props,'fx':d.get('fx') or [],
          'camera':camera,'actors':actors,'events':mine})
    return out

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--request',required=True);p.add_argument('--alignment',required=True);p.add_argument('--voice',required=True);p.add_argument('--out',required=True)
    a=p.parse_args();m=build(json.loads(Path(a.request).read_text()),json.loads(Path(a.alignment).read_text()),Path(a.voice));Path(a.out).write_text(json.dumps(m))