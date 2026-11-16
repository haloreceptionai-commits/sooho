"""Evaluated-mesh composition checks, shared by stills and approved full shots."""
import json
from pathlib import Path
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector
from composition_rules import visible_height, preview_frames


def projected(scene, camera, obj):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    return [world_to_camera_view(scene, camera, evaluated.matrix_world @ Vector(v)) for v in evaluated.bound_box]


def enforce(scene, shot, scenery, cards, roots, out):
    rules = shot.get('composition')
    if not rules: return
    n = round(shot['duration'] * shot.get('fps', 30))
    frames = sorted(set([1, n] + [max(1, round(n * t / 8)) for t in range(1, 8)]))
    heads = [o for r in roots for o in r.children_recursive if o.type == 'MESH' and o.name.startswith('egg head')]
    hidden = set(); fixes = []; key = cards[0] if cards else None
    # Evaluate the same camera keys that rendering uses. Conservatively hide any
    # scenery mesh intersecting the key's silhouette, not just its center ray.
    if key:
        for f in frames:
            scene.frame_set(f); bpy.context.view_layer.update()
            for u in (-.45, -.225, 0, .225, .45):
                for v in (.08, .25, .5, .75, .92):
                    p = key.matrix_world @ Vector((key.dimensions.x * u, 0, key.dimensions.z * v))
                    origin = scene.camera.matrix_world.translation.copy(); delta = p - origin
                    for _ in range(80):
                        hit, loc, normal, index, obj, matrix = scene.ray_cast(bpy.context.evaluated_depsgraph_get(), origin, delta.normalized(), distance=delta.length-.015)
                        if not hit or obj.original not in scenery: break
                        obj = obj.original
                        if obj.name in hidden: break
                        obj.hide_render = True; obj.hide_set(True); hidden.add(obj.name)
                        bpy.context.view_layer.update()
        fixes += [f'hid scenery: {name}' for name in sorted(hidden)]
    # Reduce the lens rather than moving outside indoor walls. This preserves
    # camera motion and avoids an extreme close-up caused by a second person.
    for _ in range(35):
        heights = []
        for f in frames:
            scene.frame_set(f); bpy.context.view_layer.update()
            heights.extend(visible_height(projected(scene, scene.camera, h)) for h in heads)
        if not heights or max(heights) <= rules['face_max'] or rules['emotion']: break
        scene.camera.data.lens *= .93
    face = max(heights, default=0)
    if heads and not rules['emotion'] and face > rules['face_max'] + .001: raise ValueError('face framing could not be corrected')
    peak = None
    if key and rules['wave_min']:
        scene.frame_set(preview_frames(n, True)[0]); bpy.context.view_layer.update()
        peak = visible_height(projected(scene, scene.camera, key))
        if peak < rules['wave_min']:
            factor = min(3, rules['wave_min'] / max(.01, peak) * 1.08)
            key.scale *= factor; bpy.context.view_layer.update()
            peak = visible_height(projected(scene, scene.camera, key))
            fixes.append(f'enlarged wave {factor:.2f}x')
        if peak < rules['wave_min']: raise ValueError('wave below 25%')
    audit = {'sampled_frames': frames, 'hidden_scenery': sorted(hidden), 'face_height_max': face,
             'emotion_exception': rules['emotion'], 'wave_height_peak': peak, 'fixes': fixes,
             'lens': scene.camera.data.lens, 'limits': rules}
    Path(out, 'composition-qa.json').write_text(json.dumps(audit, indent=2))