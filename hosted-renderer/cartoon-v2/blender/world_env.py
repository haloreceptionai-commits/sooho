"""Blender side of the cartoon-v2 world pipeline.

An Everything World zone (GLB exported from the three.js world) becomes the set of a shot:
the GLB is imported as-is, a sky and sun are added for the chosen time of day, and an optional
asphalt lane is laid down the middle of a zone. Runs inside Blender only (render_shot.py calls it).
"""
import math
from pathlib import Path

import bpy
from mathutils import Vector

from realistic_env import apply_hdri

PIPE = Path(__file__).resolve().parent.parent      # hosted-renderer/cartoon-v2


def _asphalt():
    m = bpy.data.materials.get('V2Asphalt')
    if m:
        return m
    m = bpy.data.materials.new('V2Asphalt')
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.045, 0.047, 0.05, 1)
    b.inputs['Roughness'].default_value = 0.85
    return m


def _paint():
    m = bpy.data.materials.get('V2LaneWhite')
    if m:
        return m
    m = bpy.data.materials.new('V2LaneWhite')
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.9, 0.9, 0.88, 1)
    b.inputs['Roughness'].default_value = 0.6
    return m


COLOUR_FLOOR = 0.18   # base colours darker than this on every channel are lifted to this grey


def _lift_black_materials(new_objs):
    """Some exports write near-black base colours (0.01) for roads and walls, which render as
    black voids. Those materials are lifted to a dark grey. Other colours are left unchanged."""
    seen = set()
    for o in new_objs:
        for slot in o.material_slots:
            m = slot.material
            if m is None or m.name in seen or not m.use_nodes:
                continue
            seen.add(m.name)
            bsdf = [n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED']
            if not bsdf:
                continue
            c = bsdf[0].inputs['Base Color']
            if not c.is_linked and max(c.default_value[:3]) < 0.05:
                c.default_value = (COLOUR_FLOOR, COLOUR_FLOOR, COLOUR_FLOOR, 1.0)


def import_glb(rel_path, zone_name):
    """Import one exported zone and move its centre to the origin. Returns the new objects."""
    from world_topics import ZONES
    path = (PIPE / rel_path).resolve()
    if not path.is_file():
        raise FileNotFoundError(f'world file missing: {path}')
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    new = [o for o in bpy.data.objects if o not in before]
    _lift_black_materials(new)
    cx, cz = ZONES[zone_name]['centre']
    # Blender space of the GLB is (x, -z, y): the zone centre is at (cx, -cz)
    for o in new:
        if o.parent is None:
            o.location.x -= cx
            o.location.y -= -cz
    return new


def add_lane(centre, length, width=6.4, top=0.14):
    """Asphalt lane along X through `centre` (Blender x, y), with white centre dashes.
    `top` lifts it above the zone's paving slab (about 0.12 m)."""
    cx, cy = centre
    bpy.ops.mesh.primitive_plane_add(size=1, location=(cx, cy, top))
    road = bpy.context.active_object
    road.name = 'V2_Lane'
    road.scale = (length, width, 1)
    road.data.materials.append(_asphalt())
    half = length / 2 - 8
    x = cx - half
    while x <= cx + half:
        bpy.ops.mesh.primitive_plane_add(size=1, location=(x, cy, top + 0.01))
        dash = bpy.context.active_object
        dash.name = 'V2_Dash'
        dash.scale = (3.5, 0.2, 1)
        dash.data.materials.append(_paint())
        x += 8
    return road


# Ground colour per zone category (manifest order: residential, commercial, transport,
# industrial/military, natural, historical). Used under every zone, so no void shows at the edge.
CATEGORY_GROUND = {
    'Residential': (0.36, 0.40, 0.27),
    'Commercial & Public': (0.40, 0.40, 0.40),
    'Transport': (0.26, 0.27, 0.29),
    'Industrial, Science & Military': (0.34, 0.31, 0.24),
    'Natural & Outdoor': (0.24, 0.38, 0.19),
    'Historical & Fantasy': (0.38, 0.34, 0.28),
}


def add_ground(zone_name, margin=40.0):
    """A flat ground plane the size of the zone plus a margin, below everything the GLB built."""
    from world_topics import ZONES
    z = ZONES[zone_name]
    m = bpy.data.materials.new('V2Ground')
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*CATEGORY_GROUND.get(z['category'], (0.35, 0.35, 0.33)), 1)
    b.inputs['Roughness'].default_value = 0.95
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0.0, 0.0, -0.03))
    g = bpy.context.active_object
    g.name = 'V2_Ground'
    g.scale = (z['size'][0] + margin, z['size'][1] + margin, 1)
    g.data.materials.append(m)
    return g


