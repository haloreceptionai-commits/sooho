"""Deterministic stem-only synthesis on the accepted narration sample clock."""
import argparse
import json
import wave
from pathlib import Path
import numpy as np
import sound_lib as lib

def jsround(x):
    # Match JavaScript Math.round so frame counts agree with the scene validator (106.5 -> 107).
    import math
    return math.floor(x+0.5)


RATE = 48000
LEGACY_KINDS = {'whoosh', 'impact', 'creak', 'pour', 'splash', 'reveal', 'thunder', 'bell', 'coin', 'wind', 'crowd', 'pop'}
KINDS = LEGACY_KINDS | set(lib.NEW_KINDS)   # the original web engine only ever plays the first twelve; the Advanced engine plays all of them

def synthesize(samples, twist_frame, cues, seed=1, advanced=False, mood=None):
    if not isinstance(samples, int) or samples <= 0:
        raise ValueError('Invalid narration samples')
    total = jsround(samples / RATE * 30)
    if not isinstance(twist_frame, int) or not 0 <= twist_frame < total:
        raise ValueError('Twist must be inside the locked timeline')
    rng = np.random.default_rng(seed)
    if advanced:
        return sound_design(samples,twist_frame,cues,seed,mood)
    music = np.zeros(samples, dtype=np.float64)
    sfx = np.zeros(samples, dtype=np.float64)
    twist = min(samples, jsround(twist_frame * RATE / 30))
    # Soft background bed: low warm chord pads only. No sustained mid/high sine (the old 220/440 Hz tone read
    # as a constant beep) and no repeating clicks; a filtered-noise riser builds tension in the hook.
    t = np.arange(samples) / RATE
    def pad(freqs, tt):
        out = np.zeros_like(tt)
        for i, f in enumerate(freqs):
            out += (np.sin(2*np.pi*f*tt) + .25*np.sin(2*np.pi*2*f*tt)) * (.75 + .25*np.sin(2*np.pi*(.07+.03*i)*tt + i))
        return out / len(freqs)
    music[:twist] = .05 * pad([110., 130.8128, 164.8138], t[:twist])
    music[twist:] = .05 * pad([130.8128, 164.8138, 195.9977], t[twist:] - (t[twist] if twist < samples else 0))
    fade = int(.08*RATE)
    if 0 < twist < samples:
        w = np.linspace(0, 1, min(fade, samples-twist)); music[twist:twist+len(w)] *= w
    n = min(samples, int(3*RATE))
    if n:
        rt = np.arange(n)/RATE
        riser = np.convolve(rng.standard_normal(n), np.ones(48)/48, 'same') * 3 * (rt/3)**2
        riser += .03*np.sin(2*np.pi*(55*rt + 20*rt**2)) * (rt/3)
        music[:n] += .06*riser
    edge = min(samples, int(.05*RATE)); music[:edge] *= np.linspace(0, 1, edge)
    music[samples-edge:] *= np.linspace(1, 0, edge)
    # Gemini guide: always land an impact on the twist beat.
    if 0 < twist < samples and not any(c.get('kind') == 'impact' and abs(c.get('frame', -99) - twist_frame) < 6 for c in cues):
        cues = list(cues) + [{'frame': twist_frame, 'kind': 'impact'}]
    for index, cue in enumerate(cues):
        if cue['kind'] not in KINDS or not isinstance(cue['frame'], int) or not 0 <= cue['frame'] < total:
            raise ValueError('Invalid sound cue')
        start = jsround(cue['frame']*RATE/30); n = min(int(.32*RATE), samples-start)
        ct = np.arange(n)/RATE
        noise = np.random.default_rng(seed*1000+index).standard_normal(n)
        envelope = np.sin(np.pi*np.minimum(1, ct/.32))**2
        kind = cue['kind']
        if kind not in LEGACY_KINDS: continue
        if kind in ('pour', 'splash', 'whoosh'):
            sound = .15*noise*envelope
        elif kind == 'creak':
            sound = .15*np.sin(2*np.pi*(160*ct+90*ct**2))*envelope
        elif kind == 'thunder':
            sound = .28*np.convolve(noise, np.ones(240)/240, 'same')*np.exp(-ct*4)*8 + .2*np.sin(2*np.pi*42*ct)*np.exp(-ct*6)
        elif kind == 'wind':
            sound = .1*np.convolve(noise, np.ones(60)/60, 'same')*envelope*6
        elif kind == 'crowd':
            sound = .08*np.convolve(noise, np.ones(30)/30, 'same')*envelope*5*(1+.5*np.sin(2*np.pi*3*ct))
        elif kind == 'bell':
            sound = .14*(np.sin(2*np.pi*660*ct)+.6*np.sin(2*np.pi*1650*ct)+.3*np.sin(2*np.pi*2310*ct))*np.exp(-ct*6)
        elif kind == 'coin':
            sound = .12*(np.sin(2*np.pi*2400*ct)+.7*np.sin(2*np.pi*3600*ct))*np.exp(-ct*25)
        elif kind == 'pop':
            sound = .2*np.sin(2*np.pi*(500-900*ct)*ct)*np.exp(-ct*45)
        elif kind == 'impact':
            sound = .3*np.sin(2*np.pi*58*ct)*np.exp(-ct*20)+.06*noise*np.exp(-ct*40)
        else:
            sound = .16*(np.sin(2*np.pi*880*ct)+.5*np.sin(2*np.pi*1320*ct))*np.exp(-ct*12)
        sfx[start:start+n] += sound
    return music[:,None], sfx[:,None]

