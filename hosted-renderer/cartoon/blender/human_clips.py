"""Explicit bindings for owner-supplied rigs; never pass unrelated motion as literal action."""
import re
MODELS = {'uploaded-woman': 'Casual.fbx', 'uploaded-man': 'Casual_Hoodie.fbx', 'ual-mannequin': 'ual_mannequin.glb'}
CLIPS = {'stand': 'Idle_Neutral', 'walk': 'Walk', 'run': 'Run', 'fall': 'Death'}
# CC0 Universal Animation Library (Quaternius, public domain): real motion-capture clips on a skinned mannequin with 52 DEF bones.
# Each of our actions maps to one clip; anything not listed falls back to a neutral idle, never to an unrelated motion.
UAL_CLIPS = {'stand': 'Idle_Loop', 'talk': 'Idle_Talking_Loop', 'walk': 'Walk_Loop', 'run': 'Sprint_Loop', 'fall': 'Death01', 'point': 'Interact',
             'carry': 'PickUp_Table', 'swing': 'Sword_Attack', 'aim': 'Pistol_Aim_Neutral', 'shoot': 'Pistol_Shoot', 'punch': 'Punch_Jab', 'push': 'Push_Loop',
             'sit': 'Sitting_Idle_Loop', 'dance': 'Dance_Loop', 'drive': 'Driving_Loop', 'crouch': 'Crouch_Idle_Loop', 'think': 'Idle_Torch_Loop',
             'cheer': 'Idle_Loop', 'wave': 'Idle_Talking_Loop', 'react': 'Hit_Chest', 'worry': 'Idle_Loop', 'shout': 'Idle_Talking_Loop', 'load': 'Pistol_Reload'}


def clips_for(model):
    return UAL_CLIPS if model == 'ual-mannequin' else CLIPS


def resolve_ual_clip(action, available):
    """The mannequin's clip for an action; unmapped actions use the idle loop (a correct neutral pose, never a random motion)."""
    name = UAL_CLIPS.get(action, 'Idle_Loop')
    matches = [n for n in available if _clean(n) == name]
    if len(matches) != 1:
        raise ValueError(f'Expected exactly one {name} clip')
    return matches[0]


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

def _clean(n):
    """Blender names imported clips 'Walk_Loop_Rig' or 'Armature|Walk_Loop'; the clip name is the part we ask for."""
    base = n.split('|')[-1]
    base = re.sub(r'\.\d{3}$', '', base)   # a second import of the same file: 'Walk_Loop_Rig.001'
    return base[:-4] if base.endswith('_Rig') else base
