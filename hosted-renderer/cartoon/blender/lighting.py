"""House lighting rig (benchmark look): a bright key from the upper left, a coloured rim light from behind, a soft warm pool of light on the cast,
and a lifted ambient so nothing is muddy. Called after the scene is built. ADVANCED_RIG=off keeps the old lights."""
import math, os
import bpy

RIG = {  # mode: key colour, key energy, rim colour, rim energy, pool colour, pool watts, ambient strength
    'day': ((1.0, 0.93, 0.80), 3.6, (1.0, 0.85, 0.65), 1.6, (1.0, 0.9, 0.7), 260, 1.15),
    'sunset': ((1.0, 0.70, 0.42), 3.4, (1.0, 0.5, 0.35), 2.2, (1.0, 0.75, 0.45), 320, 1.0),
    'night': ((0.5, 0.66, 1.0), 1.9, (0.5, 0.72, 1.0), 3.2, (1.0, 0.72, 0.4), 640, 0.85),
    'rain': ((0.8, 0.86, 0.95), 2.4, (0.7, 0.8, 0.95), 1.4, (0.95, 0.9, 0.8), 240, 1.0),
}


def _sun(name, rot, color, energy, angle=4.0):
    ld = bpy.data.lights.new(name, 'SUN'); ld.color = color; ld.energy = energy; ld.angle = math.radians(angle)
    ob = bpy.data.objects.new(name, ld); bpy.context.collection.objects.link(ob); ob.rotation_euler = rot
    return ob


def apply_rig(mode, cast_center, has_cast):
    if os.environ.get('ADVANCED_RIG', 'on') == 'off': return False
    key_c, key_e, rim_c, rim_e, pool_c, pool_w, amb = RIG.get(mode, RIG['day'])
    for o in list(bpy.data.objects):                       # replace the legacy suns so the rig is the only directional light
        if o.type == 'LIGHT' and o.data.type == 'SUN': bpy.data.objects.remove(o, do_unlink=True)
    _sun('rig key', (math.radians(48), 0, math.radians(-38)), key_c, key_e)                # warm, from the upper left front
    _sun('rig rim', (math.radians(68), 0, math.radians(152)), rim_c, rim_e, angle=8.0)     # from behind the cast: bright edge light
    world = bpy.context.scene.world
    if world and world.node_tree:
        bg = world.node_tree.nodes.get('Background')
        if bg: bg.inputs['Strength'].default_value = amb
    if has_cast:                                           # soft pool of light on the characters (the vignette of the benchmark)
        ld = bpy.data.lights.new('rig pool', 'SPOT'); ld.color = pool_c; ld.energy = pool_w * 6; ld.spot_size = math.radians(58); ld.spot_blend = 0.85; ld.shadow_soft_size = 1.2
        ob = bpy.data.objects.new('rig pool', ld); bpy.context.collection.objects.link(ob); ob.location = (cast_center[0], cast_center[1] - 1.5, 7.0); ob.rotation_euler = (math.radians(8), 0, 0)
    return True