def add_sun(lighting):
    """Key sun for the time of day. Night gets no sun; the sky is dimmed instead."""
    if lighting == 'night':
        return None
    energy = {'day': 3.5, 'sunset': 2.2, 'rain': 1.2}.get(lighting, 3.5)
    elev = {'day': 55, 'sunset': 12, 'rain': 40}.get(lighting, 55)
    tint = {'day': (1.0, 0.95, 0.88), 'sunset': (1.0, 0.62, 0.35), 'rain': (0.75, 0.8, 0.9)}.get(lighting, (1, 1, 1))
    data = bpy.data.lights.new('V2Sun', type='SUN')
    data.energy = energy
    data.color = tint
    sun = bpy.data.objects.new('V2Sun', data)
    bpy.context.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(elev), 0, math.radians(-35))
    return sun


CLEAR_RADIUS = 5.0   # metres: imported meshes closer than this to the camera are hidden for the shot


def _dist_point_box(p, lo, hi):
    d = 0.0
    for i in range(3):
        if p[i] < lo[i]: d += (lo[i] - p[i]) ** 2
        elif p[i] > hi[i]: d += (p[i] - hi[i]) ** 2
    return math.sqrt(d)


def clear_near_camera(objs, eye, radius=CLEAR_RADIUS):
    """Delete the faces of imported meshes that come within `radius` of the camera.
    The full world merges each area into large chunks, so hiding a whole chunk would also remove
    the buildings around it. Only the faces touching the lens space are removed.
    Returns the number of faces removed."""
    import bmesh
    p = Vector(eye)
    removed = 0
    for root in objs:
        for o in [root] + list(root.children_recursive):
            if o.type != 'MESH' or not o.bound_box:
                continue
            pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
            lo = [min(v[i] for v in pts) for i in range(3)]
            hi = [max(v[i] for v in pts) for i in range(3)]
            if _dist_point_box(p, lo, hi) >= radius:
                continue
            if o.data.users > 1:
                o.data = o.data.copy()
            bm = bmesh.new()
            bm.from_mesh(o.data)
            mw = o.matrix_world
            near = []
            for f in bm.faces:
                if any((mw @ v.co - p).length < radius for v in f.verts):
                    near.append(f)
            if near:
                bmesh.ops.delete(bm, geom=near, context='FACES')
                removed += len(near)
                bm.to_mesh(o.data)
            bm.free()
    return removed


BACKDROP_FACTOR = 2.0   # a mesh wider than this many zone lengths is sky, sea or distant terrain


def hide_backdrops(objs, zone_name):
    """The exported zones include very large meshes (sky domes, sea, distant terrain) that are
    many kilometres wide. They are not part of the zone and can cover the camera, so they are
    removed from the shot. Returns how many meshes were hidden."""
    from world_topics import ZONES
    z = ZONES[zone_name]
    limit = BACKDROP_FACTOR * max(z['size'])
    hidden = 0
    for root in objs:
        for o in [root] + list(root.children_recursive):
            if o.type != 'MESH' or not o.bound_box:
                continue
            pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
            span = max(max(v[i] for v in pts) - min(v[i] for v in pts) for i in range(3))
            if span > limit:
                o.hide_render = True
                o.hide_viewport = True
                hidden += 1
    return hidden


def _sand():
    m = bpy.data.materials.get('V2Sandbag')
    if m:
        return m
    m = bpy.data.materials.new('V2Sandbag')
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.55, 0.47, 0.3, 1)
    b.inputs['Roughness'].default_value = 0.95
    return m


def _crater():
    m = bpy.data.materials.get('V2Crater')
    if m:
        return m
    m = bpy.data.materials.new('V2Crater')
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.1, 0.09, 0.08, 1)
    b.inputs['Roughness'].default_value = 1.0
    return m


