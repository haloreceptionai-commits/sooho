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

def synthesize(samples, twist_frame, cues, seed=1):
    if not isinstance(samples, int) or samples <= 0:
        raise ValueError('Invalid narration samples')
    total = jsround(samples / RATE * 30)
    if not isinstance(twist_frame, int) or not 0 <= twist_frame < total:
        raise ValueError('Twist must be inside the locked timeline')
    rng = np.random.default_rng(seed)
    music = np.zeros(samples, dtype=np.float64)
    sfx = np.zeros(samples, dtype=np.float64)
    twist = min(samples, jsround(twist_frame * RATE / 30))
    t = np.arange(twist) / RATE
    # Short plucked bass notes and a warm brass-like pad, before the pivot only.
    phase = np.mod(t, .4)
    notes = np.array([110., 130.8128, 98., 146.8324])[(t // .8).astype(int) % 4]
    music[:twist] = .12 * np.sin(2*np.pi*notes*t) * np.exp(-phase*12)
    music[:twist] += .025 * (np.sin(2*np.pi*220*t) + .3*np.sin(2*np.pi*440*t))
    for start in range(0, twist, int(.4*RATE)):
        n = min(int(.1*RATE), twist-start); tt = np.arange(n)/RATE
        music[start:start+n] += .12*np.sin(2*np.pi*(75*tt+45*.018*(1-np.exp(-tt/.018))))*np.exp(-tt*40)
        if (start // int(.4*RATE)) % 2:
            music[start:start+n] += .04*rng.standard_normal(n)*np.exp(-tt*55)
    tt = np.arange(samples-twist)/RATE
    music[twist:] = .065*np.sin(2*np.pi*65.4064*tt) + .02*np.sin(2*np.pi*98*tt)
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