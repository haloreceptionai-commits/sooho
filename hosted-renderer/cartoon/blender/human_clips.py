"""Explicit bindings for owner-supplied rigs; never pass unrelated motion as literal action."""
MODELS = {'uploaded-woman': 'Casual.fbx', 'uploaded-man': 'Casual_Hoodie.fbx'}
CLIPS = {'stand': 'Idle_Neutral', 'walk': 'Walk', 'run': 'Run', 'fall': 'Death'}


def resolve_clip(action, available):
    name = CLIPS.get(action)
    if name is None:
        raise ValueError(f'Uploaded human action {action!r} needs a verified adapter')
    matches = [n for n in available if n.split('|')[-1] == name]
    if len(matches) != 1:
        raise ValueError(f'Expected exactly one {name} clip')
    return matches[0]


def clip_frame(action, seconds, start, end, fps=30):
    if action == 'fall':
        return min(end, start + max(0, seconds) * fps)
    return start + (max(0, seconds) * fps) % max(1, end - start)