"""Rideable and climbable things built from simple shapes in the toy look of the cast: an open cartoon car, a bicycle, a ladder.
The car is open on top so the driver is seen at the wheel. Heading is -y at yaw 0 (the way a character faces); wheels turn with the distance driven.
Pure bpy builders; shot_schema validates the `rigs` list: {kind: car|bike|ladder, pos:[x,y], yaw, to:[x,y], color:[r,g,b]}.
"""
import math
import bpy
from set_detail import material, cube, rope

KINDS = ('car', 'bike', 'ladder')
CAR_COLORS = [(.9, .2, .18), (.2, .5, .95), (.98, .78, .15), (.25, .75, .45)]


def _box(name, pos, size, mat, bevel=.03, parent=None):
    o = cube(name, pos, size, mat, bevel)
    if parent: o.parent = parent
    return o


def _wheel(name, pos, radius, width, tyre, hub, parent):
    bpy.ops.mesh.primitive_cylinder_add(vertices=28, radius=radius, depth=width, location=pos, rotation=(0, math.pi / 2, 0))
    w = bpy.context.active_object; w.name = name; w.data.materials.append(tyre); w.parent = parent
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=radius * .55, depth=width * 1.08, location=pos, rotation=(0, math.pi / 2, 0))
    h = bpy.context.active_object; h.name = name + ' hub'; h.data.materials.append(hub); h.parent = parent
    return w, h


def build_car(rig):
    color = tuple(rig.get('color') or CAR_COLORS[0])
    root = bpy.data.objects.new('car', None); bpy.context.collection.objects.link(root)
    paint = material('car paint %s' % (color,), color, .35, .1); dark = material('car dark', (.08, .08, .1), .6); seat = material('car seat', (.95, .9, .8), .8)
    chrome = material('car chrome', (.8, .82, .86), .25, .9); glass = material('car glass', (.55, .78, .95), .1)
    _box('car chassis', (0, 0, .36), (1.5, 3.0, .3), paint, .08, root)
    _box('car hood', (0, -1.0, .62), (1.38, 1.0, .22), paint, .08, root)
    _box('car trunk', (0, 1.15, .6), (1.38, .7, .2), paint, .07, root)
    _box('car seat', (0, .15, .52), (1.0, .5, .16), seat, .05, root)
    _box('car seat back', (0, .52, .8), (1.0, .12, .5), seat, .05, root)
    _box('car dashboard', (0, -.6, .8), (1.3, .25, .3), paint, .06, root)
    for sx in (-1, 1):
        _box('car door', (sx * .74, .1, .62), (.06, 1.5, .34), paint, .03, root)
        _box('windshield post', (sx * .66, -.55, 1.05), (.05, .06, .55), chrome, .01, root)
    _box('windshield', (0, -.62, 1.1), (1.28, .035, .46), glass, 0, root)
    _box('windshield top', (0, -.62, 1.34), (1.34, .06, .05), chrome, .01, root)
    for sx in (-1, 1):
        bpy.ops.mesh.primitive_uv_sphere_add(location=(sx * .5, -1.52, .66), segments=16, ring_count=8); h = bpy.context.active_object; h.scale = (.14, .08, .14); h.name = 'headlight'; h.parent = root
        h.data.materials.append(material('headlight', (1, .95, .7), .2, 0, 3.0))
    bpy.ops.mesh.primitive_torus_add(location=(0, -.45, 1.0), major_radius=.2, minor_radius=.025, rotation=(math.radians(60), 0, 0)); w_ = bpy.context.active_object
    w_.name = 'steering wheel'; w_.data.materials.append(dark); w_.parent = root
    tyre = material('car tyre', (.06, .06, .07), .85); hub = material('car hub', (.85, .85, .88), .3, .8)
    wheels = []
    for i, (sx, y) in enumerate(((-1, -1.0), (1, -1.0), (-1, 1.0), (1, 1.0))):
        w, h = _wheel('wheel %d' % i, (sx * .78, y, .32), .32, .2, tyre, hub, root); wheels += [(w, (sx * .78, y, .32)), (h, (sx * .78, y, .32))]
    return root, wheels, .32


def build_bike(rig):
    color = tuple(rig.get('color') or CAR_COLORS[1])
    root = bpy.data.objects.new('bike', None); bpy.context.collection.objects.link(root)
    paint = material('bike paint %s' % (color,), color, .4, .3); dark = material('bike dark', (.06, .06, .08), .8)
    wheels = []
    for i, y in enumerate((-.62, .62)):
        bpy.ops.mesh.primitive_torus_add(location=(0, y, .36), major_radius=.34, minor_radius=.035, rotation=(0, math.pi / 2, 0), major_segments=32, minor_segments=8)
        w = bpy.context.active_object; w.name = 'bike wheel %d' % i; w.data.materials.append(dark); w.parent = root; wheels.append((w, (0, y, .36)))
    for a, b in (((0, -.62, .36), (0, -.2, .72)), ((0, -.2, .72), (0, .38, .74)), ((0, .38, .74), (0, .62, .36)), ((0, .38, .74), (0, 0, .32)), ((0, 0, .32), (0, -.2, .72)),
                 ((0, 0, .32), (0, .62, .36)), ((0, -.2, .72), (0, -.5, .98))):
        rope('bike frame', a, b, .022, paint).parent = root
    _box('bike saddle', (0, .4, .79), (.12, .3, .05), dark, .02, root); _box('bike handlebar', (0, -.5, 1.0), (.5, .04, .04), dark, .01, root)
    return root, wheels, .34


def build_ladder(rig):
    root = bpy.data.objects.new('ladder', None); bpy.context.collection.objects.link(root)
    wood = material('ladder wood', (.72, .5, .26), .7)
    for sx in (-.3, .3): _box('ladder rail', (sx, .0, 1.5), (.06, .06, 3.0), wood, .01, root)
    for k in range(10): _box('ladder rung', (0, 0, .25 + k * .3), (.6, .04, .04), wood, .008, root)
    return root, [], 1


BUILDERS = {'car': build_car, 'bike': build_bike, 'ladder': build_ladder}


def build_rig(rig, duration, fps):
    """Builds the rig, drives it from `pos` to `to` over the shot and turns its wheels with the distance travelled."""
    frames = max(1, round(duration * fps))
    root, wheels, radius = BUILDERS[rig['kind']](rig)
    yaw = math.radians(rig.get('yaw', 0)); x0, y0 = rig['pos']; x1, y1 = rig.get('to') or rig['pos']
    for f in range(frames + 1):
        u = f / max(1, frames); root.location = (x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, 0); root.rotation_euler = (0, 0, yaw)
        root.keyframe_insert('location', frame=f + 1); root.keyframe_insert('rotation_euler', frame=f + 1)
    dist = math.hypot(x1 - x0, y1 - y0)
    # Each wheel is re-parented to an empty at its axle, so spinning the empty about x turns the wheel in place.
    for w, axle in wheels:
        pivot = bpy.data.objects.new('axle', None); bpy.context.collection.objects.link(pivot); pivot.parent = root; pivot.location = axle
        w.parent = pivot; w.location = (0, 0, 0) if w.type != 'MESH' else (w.location[0] - axle[0], w.location[1] - axle[1], w.location[2] - axle[2])
        for f in range(frames + 1):
            pivot.rotation_euler = (-dist * (f / max(1, frames)) / radius, 0, 0); pivot.keyframe_insert('rotation_euler', frame=f + 1)
    return root
