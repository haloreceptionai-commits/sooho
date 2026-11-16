"""Headless Blender shot renderer for Advanced Video AI (benchmark step 2).

Run:  blender -b --factory-startup --python render_shot.py -- shot.json out_dir
Reads one declarative shot (validated by shot_schema.py, never code) and writes
PNG frames out_dir/f_00001.png ... Rendering uses Cycles on CPU so it needs no
graphics card or display: real sun/sky or lamp light, soft shadows, haze,
depth of field and AgX colour grading.
"""
import json, math, sys, time, os
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from shot_schema import validate_shot  # noqa: E402
from set_library import build_set, dress_mine as library_mine, surface
from characters import build_character
from story_objects import build_object
from verify_characters import verify_characters
from verify_objects import verify_objects
from fx_render import build_effects, build_crowd, camera_moves


def mat(name, color, rough=0.6, metal=0.0, emit=None, strength=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = strength
    return m


def noise_mat(name, c1, c2, scale=3.0, bump=0.4, rough=0.85, wave=False, speckle=0.0):
    """Two-tone procedural surface (rock, dirt, wood) with bump for real texture."""
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    co = nt.nodes.new('ShaderNodeNewGeometry')  # world position: no stretching on scaled objects
    tex = nt.nodes.new('ShaderNodeTexWave' if wave else 'ShaderNodeTexNoise')
    tex.inputs['Scale'].default_value = scale
    tex.inputs['Detail'].default_value = 8.0
    if wave:
        tex.wave_type = 'BANDS'; tex.bands_direction = 'Z'
        tex.inputs['Distortion'].default_value = 3.0; tex.inputs['Detail Scale'].default_value = 1.5
    nt.links.new(co.outputs['Position'], tex.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (*c1, 1); ramp.color_ramp.elements[1].color = (*c2, 1)
    nt.links.new(tex.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = bump
    nt.links.new(tex.outputs['Fac'], bp.inputs['Height'])
    if speckle:  # fine grit on top of the broad colour variation (benchmark rock look)
        sp = nt.nodes.new('ShaderNodeTexNoise'); sp.inputs['Scale'].default_value = 70; sp.inputs['Detail'].default_value = 2
        nt.links.new(co.outputs['Position'], sp.inputs['Vector'])
        b2 = nt.nodes.new('ShaderNodeBump'); b2.inputs['Strength'].default_value = speckle
        nt.links.new(sp.outputs['Fac'], b2.inputs['Height']); nt.links.new(bp.outputs['Normal'], b2.inputs['Normal'])
        nt.links.new(b2.outputs['Normal'], b.inputs['Normal'])
        dots = nt.nodes.new('ShaderNodeTexVoronoi'); dots.inputs['Scale'].default_value = 55
        nt.links.new(co.outputs['Position'], dots.inputs['Vector'])
        pit = nt.nodes.new('ShaderNodeMapRange'); pit.inputs['From Min'].default_value = 0.08; pit.inputs['From Max'].default_value = 0.16
        pit.inputs['To Min'].default_value = 0.45; pit.inputs['To Max'].default_value = 1.0
        nt.links.new(dots.outputs['Distance'], pit.inputs['Value'])
        dm = nt.nodes.new('ShaderNodeMix'); dm.data_type = 'RGBA'; dm.blend_type = 'MULTIPLY'; dm.inputs['Factor'].default_value = 1
        nt.links.new(ramp.outputs['Color'], dm.inputs['A']); nt.links.new(pit.outputs['Result'], dm.inputs['B'])
        nt.links.new(dm.outputs['Result'], b.inputs['Base Color'])
    nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    b.inputs['Roughness'].default_value = rough
    return m


def outline_mat():
    """Inverted-hull ink line: black on back faces, invisible on front faces."""
    m = bpy.data.materials.new('ink'); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    mix = nt.nodes.new('ShaderNodeMixShader')
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (0.01, 0.008, 0.006, 1)
    nt.links.new(geo.outputs['Backfacing'], mix.inputs['Fac'])
    # hull faces nearest the camera are back-facing (flipped) -> transparent; the rim beyond the body -> ink
    nt.links.new(em.outputs[0], mix.inputs[1]); nt.links.new(tr.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    return m


INK = None


def ink(obj, width=0.012):
    """Separate inverted hull child: slightly inflated copy with flipped normals."""
    global INK
    INK = INK or outline_mat()
    h = obj.copy(); h.data = obj.data.copy(); h.data.materials.clear(); h.data.materials.append(INK)
    for mo in list(h.modifiers): h.modifiers.remove(mo)
    bpy.context.collection.objects.link(h)
    d = h.modifiers.new('grow', 'DISPLACE'); d.strength = -width / max(min(obj.scale), 1e-3); d.mid_level = 0  # normals point inward after the flip
    for poly in h.data.polygons: poly.flip()
    h.parent = obj; h.location = (0, 0, 0); h.rotation_euler = (0, 0, 0); h.scale = (1, 1, 1)
    h.matrix_parent_inverse.identity()
    h.visible_shadow = False; h.visible_diffuse = False; h.visible_glossy = False
    h.visible_transmission = False; h.visible_volume_scatter = False  # camera-only line
    return obj


def add(kind, loc, scale=(1, 1, 1), rot=(0, 0, 0), m=None, smooth=True, **kw):
    getattr(bpy.ops.mesh, f'primitive_{kind}_add')(location=loc, rotation=rot, **kw)
    o = bpy.context.active_object; o.scale = scale
    if m: o.data.materials.append(m)
    if smooth and kind in ('uv_sphere', 'cylinder', 'cone'):
        bpy.ops.object.shade_smooth()
    return o


# ---------------------------------------------------------------- sets
def lantern(loc, red, glass):
    """Hanging miner's lantern: red cap and base, glowing glass, wire hook, real warm point light."""
    x, y, z = loc
    add('cylinder', (x, y, z - 0.11), (0.075, 0.075, 0.025), m=red, vertices=24)
    add('cylinder', (x, y, z + 0.11), (0.06, 0.06, 0.03), m=red, vertices=24)
    add('cylinder', (x, y, z), (0.055, 0.055, 0.09), m=glass, vertices=24)
    add('torus', (x, y, z + 0.17), (0.04, 0.04, 0.04), rot=(math.pi / 2, 0, 0), m=red, major_radius=1, minor_radius=0.12)
    bpy.ops.object.light_add(type='POINT', location=(x, y - 0.12, z))
    L = bpy.context.active_object.data; L.energy = 55; L.color = (1.0, 0.58, 0.26); L.shadow_soft_size = 0.05


def rock_mat():
    """Scanned CC0 rock texture, shared with the offline set library."""
    return surface('rock', 2.2)


def rock_chunk(loc, size, m, seed):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, location=loc)
    o = bpy.context.active_object
    o.scale = (size * (0.8 + 0.4 * ((seed * 7) % 5) / 4), size * (0.7 + 0.5 * ((seed * 3) % 4) / 3), size * 0.55)
    o.rotation_euler = (0, 0, seed * 1.7)
    tx = bpy.data.textures.new(f'chunk{seed}', 'CLOUDS'); tx.noise_scale = 0.4
    d = o.modifiers.new('d', 'DISPLACE'); d.texture = tx; d.strength = size * 0.6
    o.data.materials.append(m); bpy.ops.object.shade_flat()
    return o


def crate(loc, size, m, yaw=0.0):
    o = add('cube', (loc[0], loc[1], loc[2] + size / 2), (size * 0.6, size / 2, size / 2), rot=(0, 0, yaw), m=m, smooth=False)
    bev = o.modifiers.new('b', 'BEVEL'); bev.width = size * 0.04; bev.segments = 2
    return ink(o, 0.012)


def dress_mine(length, wood):
    """Scattered stones, crate stack, barrel and a blurred foreground boulder for depth."""
    stone = noise_mat('stone', (0.42, 0.40, 0.38), (0.72, 0.70, 0.66), scale=3, bump=0.5, speckle=0.3)
    plank = noise_mat('plank', (0.70, 0.55, 0.33), (0.88, 0.74, 0.50), scale=11.0, bump=0.1, wave=True)
    seed = 1
    for y in [i * 1.3 for i in range(-2, int(length / 1.3) - 3)]:
        for side in (-1, 1):
            seed += 1
            rock_chunk((side * (1.1 + 0.25 * (seed % 3)), y + 0.4 * (seed % 2), 0.05), 0.12 + 0.06 * (seed % 3), stone, seed)
    crate((-1.05, 2.2, 0), 0.6, plank, 0.15); crate((-1.0, 2.9, 0), 0.55, plank, -0.1); crate((-1.05, 2.5, 0.6), 0.5, plank, 0.3)
    barrel = ink(add('cylinder', (1.05, 3.4, 0.4), (0.3, 0.3, 0.4), m=wood, vertices=32), 0.012)
    for z in (0.12, 0.68):
        add('torus', (1.05, 3.4, z), (0.305, 0.305, 0.6), m=mat('hoop', (0.15, 0.15, 0.16), rough=0.4, metal=0.8), major_radius=1, minor_radius=0.04)


def tube(length, m, radius=2.3, ring=96, step=0.1, y0=-4.0, zc=1.4):
    """Evenly spaced tunnel shell (no stretched quads), displaced in world space and flat shaded."""
    verts, faces = [], []
    rows = int(length / step) + 1
    for r in range(rows):
        for k in range(ring):
            a = 2 * math.pi * k / ring
            verts.append((radius * math.cos(a), y0 + r * step, zc + radius * math.sin(a)))
    for r in range(rows - 1):
        for k in range(ring):
            i, j = r * ring + k, r * ring + (k + 1) % ring
            faces.append((i, j, j + ring, i + ring))
    me = bpy.data.meshes.new('tunnel'); me.from_pydata(verts, [], faces); me.update()
    o = bpy.data.objects.new('tunnel', me); bpy.context.collection.objects.link(o)
    me.materials.append(m)
    tx = bpy.data.textures.new('rockdisp', 'CLOUDS'); tx.noise_scale = 0.55; tx.noise_depth = 3
    d = o.modifiers.new('d', 'DISPLACE'); d.texture = tx; d.strength = 0.7; d.mid_level = 0.5; d.texture_coords = 'GLOBAL'
    return o


def set_mine_tunnel(length=24.0):
    rock = rock_mat()
    dirt = surface('dirt', 2.0)
    wood = surface('wood', 1.2)
    steel = mat('steel', (0.55, 0.56, 0.6), rough=0.3, metal=1.0)
    red = mat('lanternred', (0.45, 0.04, 0.03), rough=0.35, metal=0.4)
    glass = mat('lampglass', (1, 0.7, 0.4), emit=(1.0, 0.62, 0.28), strength=25)
    t = tube(length, rock)
    add('plane', (0, length / 2 - 4, 0), (2.6, length / 2, 1), m=dirt, smooth=False)
    for i, y in enumerate(range(-2, int(length) - 4, 3)):         # timber frames; a lantern on every other one
        for x in (-1.55, 1.55):
            ink(add('cube', (x, y, 1.15), (0.11, 0.11, 1.15), m=wood, smooth=False), 0.012)
        ink(add('cube', (0, y, 2.35), (1.7, 0.13, 0.12), m=wood, smooth=False), 0.012)
        if i % 2 == 0:
            lantern((1.3 if i % 4 == 0 else -1.3, y - 0.2, 1.95), red, glass)
    for x in (-0.45, 0.45):
        add('cube', (x, length / 2 - 4, 0.09), (0.035, length / 2, 0.045), m=steel, smooth=False)
    for y in [i * 0.55 for i in range(-6, int(length / 0.55) - 6)]:
        add('cube', (0, y, 0.03), (0.7, 0.09, 0.03), m=wood, smooth=False)
    library_mine()
    add('cube', (0.62, -0.9, 2.3), (0.08, 0.08, 0.35), m=wood, smooth=False)   # near-lens beam end and lantern:
    lantern((0.6, -0.95, 1.85), red, glass)                                     # out of focus foreground depth
    bpy.ops.object.light_add(type='AREA', location=(-1.2, -1.0, 2.0), rotation=(math.radians(62), 0, math.radians(-38)))
    K = bpy.context.active_object.data; K.energy = 70; K.size = 0.7; K.color = (1.0, 0.72, 0.45)  # warm key on the cast
    bpy.ops.object.light_add(type='AREA', location=(1.4, 1.8, 2.0), rotation=(math.radians(-60), 0, math.radians(150)))
    R = bpy.context.active_object.data; R.energy = 40; R.size = 0.8; R.color = (0.75, 0.82, 1.0)   # cool rim from behind
    w = bpy.context.scene.world.node_tree.nodes['Background']
    w.inputs['Color'].default_value = (0.01, 0.008, 0.006, 1); w.inputs['Strength'].default_value = 0.05


def set_open_day(length=24.0):
    grass = noise_mat('grass', (0.16, 0.30, 0.07), (0.38, 0.55, 0.16), scale=4, bump=0.3)
    add('plane', (0, 0, 0), (60, 60, 1), m=grass, smooth=False)
    w = bpy.context.scene.world.node_tree; nodes = w.nodes
    sky = nodes.new('ShaderNodeTexSky')
    try: sky.sky_type = 'NISHITA'; sky.sun_elevation = math.radians(28)
    except Exception: pass
    w.links.new(sky.outputs[0], nodes['Background'].inputs['Color'])
    nodes['Background'].inputs['Strength'].default_value=.18
    bpy.ops.object.light_add(type='SUN', rotation=(math.radians(55), 0, math.radians(35)))
    s = bpy.context.active_object.data; s.energy = 2; s.angle = math.radians(3)


SETS = {'mine_tunnel': set_mine_tunnel, 'open_day': set_open_day}


# ---------------------------------------------------------------- egg-head character
def character(c):
    skin = mat('skin', (0.93, 0.92, 0.88), rough=0.5)
    black = mat('black', (0.01, 0.01, 0.01), rough=0.4)
    shirt = mat('shirt', tuple(c.get('shirt', (0.15, 0.55, 0.45))), rough=0.8)
    hatc = tuple(c.get('hat_color', (0.78, 0.42, 0.03)))
    hatm = noise_mat('hat', hatc, tuple(x * 0.8 for x in hatc), scale=18, bump=0.25, wave=True)
    x, y = c['pos']; yaw = math.radians(c.get('yaw', 0)); S = c.get('scale', 1.0)
    root = bpy.data.objects.new('char', None); bpy.context.collection.objects.link(root)
    root.location = (x, y, 0); root.rotation_euler = (0, 0, yaw); root.scale = (S, S, S)
    parts = []
    head = ink(add('uv_sphere', (0, 0, 1.62), (0.26, 0.25, 0.31), m=skin, segments=48, ring_count=24)); parts.append(head)
    for ex in (-0.09, 0.09):
        parts.append(add('uv_sphere', (ex, -0.235, 1.64), (0.035, 0.02, 0.045), m=black))
        parts.append(add('cube', (ex, -0.245, 1.72), (0.05, 0.01, 0.008), m=black, smooth=False))  # brows
    parts.append(add('torus', (0, -0.235, 1.50), (0.06, 0.03, 0.025), rot=(math.pi / 2, 0, 0), m=black,
                     major_radius=1, minor_radius=0.25))  # mouth
    if c.get('hat', 'beanie') == 'beanie':
        parts.append(ink(add('uv_sphere', (0, 0, 1.80), (0.28, 0.27, 0.20), m=hatm, segments=32, ring_count=16)))
        parts.append(add('cylinder', (0, 0, 1.75), (0.285, 0.275, 0.05), m=hatm, vertices=32))
    body = ink(add('cylinder', (0, 0, 1.08), (0.17, 0.13, 0.26), m=shirt, vertices=32)); parts.append(body)
    for lx in (-0.07, 0.07):  # thin stick legs and arms
        parts.append(add('cylinder', (lx, 0, 0.42), (0.018, 0.018, 0.42), m=black, vertices=12))
        parts.append(add('uv_sphere', (lx, -0.04, 0.02), (0.05, 0.08, 0.03), m=black))
    for sx in (-1, 1):
        tilt = sx * 0.25; top = Vector((sx * 0.17, 0, 1.28)); half = 0.3
        mid = top + Vector((sx * math.sin(abs(tilt)) * half, 0, -math.cos(tilt) * half))
        parts.append(add('cylinder', tuple(mid), (0.016, 0.016, half), rot=(0, -tilt if sx > 0 else abs(tilt), 0), m=black, vertices=12))
        hand = top + Vector((sx * math.sin(abs(tilt)) * 2 * half, 0, -math.cos(tilt) * 2 * half))
        parts.append(add('uv_sphere', tuple(hand), (0.035, 0.035, 0.035), m=black))
    for p in parts: p.parent = root
    return root


# ---------------------------------------------------------------- camera
def ease(t): return t * t * (3 - 2 * t)


def camera(shot, fps):
    cam_d = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_d)
    bpy.context.collection.objects.link(cam); bpy.context.scene.camera = cam
    c = shot['camera']; cam_d.lens = c.get('lens', 35); cam_d.sensor_width = 36
    target = bpy.data.objects.new('focus', None); bpy.context.collection.objects.link(target)
    target.location = Vector(c['look_at'])
    tr = cam.constraints.new('TRACK_TO'); tr.target = target; tr.track_axis = 'TRACK_NEGATIVE_Z'; tr.up_axis = 'UP_Y'
    cam_d.dof.use_dof = True; cam_d.dof.focus_object = target; cam_d.dof.aperture_fstop = c.get('fstop', 2.8)
    n = round(shot['duration'] * fps)
    a, b = Vector(c['from']), Vector(c.get('to', c['from']))
    la, lb = Vector(c['look_at']), Vector(c.get('look_to', c['look_at']))
    for f in range(n):
        cam.location = a.lerp(b, ease(f / max(1, n - 1)))
        cam.keyframe_insert('location', frame=f + 1)
        if 'look_to' in c:  # tracking / panning: the aim point travels with the subject
            target.location = la.lerp(lb, ease(f / max(1, n - 1))); target.keyframe_insert('location', frame=f + 1)
    camera_moves(cam, target, shot, fps)
    return n


def look(scene, shot):
    scene.view_settings.view_transform = 'AgX'
    for name in (shot.get('grade', 'Medium High Contrast'),):
        for cand in (f'AgX - {name}', name):
            try: scene.view_settings.look = cand; break
            except TypeError: pass
    haze = shot.get('haze', 0)
    sc = scene; sc.use_nodes = True; nt = sc.node_tree
    for nd in list(nt.nodes): nt.nodes.remove(nd)
    rl = nt.nodes.new('CompositorNodeRLayers'); comp = nt.nodes.new('CompositorNodeComposite')
    img = rl.outputs['Image']
    if haze > 0:  # depth haze from the mist pass: no volume ray-marching cost
        sc.view_layers[0].use_pass_mist = True
        ms = sc.world.mist_settings; ms.start = 3; ms.depth = 18; ms.falloff = 'QUADRATIC'
        mul = nt.nodes.new('CompositorNodeMath'); mul.operation = 'MULTIPLY'; mul.use_clamp = True
        mul.inputs[1].default_value = min(1.0, haze * 40)
        mix = nt.nodes.new('CompositorNodeMixRGB'); mix.inputs[2].default_value = (*shot.get('haze_color', [0.12, 0.07, 0.035]), 1)
        nt.links.new(rl.outputs['Mist'], mul.inputs[0]); nt.links.new(mul.outputs[0], mix.inputs[0])
        nt.links.new(img, mix.inputs[1]); img = mix.outputs[0]
    glare = nt.nodes.new('CompositorNodeGlare'); glare.glare_type = 'FOG_GLOW'; glare.quality = 'MEDIUM'
    glare.threshold = 0.9; glare.size = 7; glare.mix = -0.75  # soft bloom around lamps and highlights
    nt.links.new(img, glare.inputs['Image']); img = glare.outputs['Image']
    mask = nt.nodes.new('CompositorNodeEllipseMask'); mask.width = 0.95; mask.height = 0.92
    blur = nt.nodes.new('CompositorNodeBlur'); blur.filter_type = 'FAST_GAUSS'; blur.use_relative = True
    blur.factor_x = 0.25; blur.factor_y = 0.25; nt.links.new(mask.outputs[0], blur.inputs[0])
    vig = nt.nodes.new('CompositorNodeMixRGB'); vig.blend_type = 'MULTIPLY'
    inv = nt.nodes.new('CompositorNodeMath'); inv.operation = 'MULTIPLY_ADD'
    inv.inputs[1].default_value = 0.28; inv.inputs[2].default_value = 0.72  # edges at 72% brightness
    nt.links.new(blur.outputs[0], inv.inputs[0])
    nt.links.new(img, vig.inputs[1]); nt.links.new(inv.outputs[0], vig.inputs[2]); vig.inputs[0].default_value = 1
    img = vig.outputs[0]
    nt.links.new(img, comp.inputs['Image'])


def build_card(cd, cam, duration=3.0, fps=30):
    """A painted transparent character card standing on the ground. It always turns to the (moving) camera
    and, with 'to', runs across the set with a small hop per stride."""
    folder = os.environ.get('CARD_DIR', '')
    path = os.path.join(folder, cd['image'])
    if not folder or not os.path.isfile(path): return None
    img = bpy.data.images.load(path, check_existing=True); w, h = img.size
    H = cd.get('height', 1.6); W = H * w / max(1, h)
    x, y = cd['pos']
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0)); ob = bpy.context.object
    ob.scale = (W, H, 1); ob.rotation_euler = (math.pi / 2, 0, 0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    for v in ob.data.vertices: v.co.z += H / 2  # feet on the ground, face along -Y
    ob.location = (x, y, 0)
    tr = ob.constraints.new('LOCKED_TRACK'); tr.target = cam; tr.track_axis = 'TRACK_NEGATIVE_Y'; tr.lock_axis = 'LOCK_Z'
    if cd.get('to'):
        n = max(1, round(duration * fps)); a, b = Vector((x, y, 0)), Vector((*cd['to'], 0)); hop = cd.get('hop', 0.1)
        for f in range(n):
            t = f / max(1, n - 1); p = a.lerp(b, t)
            p.z = hop * abs(math.sin(f / fps * math.pi * 3.2 + (x * 3.1)))
            ob.location = p; ob.keyframe_insert('location', frame=f + 1)
    m = bpy.data.materials.new('card'); m.use_nodes = True
    nt = m.node_tree; bsdf = nt.nodes.get('Principled BSDF'); tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color']); nt.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    bsdf.inputs['Roughness'].default_value = 0.8
    try: m.blend_method = 'HASHED'
    except (AttributeError, TypeError): pass
    try: m.surface_render_method = 'DITHERED'
    except (AttributeError, TypeError): pass
    ob.data.materials.append(m); ob.visible_shadow = True
    return ob


def build_props(shot):
    """Whitelisted offline CC0 models (shot_schema checks every id) standing in the scene."""
    from set_library import model
    for p in shot.get('props', []):
        model({'id': p['id'], 'pos': [p['pos'][0], p['pos'][1], 0], 'height': p.get('height', 1), 'yaw': p.get('yaw', 0)})


def main():
    argv = sys.argv[sys.argv.index('--') + 1:]
    shot = validate_shot(json.load(open(argv[0]))); out = argv[1]; os.makedirs(out, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    if not sc.world: sc.world = bpy.data.worlds.new('w')
    sc.world.use_nodes = True
    engine = os.environ.get('SHOT_ENGINE') or shot.get('engine', 'eevee')
    if engine == 'eevee':
        # Blender 4.2 calls it EEVEE_NEXT; 4.5+/5.x renamed it back to EEVEE. Optional knobs differ by version.
        names = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
        sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in names else 'BLENDER_EEVEE'; ee = sc.eevee
        ee.taa_render_samples = shot.get('samples', 16)
        for k, v in (('use_shadows', True), ('shadow_ray_count', 1), ('shadow_step_count', 6), ('use_raytracing', True),
                     ('ray_tracing_method', 'SCREEN'), ('use_volumetric_shadows', True), ('volumetric_tile_size', '8'),
                     ('volumetric_samples', 32), ('use_gtao', True), ('fast_gi_method', 'GLOBAL_ILLUMINATION'), ('shadow_resolution_scale', 1.0)):
            try: setattr(ee, k, v)
            except (AttributeError, TypeError): pass
        try: ee.ray_tracing_options.resolution_scale = '2'
        except (AttributeError, TypeError): pass
        sc.render.film_transparent = False
        print('EEVEE', sc.render.engine, bpy.app.version_string, flush=True)
    else:
        sc.render.engine = 'CYCLES'; cy = sc.cycles
        cy.device = os.environ.get('CYCLES_DEVICE', 'CPU')
        if cy.device == 'GPU':
            prefs = bpy.context.preferences.addons['cycles'].preferences
            for kind in ('OPTIX', 'CUDA'):
                try:
                    prefs.compute_device_type = kind; prefs.get_devices()
                    if any(d.type == kind for d in prefs.devices): break
                except TypeError: pass
            # one device entry per card: enabling both its CUDA and OptiX entries splits it against itself
            for d in prefs.devices: d.use = d.type == prefs.compute_device_type
            print('CYCLES_DEVICES', prefs.compute_device_type, [(d.name, d.type, d.use) for d in prefs.devices], flush=True)
            if not any(d.use for d in prefs.devices): raise RuntimeError('no GPU device for Cycles')
        cy.use_light_tree = True
        cy.denoising_use_gpu = True  # OpenImageDenoise on the card (OptiX denoiser libraries are not injected)
        cy.samples = shot.get('samples', 32); cy.use_adaptive_sampling = True
        cy.adaptive_threshold = 0.03; cy.use_denoising = True; cy.denoiser = 'OPENIMAGEDENOISE'
        cy.max_bounces = 4; cy.diffuse_bounces = 2; cy.glossy_bounces = 2; cy.transmission_bounces = 2
        cy.volume_bounces = 1; cy.transparent_max_bounces = 8; cy.volume_step_rate = 4
    sc.render.use_persistent_data = True
    W, H = shot.get('size', [1080, 1920]); sc.render.resolution_x = W; sc.render.resolution_y = H
    sc.render.resolution_percentage = 100; fps = shot.get('fps', 30); sc.render.fps = fps
    sc.render.image_settings.file_format = 'PNG'
    if shot['set'] in SETS:
        SETS[shot['set']]()
    else:
        build_set(shot['set'], shot.get('lighting', 'day'))
    roots=[build_character(c,shot['duration'],fps) for c in shot.get('cast', [])]
    if roots:verify_characters(roots,shot['duration'],fps)
    object_roots=[build_object(obj,shot['duration'],fps) for obj in shot.get('objects',[])]
    if object_roots:
        qa=verify_objects(object_roots,shot['duration'],fps)
        with open(os.path.join(out,'object-qa.json'),'w') as file:json.dump(qa,file,indent=2)
    build_props(shot)
    fx = build_effects(shot, fps); crowd = build_crowd(shot, fps); print('FX', fx, 'CROWD', crowd, flush=True)
    look(sc, shot)
    n = camera(shot, fps); sc.frame_start = 1; sc.frame_end = n
    for cd in shot.get('cards', []): build_card(cd, sc.camera, shot['duration'], fps)
    sc.render.filepath = os.path.join(out, 'f_#####')
    only = shot.get('frames')  # optional subset for stills/tests
    t0 = time.time()
    if only:
        for f in only:
            sc.frame_set(f); sc.render.filepath = os.path.join(out, f'f_{f:05d}'); bpy.ops.render.render(write_still=True)
    else:
        bpy.ops.render.render(animation=True)
    print(json.dumps({'frames': len(only) if only else n, 'seconds': round(time.time() - t0, 1)}))


if __name__ == '__main__':
    main()