def add_battlefield_props(eye, seed=7):
    """Sandbag lines and shell craters in front of the camera, so the battlefield zone reads as
    a battlefield. Placed in Blender space in the area the camera looks at."""
    import random
    rnd = random.Random(seed)
    ex, ey = eye[0], eye[1]
    made = 0
    for row in range(4):                       # four sandbag lines, running across the view
        x = ex + 14 + row * 9
        for k in range(14):
            y = -16 + k * 2.4 + rnd.uniform(-0.3, 0.3)
            if k % 6 == 3:
                continue                       # a gap, so the wall reads as a trench line
            bpy.ops.mesh.primitive_cube_add(size=1, location=(x + rnd.uniform(-0.2, 0.2), y, 0.3))
            s = bpy.context.active_object
            s.name = 'V2_Sandbag'
            s.scale = (0.9, 1.2, 0.5)
            s.rotation_euler = (0, 0, rnd.uniform(-0.15, 0.15))
            s.data.materials.append(_sand())
            made += 1
    for _ in range(40):                        # craters in the ground around the trench lines
        x = ex + rnd.uniform(10, 70)
        y = rnd.uniform(-28, 28)
        r = rnd.uniform(1.2, 3.5)
        bpy.ops.mesh.primitive_circle_add(vertices=16, fill_type='NGON', radius=r, location=(x, y, 0.02))
        c = bpy.context.active_object
        c.name = 'V2_Crater'
        c.data.materials.append(_crater())
        made += 1
    return made


ZONE_MARGIN = 60.0   # metres beyond a zone's own edge that still counts as part of the zone


def hide_outside_zone(objs, zone_name, margin=ZONE_MARGIN):
    """Hide meshes whose bounding box lies outside the zone (plus a margin). The exported zone
    files also carry distant pieces of the world; they are not part of this zone. Works in zone-local
    Blender space, where the zone centre is the origin. Returns how many were hidden."""
    from world_topics import ZONES
    w, d = ZONES[zone_name]['size']
    hx, hy = w / 2 + margin, d / 2 + margin
    hidden = 0
    for root in objs:
        for o in [root] + list(root.children_recursive):
            if o.type != 'MESH' or not o.bound_box or o.hide_render:
                continue
            pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
            lo = [min(v[i] for v in pts) for i in range(3)]
            hi = [max(v[i] for v in pts) for i in range(3)]
            if hi[0] < -hx or lo[0] > hx or hi[1] < -hy or lo[1] > hy:
                o.hide_render = True
                o.hide_viewport = True
                hidden += 1
    return hidden


def hide_containing(objs, eye):
    """Hide meshes whose bounding box holds the camera. A camera placed inside a solid barrier
    or pier would otherwise look out through the barrier's walls. Returns how many were hidden."""
    p = Vector(eye)
    hidden = 0
    for root in objs:
        for o in [root] + list(root.children_recursive):
            if o.type != 'MESH' or not o.bound_box:
                continue
            pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
            lo = [min(v[i] for v in pts) for i in range(3)]
            hi = [max(v[i] for v in pts) for i in range(3)]
            if all(lo[i] <= p[i] <= hi[i] for i in range(3)):
                o.hide_render = True
                o.hide_viewport = True
                hidden += 1
    return hidden


def build_world(cfg, lighting, camera=None):
    """cfg: the shot's 'world' block (zone, file, road, lighting). Sets up the whole set.
    camera: the shot's camera dict, used to hide imported objects that would block the lens."""
    objs = import_glb(cfg['file'], cfg['zone'])
    add_ground(cfg['zone'])
    backdrops = hide_backdrops(objs, cfg['zone'])
    cleared = clear_near_camera(objs, camera['from']) if camera else 0
    if camera:
        backdrops += hide_containing(objs, camera['from'])
    props = add_battlefield_props(camera['from']) if (camera and cfg['zone'] == 'Battlefield') else 0
    lane = None
    if cfg.get('road'):
        # imported zones are centred on the origin, so the lane runs through (0, 0)
        lane = add_lane((0.0, 0.0), length=_zone_length(cfg['zone']))
    sc = bpy.context.scene
    strength = 0.25 if lighting == 'night' else 1.0
    apply_hdri(sc.world, strength=strength)
    add_sun(lighting)
    return {'objects': len(objs), 'lane': lane is not None, 'hidden_near_camera': cleared, 'backdrops_hidden': backdrops, 'props': props}


def _zone_length(zone_name):
    from world_topics import ZONES
    return float(ZONES[zone_name]['size'][0])
