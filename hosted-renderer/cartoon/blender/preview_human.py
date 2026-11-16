"""Local character evaluation only; no paid dispatch or production replacement.

blender -b --disable-autoexec --python preview_human.py -- snow.blend output
The downloaded model's embedded scripts remain disabled.
"""
import json
import math
import os
import sys
import time
import bpy
from mathutils import Vector


def main():
    source, out = sys.argv[sys.argv.index('--') + 1:]
    os.makedirs(out, exist_ok=True)
    started = time.monotonic()
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(source), use_scripts=False)
    rig = bpy.data.objects.get('RIG-Snow')
    if rig is None:
        raise ValueError('Expected official Snow rig')
    props = rig.pose.bones.get('Properties')
    if props is None:
        raise ValueError('Missing Snow pose properties')
    for side in ('left', 'right'):
        props['ik_' + side + '_upperarm'] = 0.0
    for obj in bpy.data.objects:
        if obj.type == 'LIGHT':
            obj.data.energy *= 0.7
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 12
    scene.cycles.use_denoising = True
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 4
    scene.render.resolution_x = 600
    scene.render.resolution_y = 800
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.8, 0.8, 0.8, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.35
    if hasattr(scene, 'use_nodes'):
        scene.use_nodes = False
    camera = scene.camera
    camera.data.lens = 48
    camera.data.dof.use_dof = False
    poses = [('standing', -65, 65, 0), ('reaching', -20, 65, -30)]
    evidence = []
    for name, left, right, elbow in poses:
        for side, angle in [('L', left), ('R', right)]:
            arm = rig.pose.bones['FK-UpperArm.' + side]
            arm.rotation_mode = 'XYZ'
            arm.rotation_euler = (0, 0, math.radians(angle))
            forearm = rig.pose.bones['FK-Forearm.' + side]
            forearm.rotation_mode = 'XYZ'
            forearm.rotation_euler = (math.radians(elbow if side == 'L' else 0), 0, 0)
        scene.frame_set(1)
        bpy.context.view_layer.update()
        camera.location = (2.5, -4.8, 2.1)
        camera.rotation_euler = (Vector((0, 0, 0.95)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(out, name + '.png')
        bpy.ops.render.render(write_still=True)
        evidence.append({'pose': name, 'file': name + '.png'})
    with open(os.path.join(out, 'evaluation.json'), 'w') as f:
        json.dump({'credit': 'Snow Rig (CC) Blender Foundation | studio.blender.org',
                   'embedded_scripts_executed': False, 'azure_jobs': 0, 'paid_art_calls': 0,
                   'seconds': round(time.monotonic() - started, 2), 'stills': evidence,
                   'production_enabled': False}, f, indent=2)


if __name__ == '__main__':
    main()