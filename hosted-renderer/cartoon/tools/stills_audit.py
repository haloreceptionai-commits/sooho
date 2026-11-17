"""Stills audit (the creator's 'check it before every render' list, automated where a computer can check it):
- void: a frame that is mostly black or a flat colour (camera inside geometry, empty opening, missing sky)
- dark: a frame too dark to read
- head_out: a character's head outside the frame or cut by its edge
- label_out: an in-world label outside the frame
Needs the shot JSON files (art director output) and one rendered still per shot. Usage:
    python stills_audit.py shots_dir stills_dir   (stills are stills_dir/<index>/f_*.png)"""
import glob, json, math, os, sys
import cv2
import numpy as np


def project(shot, p, t=0.5):
    c = shot['camera']; f = [c['from'][i] + (c.get('to', c['from'])[i] - c['from'][i]) * t for i in range(3)]
    la = [c['look_at'][i] + (c.get('look_to', c['look_at'])[i] - c['look_at'][i]) * t for i in range(3)]
    fw = np.array(la, float) - np.array(f, float); fw /= (np.linalg.norm(fw) or 1.0)
    right = np.cross(fw, [0, 0, 1.0]); right /= (np.linalg.norm(right) or 1.0); up = np.cross(right, fw)
    v = np.array(p, float) - np.array(f, float); z = float(v @ fw)
    if z <= 0.1: return None
    th = math.tan(math.atan(18.0 / max(10.0, c.get('lens', 35))))
    return (0.5 + 0.5 * float(v @ right) / (z * th * 9 / 16), 0.5 + 0.5 * float(v @ up) / (z * th))


def audit_one(shot, img):
    flags = []
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    if (g < 20).mean() > 0.45 or g.std() < 6: flags.append('void')
    if g.mean() < 45: flags.append('dark')
    for c in shot.get('cast', []):
        x, y = c['pos']; head = project(shot, (x, y, 1.78)); top = project(shot, (x, y, 2.05))
        if head is None or not (0.02 < head[0] < 0.98) or head[1] > 1.0 or (top and top[1] > 1.04): flags.append(f"head_out:{c['id']}")
    lb = shot.get('label')
    if lb:
        pt = project(shot, (lb['pos'][0], lb['pos'][1], 1.3))
        if pt is None or not (0.04 < pt[0] < 0.96 and 0.04 < pt[1] < 0.96): flags.append('label_out')
    return flags


if __name__ == '__main__':
    shots_dir, stills_dir = sys.argv[1], sys.argv[2]; bad = 0
    for f in sorted(glob.glob(os.path.join(shots_dir, 'shot_*.json'))):
        n = os.path.basename(f)[5:-5]; shot = json.load(open(f)); imgs = glob.glob(os.path.join(stills_dir, n, 'f_*.png'))
        if not imgs: print(n, 'no still'); continue
        flags = audit_one(shot, cv2.imread(imgs[0])); bad += bool(flags)
        print(n, 'OK' if not flags else ' '.join(flags))
    print('shots with problems:', bad)
