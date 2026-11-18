"""Word timing for one recorded take.

Primary: the pinned offline CTC model (acoustic.py) aligns the exact script to the exact audio. If it cannot (an odd token, a model
problem) the take falls back to speech-span timing weighted by word length and punctuation, so a video is never stopped by this step;
the result says which method was used so a weak take can be seen.

  python doc_align.py --manifest m.json --take 0 --audio take0.wav --out aligned-0.json
"""
import argparse
import json
import os
import re
import sys
import wave
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))


def letters(word):
    return re.sub(r"[^A-Za-z']", '', word)


def speech_span(path):
    with wave.open(str(path), 'rb') as f:
        rate, n = f.getframerate(), f.getnframes()
        x = np.frombuffer(f.readframes(n), dtype='<i2').astype(np.float32) / 32768.0
        if f.getnchannels() > 1:
            x = x.reshape(-1, f.getnchannels()).mean(axis=1)
    blk = int(rate * .02)
    k = len(x) // blk
    rms = np.sqrt((x[:k * blk].reshape(k, blk) ** 2).mean(axis=1)) if k else np.zeros(1)
    thr = max(.01, float(np.percentile(rms, 90)) * .12)
    on = np.nonzero(rms > thr)[0]
    if not len(on):
        return 0.0, len(x) / rate
    return float(on[0] * blk / rate), float((on[-1] + 1) * blk / rate)


def proportional(words, start, end):
    """Spreads words over the speech span by length; sentence ends and commas get a longer rest."""
    weights = []
    for w in words:
        base = len(letters(w)) + 2
        tail = 6 if w[-1:] in '.!?' else 3 if w[-1:] in ',;:' else 0
        weights.append((base, tail))
    total = sum(b + t for b, t in weights) or 1
    out, t = [], start
    span = max(.1, end - start)
    for w, (b, tl) in zip(words, weights):
        d = span * b / total
        out.append({'start': t, 'end': t + d * .92, 'text': w})
        t += span * (b + tl) / total
    return out


def ctc_words(words, audio):
    """CTC timings for the words that contain letters; tokens without letters (dashes) are skipped and given the neighbour's time."""
    import acoustic  # needs torch; only the :v1 worker image has it
    keep = [i for i, w in enumerate(words) if letters(w)]
    transcript = ' '.join(letters(words[i]) for i in keep)
    if re.search(r'\d', ' '.join(words)):
        raise ValueError('Narration contains digits; numbers must be spelled for alignment')
    weights = Path(os.environ.get('CARTOON_WEIGHTS') or '/opt/cartoon/weights.pth')
    out_dir = Path('/tmp') / ('align-' + str(os.getpid()))
    result = acoustic.infer(Path(audio), weights, transcript, out_dir)
    got = result['words']
    if len(got) != len(keep):
        raise ValueError('Alignment word count differs from the script')
    timed = {}
    for i, g in zip(keep, got):
        if g['end'] <= g['start']:
            raise ValueError('Alignment produced an empty word')
        timed[i] = (float(g['start']), float(g['end']))
    out, last_end = [], 0.0
    for i, w in enumerate(words):
        if i in timed:
            s, e = timed[i]
            last_end = e
        else:
            s = e = last_end
        out.append({'start': s, 'end': e, 'text': w})
    return out


def align_take(manifest, k, audio):
    scenes = manifest['scenes']
    take = manifest['voice'][k]
    words, spans = [], []
    for si in take['scenes']:
        w = str(scenes[si]['text']).split()
        spans.append((si, len(words), len(words) + len(w)))
        words += w
    method = 'ctc'
    try:
        timed = ctc_words(words, audio)
    except Exception as e:
        print('alignment fell back to speech-span timing:', str(e)[:200])
        method = 'span'
        s, e = speech_span(audio)
        timed = proportional(words, s, e)
    return [{'scene': si, 'words': timed[a:b]} for si, a, b in spans], method


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--manifest', required=True)
    ap.add_argument('--take', type=int, required=True)
    ap.add_argument('--audio', required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    manifest = json.load(open(a.manifest, encoding='utf8'))
    aligned, method = align_take(manifest, a.take, a.audio)
    with wave.open(a.audio, 'rb') as f:
        duration = f.getnframes() / f.getframerate()
    json.dump({'method': method, 'duration': duration, 'scenes': aligned}, open(a.out, 'w'))
    print(json.dumps({'take': a.take, 'method': method, 'words': sum(len(s['words']) for s in aligned)}))


if __name__ == '__main__':
    main()
