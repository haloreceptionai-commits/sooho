"""Blender geometry acceptance checks, including unscaled attachment transforms.

Run by render_shot after scene creation, before paid frame rendering.
"""
import bpy
import math
from mathutils import Vector


def verify_characters(roots,duration,fps):
    scene=bpy.context.scene;checks=0
    for frame in range(1,round(duration*fps)+1):
        scene.frame_set(frame);bpy.context.view_layer.update()
        for root in roots:
            if root.get('human_model'):
                for obj in root.children_recursive:
                    if obj.type == 'MESH':
                        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
                        if any(not math.isfinite(v) for vert in evaluated.data.vertices for v in vert.co):
                            raise RuntimeError('invalid skinned human geometry')
                        checks += 1
                continue
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
                            corners=[child.matrix_world@Vector(v) for v in child.bound_box]
                            if any(not math.isfinite(v) for corner in corners for v in corner):raise RuntimeError('invalid attached mesh bounds')
                            local_size=[max(v[i] for v in child.bound_box)-min(v[i] for v in child.bound_box) for i in range(3)]
                            actual_size=[child.matrix_world.to_3x3().col[i].length*local_size[i] for i in range(3)]
                            expected_size=[abs(child.scale[i]*root.scale[i])*local_size[i] for i in range(3)]
                            if any(abs(a-b)>1e-5 for a,b in zip(actual_size,expected_size)):raise RuntimeError('attachment inherited unintended scale')
                            if 'shoe' in child.name and min(v.z for v in corners)<-.003:raise RuntimeError('shoe below ground')
    scene.frame_set(1)
    print('CHARACTER_GEOMETRY_QA',checks,'unscaled connected attachment checks',flush=True)