"""Fail a render on nonfinite evaluated transforms or incorrect real mechanism state."""
import math
import bpy
from mathutils import Vector
from object_motion import fuse_position,exploded


def descendants(root):
    result=[]
    for child in root.children:result.append(child);result.extend(descendants(child))
    return result


def verify_objects(roots,duration,fps):
    count=round(duration*fps);report=[]
    for root in roots:
        children=descendants(root);tracked=[o for o in children if o.get('motion_role')]
        positions={o.name:[] for o in tracked}
        for f in range(1,count+1):
            bpy.context.scene.frame_set(f);bpy.context.view_layer.update();t=(f-1)/fps
            for o in children:
                if not all(math.isfinite(v) for row in o.matrix_world for v in row):raise RuntimeError('nonfinite object transform '+o.name)
                if o.get('intact_explosion_mesh') and o.hide_render!=exploded(t):raise RuntimeError('intact explosion state '+o.name)
                role=o.get('motion_role')
                if role:
                    positions[o.name].append(tuple(o.matrix_world.translation))
                    if role=='fuse' and (o.location-Vector(fuse_position(t))).length>1e-5:raise RuntimeError('ember off fuse '+o.name)
                    if role=='fragment' and o.hide_render==exploded(t):raise RuntimeError('fragment visibility '+o.name)
                    if role in ('fragment','flake') and not o.hide_render and o.matrix_world.translation.z<.018:raise RuntimeError('object crossed ground '+o.name)
        report.append({'kind':root['story_kind'],'action':root['story_action'],'frames_checked':count,'moving_parts':len(tracked),'max_translation':{name:round(max(math.dist(p,ps[0]) for p in ps),5) for name,ps in positions.items()}})
    bpy.context.scene.frame_set(1)
    print('OBJECT_GEOMETRY_QA',report,flush=True)
    return report