def sound_design(samples,twist_frame,cues,seed=1,mood=None):
    """Music bed (the original staccato score or a mood bed), licensed CC0 Foley and synthesized effects/ambience, exactly on the saved voice clock."""
    quirky=mood not in lib.MOODS
    music=np.zeros(samples);sfx=np.zeros(samples)
    # Original 112 BPM score: rounded pizzicato, soft bass and sparse brushed percussion.
    # Four-bar variation avoids the former three-note metronome; the answer opens the harmony.
    rng=np.random.default_rng(seed)
    step=RATE*60/112/2
    patterns=((0,2,1,4,2,1,3,1),(0,1,3,2,4,2,1,3),(0,3,2,4,1,2,3,4),(0,2,4,3,2,1,4,2))
    for index in range(int(np.ceil(samples/step)) if quirky else 0):
        start=jsround(index*step);n=min(int(RATE*.24),samples-start)
        if n<=0:continue
        tt=np.arange(n)/RATE
        answer=start>=twist_frame*1600
        notes=[130.8128,164.8138,195.9977,261.6256,293.6648] if answer else [110,130.8128,164.8138,196,220]
        freq=notes[patterns[(index//8)%4][index%8]]
        env=(1-np.exp(-tt*350))*np.exp(-tt*17)
        accent=1 if index%4==0 else .65
        music[start:start+n]+=.025*accent*(np.sin(2*np.pi*freq*tt)+.25*np.sin(4*np.pi*freq*tt)+.08*np.sin(6*np.pi*freq*tt))*env
        if index%4==0:
            music[start:start+n]+=.02*np.sin(2*np.pi*(65.4064 if answer else 55)*tt)*(1-np.exp(-tt*200))*np.exp(-tt*9)
        if index%8 in (2,6):
            brushed=np.convolve(rng.standard_normal(n),np.ones(12)/12,'same')
            music[start:start+n]+=.004*brushed*np.exp(-tt*35)
    if not quirky:music=lib.music_bed(mood,samples,twist_frame*1600,seed)
    amb=np.zeros(samples)
    import os
    root=Path(os.environ.get('CARTOON_SOUND_DIR',str(Path(__file__).parent/'assets'/'sound')))
    names={'impact':'impact','pour':'splash','splash':'splash','pop':'tap','creak':'handling'}
    cache={}
    total=round(samples/RATE*30)
    for cue in cues:
        end=cue.get('end')
        if cue['kind'] not in KINDS or not isinstance(cue['frame'],int) or not 0<=cue['frame']<total:raise ValueError('Invalid sound cue')
        if end is not None and (not isinstance(end,int) or not cue['frame']<end<=total):raise ValueError('Invalid sound cue')
        if not isinstance(cue.get('gain',1.0),(int,float)) or not 0<=cue.get('gain',1.0)<=2:raise ValueError('Invalid sound cue')
    for cue in lib.thin_cues(cues):
        kind=cue['kind'];first=cue['frame']*1600
        if kind in lib.AMBIENT or kind in ('wind','crowd'):
            # Ambience is a bed, not an effect: it joins the music stem so it is ducked under speech and cannot inflate the effects level.
            n=(cue['end']*1600-first) if cue.get('end') else int(RATE*2.5)
            n=min(n,samples-first)
            if n>RATE//4:amb[first:first+n]+=lib.render(kind,seed,n)*cue.get('gain',1.0)
            continue
        # No recording is better than a semantically false sound (stones are not wind, one footstep is not a crowd).
        name=names.get(kind)
        if name is None:
            if kind not in lib.SFX:continue
            n=min(len(lib.render(kind,seed+cue['frame'])),samples-first)
            sfx[first:first+n]+=.35*cue.get('gain',1.0)*lib.render(kind,seed+cue['frame'])[:n]
            continue
        if name not in cache:
            with wave.open(str(root/(name+'.wav')),'rb') as w:
                if w.getframerate()!=RATE or w.getnchannels()!=1 or w.getsampwidth()!=2:raise ValueError('Invalid licensed Foley format')
                cache[name]=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').astype(float)/32768
        sound=cache[name];n=min(len(sound),samples-first)
        sfx[first:first+n]+=.3*sound[:n]
    if amb.any():
        live=np.abs(music)>1e-5;bed=float(np.sqrt(np.mean(music[live]**2))) if live.any() else .02
        active=np.abs(amb)>1e-6;rms=float(np.sqrt(np.mean(amb[active]**2)))
        music=music+amb*(.45*bed/rms)
    edge=min(samples,int(.05*RATE));music[:edge]*=np.linspace(0,1,edge);music[-edge:]*=np.linspace(1,0,edge)
    return music[:,None],sfx[:,None]

def write_pcm(path, samples):
    if np.max(np.abs(samples)) >= 1: raise ValueError('Unmixed stem exceeds PCM headroom')
    with wave.open(str(path), 'wb') as f:
        f.setnchannels(samples.shape[1]); f.setsampwidth(2); f.setframerate(RATE)
        f.writeframes(np.round(samples*32767).astype('<i2').tobytes())

if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('plan'); parser.add_argument('--out', required=True)
    args = parser.parse_args(); plan = json.loads(Path(args.plan).read_text())
    music, sfx = synthesize(plan['samples'], plan['twist_frame'], plan['cues'], plan.get('seed',1))
    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    write_pcm(out/'music.wav',music); write_pcm(out/'sfx.wav',sfx)