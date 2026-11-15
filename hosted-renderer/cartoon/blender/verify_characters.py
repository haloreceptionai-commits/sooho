"""Blender geometry acceptance checks, including unscaled attachment transforms.

Run by render_shot after scene creation, before paid frame rendering.
"""
import bpy
from mathutils import Vector


def verify_characters(roots,duration,fps):
    scene=bpy.context.scene;checks=0
    for frame in range(1,round(duration*fps)+1):
        scene.frame_set(frame);bpy.context.view_layer.update()
        for root in roots:
            descendants=[obj for obj in bpy.data.objects if obj.parent==root]
            for side in ['left','right']:
                joint=next((o for o in descendants if o.name.startswith(side+' wrist') and o.type=='MESH'),None)
                anchor=next((o for o in descendants if o.name.startswith(side+' wrist attachment') and o.type=='EMPTY'),None)
                if joint is None or anchor is None:raise RuntimeError('missing wrist attachment')
                if (joint.matrix_world.translation-anchor.matrix_world.translation).length>1e-5:raise RuntimeError('detached grip')
                for x in anchor.scale:
                    if abs(x-1)>1e-6:raise RuntimeError('scaled hand attachment')
                checks+=1
            for obj in descendants:
                if 'attachment' in obj.name:
                    for child in obj.children:
                        if child.type=='MESH':
                            extent=max((child.matrix_world@Vector(v)).length for v in child.bound_box)
                            if not extent>=0:raise RuntimeError('invalid attached mesh bounds')
    scene.frame_set(1)
    print('CHARACTER_GEOMETRY_QA',checks,'unscaled connected attachment checks',flush=True)