"""Pure preview/framing limits, importable without Blender."""
import re

def emotion_line(words):
    return bool(re.search(r'\b(felt|afraid|terrified|scared|angry|furious|happy|sad|wept|cried|fear|panic)\b',words.lower()))

def budget_ceiling(upper):
    if upper <= 0: raise ValueError('positive estimate required')
    return upper*1.25

def preview_frames(n,burst=False):
    if n<1:raise ValueError('empty shot')
    return [max(1,round(n*(.75 if burst else .5)))]