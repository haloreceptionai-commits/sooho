"""Objective per-shot measurements of a vertical Short (no AI involved).

Shots are found from frame-histogram jumps; every shot gets a keyframe plus
sharpness, colour, motion and burned-caption words.  Audio gets loudness and a
transient (hit/foley) density.  Output is plain JSON so later steps can score
new renders against the benchmark with the same code.
"""
from __future__ import annotations
import json, re, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image

FPS = 10
LOW_W, LOW_H = 144, 256        # analysis grid (9:16)
CAP_TOP, CAP_BOT = 0.60, 0.78  # burned caption band, excluded from picture metrics


def _ff(args: list[str]) -> bytes:
    return subprocess.run(['ffmpeg', '-v', 'error', *args], check=True, capture_output=True).stdout


def probe(path: str) -> dict:
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height',
                          '-of', 'json', path], check=True, capture_output=True, text=True).stdout
    j = json.loads(out)
    v = next(s for s in j['streams'] if s['codec_type'] == 'video')
    return {'duration': float(j['format']['duration']), 'width': v['width'], 'height': v['height'],
            'audio': any(s['codec_type'] == 'audio' for s in j['streams'])}


def low_frames(path: str) -> np.ndarray:
    raw = _ff(['-i', path, '-vf', f'fps={FPS},scale={LOW_W}:{LOW_H}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
    return np.frombuffer(raw, np.uint8).reshape(-1, LOW_H, LOW_W, 3)


def picture_mask(h: int) -> np.ndarray:
    m = np.ones(h, bool); m[int(h * CAP_TOP):int(h * CAP_BOT)] = False
    return m


def hist(f: np.ndarray) -> np.ndarray:
    px = f[picture_mask(f.shape[0])].reshape(-1, 3) // 32          # 8 levels per channel
    h = np.bincount(px[:, 0] * 64 + px[:, 1] * 8 + px[:, 2], minlength=512).astype(float)
    return h / h.sum()


def detect_cuts(frames: np.ndarray, min_shot: float = 0.4) -> list[int]:
    """Frame indices where a new shot starts (always includes 0)."""
    hs = np.array([hist(f) for f in frames])
    d = np.r_[0, np.abs(np.diff(hs, axis=0)).sum(1) / 2]             # total-variation distance 0..1
    mask = picture_mask(frames.shape[1])
    px = np.r_[0, np.abs(np.diff(frames[:, mask].astype(np.int16), axis=0)).mean((1, 2, 3)) / 255]
    cuts, last = [0], 0
    for i in range(1, len(d)):
        local = np.median(d[max(1, i - 15):i + 15]) if i > 1 else 0
        is_cut = (d[i] > 0.28 and d[i] > 3 * local and px[i] > 0.06) or d[i] > 0.5
        if is_cut and (i - last) / FPS >= min_shot:
            cuts.append(i); last = i
    return cuts


def laplacian_var(gray: np.ndarray) -> float:
    g = gray.astype(float)
    lap = -4 * g[1:-1, 1:-1] + g[:-2, 1:-1] + g[2:, 1:-1] + g[1:-1, :-2] + g[1:-1, 2:]
    return float(lap.var())


def colorfulness(rgb: np.ndarray) -> float:
    r, g, b = (rgb[..., i].astype(float) for i in range(3))
    rg, yb = r - g, 0.5 * (r + g) - b
    return float(np.hypot(rg.std(), yb.std()) + 0.3 * np.hypot(rg.mean(), yb.mean()))


def keyframe(path: str, t: float, out: Path) -> np.ndarray:
    """540x960 keyframe: a common size so 720p and 1080p sources compare fairly."""
    _ff(['-y', '-ss', f'{t:.3f}', '-i', path, '-frames:v', '1', '-vf', 'scale=540:960', str(out)])
    return np.asarray(Image.open(out).convert('RGB'))


_OCR_CLEAN = re.compile(r"[^A-Za-z0-9'’?.,!-]+")


def caption_words(path: str, duration: float, fps: float = 4.0) -> list[dict]:
    """Read the burned caption band; returns [{t, text}] for each change of caption."""
    raw = _ff(['-i', path, '-vf', f'fps={fps},scale=540:960', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
    frames = np.frombuffer(raw, np.uint8).reshape(-1, 960, 540, 3)
    out: list[dict] = []
    tmp = Path('/tmp/_cap.png')
    for i, f in enumerate(frames):
        band = f[int(960 * 0.62):int(960 * 0.76)]
        lum = band.min(axis=2)                       # white and yellow text both have high minimum channel
        yellow = (band[..., 0] > 200) & (band[..., 1] > 170) & (band[..., 2] < 90)
        text_px = (lum > 215) | yellow
        if text_px.mean() < 0.004:
            continue
        Image.fromarray(np.where(text_px, 0, 255).astype(np.uint8)).save(tmp)
        txt = subprocess.run(['tesseract', str(tmp), '-', '--psm', '7'], capture_output=True, text=True).stdout
        txt = _OCR_CLEAN.sub(' ', txt).strip()
        if len(txt) < 2:
            continue
        if not out or out[-1]['text'].lower() != txt.lower():
            out.append({'t': round(i / fps, 2), 'text': txt})
    return out


def audio_metrics(path: str) -> dict:
    log = subprocess.run(['ffmpeg', '-v', 'info', '-i', path, '-vn', '-af', 'ebur128', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    summary = log[log.rfind('Summary:'):]
    num = lambda k: float(re.search(rf'{k}:\s+(-?[\d.]+)', summary).group(1))
    sr = 16000
    pcm = np.frombuffer(_ff(['-i', path, '-vn', '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-']), np.float32)
    n, hop = 1024, 256
    frames = np.lib.stride_tricks.sliding_window_view(pcm, n)[::hop] * np.hanning(n)
    spec = np.abs(np.fft.rfft(frames, axis=1))
    band = spec[:, int(2000 / sr * n):int(7500 / sr * n)]
    flux = np.r_[0, np.maximum(np.diff(np.log1p(band), axis=0), 0).sum(1)]
    med, mad = np.median(flux), np.median(np.abs(flux - np.median(flux))) + 1e-9
    peaks, last = [], -1e9
    for i in range(1, len(flux) - 1):
        t = i * hop / sr
        if flux[i] > med + 8 * mad and flux[i] >= flux[i - 1] and flux[i] >= flux[i + 1] and t - last > 0.12:
            peaks.append(round(t, 3)); last = t
    return {'lufs': num('I'), 'lra': num('LRA'), 'transients': peaks,
            'transients_per_min': round(len(peaks) / (len(pcm) / sr) * 60, 1)}


def measure(path: str, name: str, work: Path) -> dict:
    work.mkdir(parents=True, exist_ok=True)
    info = probe(path)
    frames = low_frames(path)
    cuts = detect_cuts(frames)
    bounds = cuts + [len(frames)]
    caps = caption_words(path, info['duration'])
    mask = picture_mask(LOW_H)
    shots = []
    for k in range(len(cuts)):
        a, b = bounds[k], bounds[k + 1]
        t0, t1 = a / FPS, min(b / FPS, info['duration'])
        kf = keyframe(path, (t0 + t1) / 2, work / f'{name}-shot{k:02d}.jpg')
        pic = kf[np.repeat(picture_mask(960)[:, None], 540, 1)].reshape(-1, 540, 3) if False else kf
        gray = pic.mean(2)
        seg = frames[a:b, mask].astype(np.int16)
        motion = float(np.abs(np.diff(seg, axis=0)).mean() / 255) if len(seg) > 1 else 0.0
        words = ' '.join(c['text'] for c in caps if t0 <= c['t'] < t1)
        shots.append({'i': k, 'start': round(t0, 2), 'end': round(t1, 2), 'len': round(t1 - t0, 2),
                      'sharpness': round(laplacian_var(gray), 1), 'colorfulness': round(colorfulness(pic), 1),
                      'contrast': round(float(gray.std()), 1), 'motion': round(motion, 4), 'words': words,
                      'keyframe': str(work / f'{name}-shot{k:02d}.jpg')})
    word_count = sum(len(c['text'].split()) for c in caps)
    return {'name': name, 'source': path, **info, 'shots': shots, 'captions': caps,
            'caption_wpm': round(word_count / info['duration'] * 60, 1),
            'audio': audio_metrics(path) if info['audio'] else None}


if __name__ == '__main__':
    src, name, outdir = sys.argv[1], sys.argv[2], Path(sys.argv[3])
    res = measure(src, name, outdir / 'frames')
    (outdir / f'{name}.measure.json').write_text(json.dumps(res, indent=1))
    print(name, 'shots', len(res['shots']), 'median len', np.median([s['len'] for s in res['shots']]), 'wpm', res['caption_wpm'], res['audio'] and res['audio']['transients_per_min'])
