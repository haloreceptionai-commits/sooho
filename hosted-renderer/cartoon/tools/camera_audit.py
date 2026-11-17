"""Camera audit of a planned video (benchmark rulebook: the camera always travels, about 10% of the frame width per second, a mix of push / crane / track).
Reads shot JSON files (the art director's output) and reports per shot: travel as a fraction of the frame width per second, the move type and the share
of the frame height the subject fills. Usage: python camera_audit.py shots_dir"""
import glob, json, math, sys


def tan_half(lens): return math.tan(math.atan(18.0 / max(10.0, lens)))


def audit(shot):
    c = shot['camera']; f = c['from']; t = c.get('to', f); la = c['look_at']; lt = c.get('look_to', la); dur = max(0.2, shot['duration'])
    d = math.dist(f, la) or 1.0; th = tan_half(c.get('lens', 35)); fw = 2 * d * th * 9 / 16          # frame width at the subject
    d0 = math.dist(f, la); d1 = math.dist(t, lt); push = (d0 - d1) / fw
    v = [la[i] - f[i] for i in range(3)]; w = [lt[i] - t[i] for i in range(3)]
    cosang = sum(a * b for a, b in zip(v, w)) / ((math.hypot(*v) or 1) * (math.hypot(*w) or 1)); turn = math.acos(max(-1, min(1, cosang)))
    move = math.dist(f, t); lateral = math.sqrt(max(0.0, move ** 2 - (d0 - d1) ** 2))
    width_per_s = (abs(push) * 0.5 + lateral / fw + turn / (2 * math.atan(th * 9 / 16))) / dur
    kind = 'push' if push > 0.08 else 'pull' if push < -0.08 else 'track' if lateral > 0.08 * fw else 'static'
    subj = [x['pos'] for x in shot.get('cast', [])]
    frac = None
    if subj: frac = round(1.9 / (2 * math.dist(f, (sum(p[0] for p in subj) / len(subj), sum(p[1] for p in subj) / len(subj), 0.95)) * th), 2)
    return {'duration': round(dur, 2), 'move': kind, 'width_per_s': round(width_per_s, 3), 'subject_height_frac': frac}


if __name__ == '__main__':
    rows = [(f.split('/')[-1].split('\\')[-1], audit(json.load(open(f)))) for f in sorted(glob.glob(sys.argv[1] + '/shot_*.json'))]
    for n, r in rows: print(n.ljust(14), r)
    w = [r['width_per_s'] for _, r in rows]
    print('mean width/s', round(sum(w) / len(w), 3), '| shots below 0.05:', sum(1 for x in w if x < 0.05), 'of', len(w), '| static:', sum(1 for _, r in rows if r['move'] == 'static'))
    mix = {k: sum(1 for _, r in rows if r['move'] == k) for k in ('push', 'pull', 'track', 'static')}; print('mix', mix)
