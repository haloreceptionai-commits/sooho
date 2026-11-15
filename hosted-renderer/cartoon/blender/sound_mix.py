"""Step 8 mixer: place pinned sounds at cue samples, tunnel echo, voice-safe ducking, -14 LUFS master.

The voice is only ever added and then scaled by the single common master gain;
its samples are never moved, stretched or filtered.
"""
import json, subprocess, wave, math
from pathlib import Path
import numpy as np
from sound_cues import cues, spatial, LOOPS

RATE = 48000
ROOMS = {'mine_tunnel': [(.045, .32), (.093, .2), (.161, .11)]}  # (delay s, gain) early reflections


def read(path):
    with wave.open(str(path), 'rb') as f:
        if f.getsampwidth() != 2 or f.getframerate() != RATE: raise ValueError('expected 48 kHz PCM16')
        x = np.frombuffer(f.readframes(f.getnframes()), '<i2').astype(np.float64) / 32768
        return x.reshape(-1, f.getnchannels()).mean(axis=1)


def write(path, st):
    with wave.open(str(path), 'wb') as f:
        f.setnchannels(2); f.setsampwidth(2); f.setframerate(RATE)
        f.writeframes((np.clip(st, -1, 1) * 32767).astype('<i2').tobytes())


def place(shot, library, offset=0.0, total=None):
    """Stereo effects stem for one shot starting at `offset` seconds."""
    n = round((total or shot['duration']) * RATE); out = np.zeros((n, 2)); c = shot['camera']
    for cue in cues(shot):
        s = library[cue['sound']]
        if cue['sound'] in LOOPS:
            m = round(cue.get('length', shot['duration']) * RATE); s = np.tile(s, m // len(s) + 1)[:m]
            fade = min(len(s) // 4, RATE // 5); s = s.copy(); s[:fade] *= np.linspace(0, 1, fade); s[-fade:] *= np.linspace(1, 0, fade)
        g, pan = spatial(cue, c['from'], c['look_at']); g *= cue['gain']
        L, R = math.cos((pan + 1) * math.pi / 4), math.sin((pan + 1) * math.pi / 4)
        i = round((offset + cue['t']) * RATE); j = min(n, i + len(s))
        if j > i: out[i:j, 0] += s[:j - i] * g * L; out[i:j, 1] += s[:j - i] * g * R
    for delay, gain in ROOMS.get(shot['set'], []):
        k = round(delay * RATE); out[k:] += out[:-k] * gain * np.array([1, .85]) if k else 0
    return out


def duck(voice, rate=RATE):
    """20 ms envelope: effects/music sit at 0.45 under speech, 1.0 in gaps (attack fast, release slow)."""
    w = rate // 50; env = np.ones(len(voice)); level = 1.0
    ref = np.sqrt(np.mean(voice ** 2)) if voice.any() else 1
    for a in range(0, len(voice), w):
        b = min(len(voice), a + w); target = .45 if np.sqrt(np.mean(voice[a:b] ** 2)) > ref * .3 else 1.0
        nxt = level + (.6 if target < level else .1) * (target - level); env[a:b] = np.linspace(level, nxt, b - a); level = nxt
    return env


def loudness(path):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', str(path), '-af', 'loudnorm=I=-14:TP=-1:LRA=50:print_format=json', '-f', 'null', '-'], capture_output=True, text=True, check=True).stderr
    j = json.loads(r[r.rindex('{'):r.rindex('}') + 1]); return float(j['input_i']), float(j['input_tp'])


def master(mix_path, out_path):
    """Measured common gain then a -1 dBTP true-peak limiter; re-measured and reported."""
    i, _ = loudness(mix_path); gain = -14 - i
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(mix_path), '-af', f'volume={gain:.3f}dB,alimiter=limit=0.84:attack=1:release=60:level=disabled', '-ar', str(RATE), '-c:a', 'pcm_s16le', str(out_path)], check=True)
    fi, ftp = loudness(out_path)
    return {'input_lufs': i, 'gain_db': round(gain, 3), 'lufs': fi, 'true_peak': ftp, 'pass': abs(fi + 14) <= 1 and ftp <= -1.0}


def mix(voice, sfx, music=None):
    """voice (mono), sfx/music (stereo) -> stereo; voice untouched."""
    env = duck(voice)[:, None]; out = np.repeat(voice[:, None], 2, axis=1) + sfx * env * .9
    if music is not None: out += music * env * .35
    return out
