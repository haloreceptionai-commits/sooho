"""Pure preview/framing limits, importable without Blender."""
import re

def visible_height(points):
    ys = [p[1] for p in points if p[2] > 0]
    return max(0, min(1, max(ys)) - max(0, min(ys))) if ys else 0

def emotion_line(words):
    return bool(re.search(r'\b(felt|afraid|terrified|scared|angry|furious|happy|sad|wept|cried|fear|panic)\b',words.lower()))

def budget_ceiling(upper):
    if upper <= 0: raise ValueError('positive estimate required')
    return upper*1.25

def preview_frames(n,burst=False):
    if n<1:raise ValueError('empty shot')
    return [max(1,round(n*(.75 if burst else .5)))]

def clearance_frames(n, cap=120):
    """Whole-shot clearance: every frame (first and last always included); very long shots every 2nd/3rd frame."""
    n = max(1, int(n)); step = max(1, -(-n // cap))
    return sorted(set(list(range(1, n + 1, step)) + [n]))
