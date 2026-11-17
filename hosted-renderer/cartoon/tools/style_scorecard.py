"""Measure a video's style in numbers (the 'rulebook' method from the benchmark creator's prompts): camera movement, cuts, shot length, colour,
sharpness and depth. Never opinions: every value is computed from the frames. Usage:
    python style_scorecard.py out.json video1.mp4 video2.mp4 ...
Frames are analysed at 30 fps (every frame) at 270x480 for speed; sharpness uses the same size for every video so the numbers compare."""
import json, sys
import cv2
import numpy as np

W, H = 270, 480


def analyse(path):
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    prev = None; prev_hist = None
    shifts = []; cuts = []; bright = []; contrast = []; sat = []; lap_c = []; lap_e = []; dark_edge = []; window = np.hanning(W)[None, :] * np.hanning(H)[:, None]
    idx = 0
    while True:
        ok, f = cap.read()
        if not ok: break
        small = cv2.resize(f, (W, H), interpolation=cv2.INTER_AREA)
        g = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY).astype(np.float32)
        hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
        hist = cv2.calcHist([small], [0, 1, 2], None, [8, 8, 8], [0, 256] * 3).flatten(); hist /= hist.sum() + 1e-9
        if prev is not None:
            dist = 1.0 - float(np.minimum(hist, prev_hist).sum())          # histogram intersection distance: ~0 same shot, >0.45 a cut
            if dist > 0.45: cuts.append(idx); shifts.append(None)
            else:
                (dx, dy), resp = cv2.phaseCorrelate(prev * window, g * window)
                shifts.append((dx / W, dy / H) if resp > 0.05 else (0.0, 0.0))
        prev = g; prev_hist = hist
        bright.append(float(hsv[..., 2].mean()) / 255); sat.append(float(hsv[..., 1].mean()) / 255); contrast.append(float(g.std()) / 255)
        lap = cv2.Laplacian(g, cv2.CV_32F)
        lap_c.append(float(lap[H // 3: 2 * H // 3, W // 4: 3 * W // 4].var()))      # centre: where the subject usually is
        lap_e.append(float(np.concatenate([lap[:H // 5].ravel(), lap[-H // 5:].ravel()]).var()))   # top/bottom strips: background and foreground
        e = cv2.Canny(g.astype(np.uint8), 60, 140) > 0
        dk = (g < 45)
        dark_edge.append(float((e & cv2.dilate(dk.astype(np.uint8), np.ones((3, 3))).astype(bool)).sum()) / max(1, e.sum()))   # share of edges that are dark ink lines
        idx += 1
    cap.release()
    moves = [np.hypot(*s) for s in shifts if s is not None]
    speed = [m * fps for m in moves]                                 # fraction of frame width per second
    still = float(np.mean([m < 0.0015 for m in moves])) if moves else 1.0
    shot_len = float(np.diff([0] + cuts + [idx]).mean() / fps) if idx else 0
    return {
        'file': path.split('\\')[-1].split('/')[-1][:60], 'seconds': round(idx / fps, 1), 'fps': round(fps, 1),
        'cuts': len(cuts), 'cuts_per_10s': round(len(cuts) / (idx / fps) * 10, 1), 'mean_shot_len_s': round(shot_len, 2),
        'camera_moving_pct': round(100 * (1 - still), 1), 'camera_speed_width_per_s_median': round(float(np.median(speed)), 3) if speed else 0,
        'camera_speed_width_per_s_p90': round(float(np.percentile(speed, 90)), 3) if speed else 0,
        'brightness': round(float(np.mean(bright)), 3), 'contrast': round(float(np.mean(contrast)), 3), 'saturation': round(float(np.mean(sat)), 3),
        'sharpness_centre': round(float(np.median(lap_c)), 1), 'sharpness_edges': round(float(np.median(lap_e)), 1),
        'centre_over_edge_sharpness': round(float(np.median(lap_c)) / max(1e-6, float(np.median(lap_e))), 2),
        'dark_ink_edge_share': round(float(np.mean(dark_edge)), 3),
    }


def frame_metrics(img):
    """Same colour and sharpness measures for one still image (resized the same way as video frames)."""
    small = cv2.resize(img, (W, H), interpolation=cv2.INTER_AREA)
    g = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY).astype(np.float32); hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
    lap = cv2.Laplacian(g, cv2.CV_32F)
    return {'brightness': float(hsv[..., 2].mean()) / 255, 'contrast': float(g.std()) / 255, 'saturation': float(hsv[..., 1].mean()) / 255,
            'sharpness_centre': float(lap[H // 3: 2 * H // 3, W // 4: 3 * W // 4].var()),
            'sharpness_scene': float(lap[int(H * .10): int(H * .52), int(W * .08): int(W * .92)].var())}   # above the caption zone


def frames_report(paths):
    rows = [frame_metrics(cv2.imread(p)) for p in paths]
    return {k: round(float(np.mean([r[k] for r in rows])), 3) for k in rows[0]}


if __name__ == '__main__':
    if sys.argv[1] == '--frames':
        print(json.dumps(frames_report(sys.argv[2:]))); sys.exit(0)
    out = sys.argv[1]; rows = [analyse(p) for p in sys.argv[2:]]
    json.dump(rows, open(out, 'w'), indent=1)
    keys = [k for k in rows[0] if k != 'file']
    print('metric'.ljust(36) + ' | '.join(r['file'][:14].ljust(14) for r in rows))
    for k in keys: print(k.ljust(36) + ' | '.join(str(r[k]).ljust(14) for r in rows))
