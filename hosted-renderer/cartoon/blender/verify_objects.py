"""Fail a render on nonfinite evaluated transforms or incorrect real mechanism state."""
import math
import bpy
from mathutils import Vector
from object_motion import fuse_position,exploded,rail_gap


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
        rails={o.get('motion_role'):o for o in tracked if o.get('motion_role') in ('rail_left','rail_right')}
        if rails:
            # measured gap between the evaluated inner rail-head ends must equal the pure gap at every frame
            for f in range(1,count+1):
                bpy.context.scene.frame_set(f);bpy.context.view_layer.update();t=(f-1)/fps
                ends=[]
                for role,sign in (('rail_left',1),('rail_right',-1)):
                    xs=[(o.matrix_world@Vector(c)).x for o in rails[role].children if o.name.startswith('rail head') for c in o.bound_box]
                    ends.append(max(xs) if sign>0 else min(xs))
                gap=(ends[1]-ends[0])/root.scale[0]
                if abs(gap-rail_gap(root['story_action'],t))>.003:raise RuntimeError(f'rail gap {gap:.4f} != {rail_gap(root["story_action"],t):.4f} at frame {f}')
        report.append({'kind':root['story_kind'],'action':root['story_action'],'frames_checked':count,'moving_parts':len(tracked),'max_translation':{name:round(max(math.dist(p,ps[0]) for p in ps),5) for name,ps in positions.items()}})
    bpy.context.scene.frame_set(1)
    print('OBJECT_GEOMETRY_QA',report,flush=True)
    return report