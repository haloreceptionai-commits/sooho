"""Opt-in real skinned human importer. FBX files must be materialized before rendering."""
import math
import os
from pathlib import Path
import bpy
from mathutils import Vector
from human_clips import MODELS, resolve_clip, clip_frame


def build_uploaded_human(c, duration, fps):
    model = c.get('model')
    if model not in MODELS:
        raise ValueError('Unknown uploaded human identity')
    folder = Path(os.environ.get('HUMAN_DIR', str(Path(__file__).parent / 'assets/humans')))
    source = folder / MODELS[model]
    if not source.is_file():
        raise ValueError('Uploaded human file not materialized; no replacement fallback')
    objects_before = set(bpy.data.objects)
    actions_before = set(bpy.data.actions)
    bpy.ops.import_scene.fbx(filepath=str(source))
    objects = [o for o in bpy.data.objects if o not in objects_before]
    rigs = [o for o in objects if o.type == 'ARMATURE']
    if len(rigs) != 1:
        raise ValueError('Expected one character skeleton')
    rig = rigs[0]
    actions = [a for a in bpy.data.actions if a not in actions_before]
    action_name = c.get('action', 'stand')
    chosen = resolve_clip(action_name, [a.name for a in actions])
    action = next(a for a in actions if a.name == chosen)
    rig.animation_data_create()
    for track in list(rig.animation_data.nla_tracks):
        rig.animation_data.nla_tracks.remove(track)
    rig.animation_data.action = action
    # NLA re-times the saved action to the output frame clock; no baked frame skipping.
    rig.animation_data.action = None
    track = rig.animation_data.nla_tracks.new()
    strip = track.strips.new(c.get('id', model) + ' motion', 1, action)
    start, end = action.frame_range
    strip.action_frame_start = start
    strip.action_frame_end = end
    strip.scale = fps / 30
    strip.repeat = 1 if action_name == 'fall' else max(1, duration * 30 / max(1, end - start))
    strip.extrapolation = 'HOLD_FORWARD'
    root = bpy.data.objects.new(c.get('id', model), None)
    bpy.context.collection.objects.link(root)
    for o in objects:
        if o.parent is None:
            o.parent = root
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    meshes = [o for o in objects if o.type == 'MESH']
    # These opaque palette FBXs encode transparency backwards for Blender's importer.
    # Correct imported material instances only, not other scene assets.
    for mat in {slot.material for o in meshes for slot in o.material_slots if slot.material}:
        if mat.use_nodes:
            bsdf = mat.node_tree.nodes.get('Principled BSDF')
            if bsdf:
                bsdf.inputs['Alpha'].default_value = 1
    points = [o.matrix_world @ Vector(v) for o in meshes for v in o.bound_box]
    low = min(v.z for v in points)
    high = max(v.z for v in points)
    factor = 1.8 / max(.01, high - low) * c.get('scale', 1)
    root.scale = (factor,) * 3
    root.location = (*c['pos'], -low * factor)
    root.rotation_euler.z = math.radians(c.get('yaw', 0))
    for frame in range(1, round(duration * fps) + 1):
        distance = (0.7 if action_name == 'walk' else 1.3 if action_name == 'run' else 0) * (frame - 1) / fps
        angle = root.rotation_euler.z
        root.location = (c['pos'][0] + math.sin(angle) * distance,
                         c['pos'][1] - math.cos(angle) * distance, -low * factor)
        root.keyframe_insert('location', frame=frame)
    root['human_model'] = model
    root['motion_clip'] = chosen.split('|')[-1]
    for o in meshes:
        if 'Head' in o.name:
            o['human_head'] = True
    # Explicit material role rather than repainting skin, hair or every part.
    if 'shirt' in c:
        for o in meshes:
            if 'Body' not in o.name:
                continue
            for slot in o.material_slots:
                mat = slot.material
                if mat and mat.name.split('.')[0] in ('Purple', 'Blue', 'White'):
                    mat = mat.copy()
                    slot.material = mat
                    mat.diffuse_color = (*c['shirt'], 1)
                    if mat.use_nodes:
                        bsdf = mat.node_tree.nodes.get('Principled BSDF')
                        if bsdf:
                            bsdf.inputs['Base Color'].default_value = (*c['shirt'], 1)
    return root