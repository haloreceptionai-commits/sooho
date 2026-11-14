"""Deterministic stem-only synthesis on the accepted narration sample clock."""
import argparse
import json
import wave
from pathlib import Path
import numpy as np

def jsround(x):
    # Match JavaScript Math.round so frame counts agree with the scene validator (106.5 -> 107).
    import math
    return math.floor(x+0.5)


RATE = 48000
KINDS = {'whoosh', 'impact', 'creak', 'pour', 'splash', 'reveal', 'thunder', 'bell', 'coin', 'wind', 'crowd', 'pop'}

def synthesize(samples, twist_frame, cues, seed=1, advanced=False):
    if not isinstance(samples, int) or samples <= 0:
        raise ValueError('Invalid narration samples')
    total = jsround(samples / RATE * 30)
    if not isinstance(twist_frame, int) or not 0 <= twist_frame < total:
        raise ValueError('Twist must be inside the locked timeline')
    rng = np.random.default_rng(seed)
    if advanced:
        return sound_design(samples,twist_frame,cues,seed)
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

def sound_design(samples,twist_frame,cues,seed=1):
    """Original staccato score plus licensed CC0 Foley, exactly on the saved voice clock."""
    from functools import lru_cache
    music=np.zeros(samples);sfx=np.zeros(samples);t=np.arange(samples)/RATE
    # Original composition: low pulsed notes, changing harmony at the answer. Not a borrowed soundtrack.
    for start in range(0,samples,int(RATE*.25)):
        n=min(int(RATE*.18),samples-start);tt=np.arange(n)/RATE
        notes=[110,130.8128,164.8138] if start<twist_frame*1600 else [130.8128,164.8138,195.9977]
        freq=notes[(start//int(RATE*.25))%3]
        env=np.sin(np.pi*np.arange(n)/max(n,1))**2*np.exp(-tt*12)
        music[start:start+n]+=.025*(np.sin(2*np.pi*freq*tt)+.15*np.sin(4*np.pi*freq*tt))*env
    root=Path(__file__).parent/'assets'/'sound'
    names={'impact':'impact','pour':'splash','splash':'splash','pop':'tap','creak':'handling','coin':'handling','bell':'handling','reveal':'tap','whoosh':'handling','wind':'stone','thunder':'stone','crowd':'footstep'}
    cache={}
    for cue in cues:
        if cue['kind'] not in KINDS or not isinstance(cue['frame'],int) or not 0<=cue['frame']<round(samples/RATE*30):raise ValueError('Invalid sound cue')
        name=names[cue['kind']]
        if name not in cache:
            with wave.open(str(root/(name+'.wav')),'rb') as w:
                if w.getframerate()!=RATE or w.getnchannels()!=1 or w.getsampwidth()!=2:raise ValueError('Invalid licensed Foley format')
                cache[name]=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').astype(float)/32768
        sound=cache[name];first=cue['frame']*1600;n=min(len(sound),samples-first)
        sfx[first:first+n]+=.3*sound[:n]
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