"""Blender side of step-7 effects, crowds and camera moves; all motion comes from effects.py."""
import math
import bpy
from mathutils import Vector
from effects import particles, state, crowd_layout, crowd_bob, shake_offset, whip_blend
from set_detail import material

def _glow(name, color, strength):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1); b.inputs['Emission Color'].default_value = (*color, 1)
    b.inputs['Emission Strength'].default_value = strength; return m

MATS = {}
def mats():
    if not MATS:
        MATS.update(fire=_glow('fx fire', (1, .45, .06), 9), core=_glow('fx core', (1, .85, .3), 14), spark=_glow('fx spark', (1, .7, .2), 30),
                    smoke=material('fx smoke', (.09, .085, .08), .98), dust=material('fx dust', (.46, .38, .27), .98),
                    debris=material('fx debris', (.2, .14, .09), .9), rain=material('fx rain', (.7, .78, .9), .1))
    return MATS

def _mesh(kind, role):
    if role in ('debris',): bpy.ops.mesh.primitive_cube_add(size=1)
    elif kind == 'rain': bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=1, depth=18)
    else: bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2 if role in ('smoke', 'dust') else 1, radius=1)
    o = bpy.context.active_object
    if role not in ('debris',):
        for p in o.data.polygons: p.use_smooth = True
    return o

def build_effects(shot, fps):
    n = round(shot['duration'] * fps); m = mats(); count = 0
    for e in shot.get('effects', []):
        kind = e['kind']; base = Vector(e['pos']); sc = e.get('scale', 1)
        for p in particles(kind, e.get('seed', 0)):
            role = p['role']; o = _mesh(kind, role); o.name = f'fx {kind} {role}'
            o.data.materials.append(m['core'] if role == 'fireball' and p['i'] < 5 else m['fire'] if role in ('fireball', 'fire') else
                                    m['spark'] if kind == 'sparks' else m['smoke'] if role == 'smoke' else m['dust'] if kind == 'dust' else m['rain'] if kind == 'rain' else m['debris'])
            o.visible_shadow = role in ('debris', 'smoke', 'dust'); o.rotation_euler = (p['a'], p['u'], p['a'] * 2)
            for f in range(n):
                x, y, z, s = state(kind, p, f / fps - e.get('start', 0), sc)
                o.location = base + Vector((x, y, z)); o.scale = (s, s, s) if s > 0 else (1e-4,) * 3
                if role == 'debris': o.rotation_euler.x = p['a'] + f * .25
                o.keyframe_insert('location', frame=f + 1); o.keyframe_insert('scale', frame=f + 1)
                if role == 'debris': o.keyframe_insert('rotation_euler', frame=f + 1)
            count += 1
        if kind in ('explosion', 'fire'):  # real light from the blast that lights the set and cast
            ld = bpy.data.lights.new('fx light', 'POINT'); ld.color = (1, .55, .2); lo = bpy.data.objects.new('fx light', ld)
            bpy.context.collection.objects.link(lo); lo.location = base + Vector((0, 0, .8))
            for f in range(n):
                t = f / fps - e.get('start', 0)
                ld.energy = 0 if t < 0 else (4000 * sc * math.exp(-t * 3) if kind == 'explosion' else 300 * sc * (.8 + .2 * math.sin(t * 29)))
                ld.keyframe_insert('energy', frame=f + 1)
    return count

def build_crowd(shot, fps):
    cr = shot.get('crowd')
    if not cr: return 0
    n = round(shot['duration'] * fps); yaw = math.radians(cr.get('yaw', 0))
    skin = material('crowd ivory', (.94, .93, .88), .6); ink = material('crowd ink', (.012, .013, .015), .65)
    cloth = [material(f'crowd cloth {i}', c, .88) for i, c in enumerate([(.13, .36, .3), (.55, .12, .08), (.12, .2, .45), (.42, .32, .14), (.25, .25, .27), (.6, .5, .2)])]
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8); head = bpy.context.active_object; head.data.materials.append(skin)
    head.scale = (.17, .15, .2); bpy.ops.object.transform_apply(scale=True); head_mesh = head.data; bpy.data.objects.remove(head)
    bodies = []
    for c in cloth:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8); b = bpy.context.active_object; b.data.materials.append(c)
        b.scale = (.17, .13, .26); bpy.ops.object.transform_apply(scale=True); bodies.append(b.data); bpy.data.objects.remove(b)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=4); e = bpy.context.active_object; e.data.materials.append(ink)
    e.scale = (.02, .01, .028); bpy.ops.object.transform_apply(scale=True); eye_mesh = e.data; bpy.data.objects.remove(e)
    pts = crowd_layout(cr['count'], cr['center'], cr['size'], cr.get('seed', 0))
    for i, (x, y, s, ci, ph) in enumerate(pts):
        root = bpy.data.objects.new(f'crowd {i}', None); bpy.context.collection.objects.link(root)
        root.rotation_euler.z = yaw + (ph - math.pi) * .08; root.scale = (s, s, s)
        for name, me, loc in (('body', bodies[ci], (0, 0, .5)), ('head', head_mesh, (0, 0, .95)), ('eye', eye_mesh, (-.06, -.15, 1.0)), ('eye', eye_mesh, (.06, -.15, 1.0))):
            o = bpy.data.objects.new(f'crowd {name}', me); bpy.context.collection.objects.link(o); o.parent = root; o.location = loc
        for f in range(0, n, 2):
            root.location = (x, y, crowd_bob(cr.get('action', 'stand'), ph, f / fps)); root.keyframe_insert('location', frame=f + 1)
    return len(pts)

def camera_moves(cam, target, shot, fps):
    c = shot['camera']; n = round(shot['duration'] * fps)
    if 'whip_from' in c:
        a, b = Vector(c['whip_from']), Vector(c['look_at'])
        for f in range(n): target.location = a.lerp(b, whip_blend(f / fps)); target.keyframe_insert('location', frame=f + 1)
        bpy.context.scene.render.use_motion_blur = True; bpy.context.scene.render.motion_blur_shutter = .5
    if c.get('shake'):
        for f in range(n):
            dx, dy, dz = shake_offset(f / fps, c['shake']); fc = cam.animation_data.action.fcurves
            for k, d in enumerate((dx, dy, dz)):
                kp = [p for p in fc.find('location', index=k).keyframe_points if int(p.co.x) == f + 1][0]; kp.co.y += d; kp.handle_left.y += d; kp.handle_right.y += d
