"""Constant-gain stem mixer. Measurement: 400ms windows gated at -60dBFS.

Music targets half voice gated RMS; SFX also obeys 0.7 voice peak.
No timing edits, ducking, compression, clipping or mastering here.
"""
import argparse
import json
import wave
from pathlib import Path
import numpy as np

def gated_rms(samples, rate):
    if not isinstance(rate, int) or rate < 8000 or rate > 192000:
        raise ValueError("Invalid sample rate")
    if not np.isfinite(samples).all():
        raise ValueError("Nonfinite audio samples")
    width = max(1, round(rate * 0.4))
    powers = [float(np.mean(samples[i:i + width] ** 2)) for i in range(0, len(samples), width)]
    active = [p for p in powers if p > 1e-6]
    return float(np.sqrt(np.mean(active))) if active else 0.0

def mix_stems(voice, music, sfx, rate, advanced=False):
    if any(s.ndim != 2 or s.shape[1] not in (1, 2) for s in (voice, music, sfx)):
        raise ValueError("Stems must be mono or stereo sample matrices")
    if voice.shape != music.shape or voice.shape != sfx.shape or not voice.size:
        raise ValueError("Stems must cover the same nonempty sample timeline")
    vr = gated_rms(voice, rate)
    vp = float(np.max(np.abs(voice)))
    if vr <= 0 or vp <= 0:
        raise ValueError("Narration is silent")
    mr, sr = gated_rms(music, rate), gated_rms(sfx, rate)
    sp = float(np.max(np.abs(sfx)))
    mg = 0.5 * vr / mr if mr else 0.0
    sg = min(0.5 * vr / sr, 0.7 * vp / sp) if sr and sp else 0.0
    if advanced:
        # Bounded 20ms envelopes; never move, stretch or filter the accepted voice.
        width = max(1, round(rate * .02))
        envelope = np.zeros(len(voice))
        level = 1.0
        for first in range(0, len(voice), width):
            last = min(len(voice), first + width)
            active = float(np.sqrt(np.mean(voice[first:last] ** 2))) > vr * .18
            target = .32 if active else .7
            alpha = .55 if target < level else .08
            next_level = level + alpha * (target - level)
            envelope[first:last] = np.linspace(level, next_level, last-first)
            level = next_level
        music = music * envelope[:, None]
    result = voice + music * mg + sfx * sg
    report = {"voice_rms": vr, "music_gain": mg, "sfx_gain": sg,
              "music_rms_ratio": mr * mg / vr, "sfx_rms_ratio": sr * sg / vr,
              "sfx_peak_ratio": sp * sg / vp, "samples": len(voice), "sample_rate": rate,
              "speech_ducking": advanced}
    return result, report

def read_pcm(path):
    with wave.open(str(path), "rb") as f:
        if f.getsampwidth() != 2 or f.getcomptype() != "NONE":
            raise ValueError("Expected decoded PCM16 WAV")
        data = np.frombuffer(f.readframes(f.getnframes()), dtype="<i2").astype(np.float64) / 32768
        return data.reshape(-1, f.getnchannels()), f.getframerate()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("voice"); parser.add_argument("music"); parser.add_argument("sfx")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    stems = [read_pcm(p) for p in (args.voice, args.music, args.sfx)]
    if len({r for _, r in stems}) != 1:
        raise ValueError("Sample rates must match")
    mixed, report = mix_stems(*(s for s, _ in stems), stems[0][1])
    out = Path(args.out)
    # Float samples retain headroom; the finishing stage must measure before mastering.
    np.save(out.with_suffix(".npy"), mixed)
    out.with_suffix(".json").write_text(json.dumps(report, indent=2))

if __name__ == "__main__":
    main()