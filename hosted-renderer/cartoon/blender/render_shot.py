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


def noise_mat(name, c1, c2, scale=3.0, bump=0.4, rough=0.85, wave=False):
    """Two-tone procedural surface (rock, dirt, wood) with bump for real texture."""
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    co = nt.nodes.new('ShaderNodeNewGeometry')  # world position: no stretching on scaled objects
    tex = nt.nodes.new('ShaderNodeTexWave' if wave else 'ShaderNodeTexNoise')
    tex.inputs['Scale'].default_value = scale
    tex.inputs['Detail'].default_value = 8.0
    if wave:
        tex.wave_type = 'BANDS'; tex.bands_direction = 'Z'
        tex.inputs['Distortion'].default_value = 1.5; tex.inputs['Detail Scale'].default_value = 2.0
    nt.links.new(co.outputs['Position'], tex.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (*c1, 1); ramp.color_ramp.elements[1].color = (*c2, 1)
    nt.links.new(tex.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = bump
    nt.links.new(tex.outputs['Fac'], bp.inputs['Height'])
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
    h.visible_shadow = False
    return obj


def add(kind, loc, scale=(1, 1, 1), rot=(0, 0, 0), m=None, smooth=True, **kw):
    getattr(bpy.ops.mesh, f'primitive_{kind}_add')(location=loc, rotation=rot, **kw)
    o = bpy.context.active_object; o.scale = scale
    if m: o.data.materials.append(m)
    if smooth and kind in ('uv_sphere', 'cylinder', 'cone'):
        bpy.ops.object.shade_smooth()
    return o


# ---------------------------------------------------------------- sets
def set_mine_tunnel(length=24.0):
    rock = noise_mat('rock', (0.30, 0.15, 0.06), (0.72, 0.45, 0.22), scale=1.6, bump=0.9)
    dirt = noise_mat('dirt', (0.20, 0.12, 0.06), (0.42, 0.28, 0.15), scale=6.0, bump=0.5)
    wood = noise_mat('wood', (0.20, 0.10, 0.04), (0.45, 0.26, 0.11), scale=2.0, bump=0.3, wave=True)
    steel = mat('steel', (0.55, 0.55, 0.58), rough=0.35, metal=1.0)
    # rough rock tube: cylinder seen from inside, displaced with cloud noise
    t = add('cylinder', (0, length / 2 - 4, 1.4), (2.3, 2.3, length / 2), rot=(math.pi / 2, 0, 0),
            m=rock, vertices=96, depth=2, end_fill_type='NOTHING')
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.subdivide(number_cuts=40); bpy.ops.object.mode_set(mode='OBJECT')
    tx = bpy.data.textures.new('rockdisp', 'CLOUDS'); tx.noise_scale = 0.55; tx.noise_depth = 4
    d = t.modifiers.new('d', 'DISPLACE'); d.texture = tx; d.strength = -0.55; d.texture_coords = 'GLOBAL'
    add('plane', (0, length / 2 - 4, 0), (2.6, length / 2, 1), m=dirt, smooth=False)
    for y in range(-2, int(length) - 4, 3):                      # timber frames + lanterns
        for x in (-1.55, 1.55):
            add('cube', (x, y, 1.15), (0.11, 0.11, 1.15), m=wood, smooth=False)
        add('cube', (0, y, 2.35), (1.7, 0.13, 0.12), m=wood, smooth=False)
        lamp_x = 1.35 if (y // 3) % 2 else -1.35
        glass = mat('lampglass', (1, 0.6, 0.25), emit=(1.0, 0.55, 0.18), strength=12)
        add('cylinder', (lamp_x, y + 0.2, 1.9), (0.06, 0.06, 0.09), m=glass, vertices=16)
        bpy.ops.object.light_add(type='POINT', location=(lamp_x * 0.9, y + 0.35, 1.9))
        L = bpy.context.active_object.data; L.energy = 45; L.color = (1.0, 0.62, 0.30); L.shadow_soft_size = 0.15
    for x in (-0.45, 0.45):                                     # rails and sleepers
        add('cube', (x, length / 2 - 4, 0.09), (0.035, length / 2, 0.045), m=steel, smooth=False)
    for y in [i * 0.55 for i in range(-6, int(length / 0.55) - 6)]:
        add('cube', (0, y, 0.03), (0.7, 0.09, 0.03), m=wood, smooth=False)
    bpy.ops.object.light_add(type='AREA', location=(-1.1, -0.9, 2.1), rotation=(math.radians(60), 0, math.radians(-40)))
    K = bpy.context.active_object.data; K.energy = 90; K.size = 0.6; K.color = (1.0, 0.70, 0.42)  # warm key on the cast
    w = bpy.context.scene.world.node_tree.nodes['Background']
    w.inputs['Color'].default_value = (0.02, 0.012, 0.008, 1); w.inputs['Strength'].default_value = 0.15


def set_open_day(length=24.0):
    grass = noise_mat('grass', (0.16, 0.30, 0.07), (0.38, 0.55, 0.16), scale=4, bump=0.3)
    add('plane', (0, 0, 0), (60, 60, 1), m=grass, smooth=False)
    w = bpy.context.scene.world.node_tree; nodes = w.nodes
    sky = nodes.new('ShaderNodeTexSky')
    try: sky.sky_type = 'NISHITA'; sky.sun_elevation = math.radians(28)
    except Exception: pass
    w.links.new(sky.outputs[0], nodes['Background'].inputs['Color'])
    bpy.ops.object.light_add(type='SUN', rotation=(math.radians(55), 0, math.radians(35)))
    s = bpy.context.active_object.data; s.energy = 4; s.angle = math.radians(3)


SETS = {'mine_tunnel': set_mine_tunnel, 'open_day': set_open_day}


# ---------------------------------------------------------------- egg-head character
def character(c):
    skin = mat('skin', (0.93, 0.92, 0.88), rough=0.5)
    black = mat('black', (0.01, 0.01, 0.01), rough=0.4)
    shirt = mat('shirt', tuple(c.get('shirt', (0.15, 0.55, 0.45))), rough=0.8)
    hatm = noise_mat('hat', tuple(c.get('hat_color', (0.85, 0.60, 0.10))), tuple(x * 0.7 for x in c.get('hat_color', (0.85, 0.6, 0.1))), scale=40, bump=0.6)
    x, y = c['pos']; yaw = math.radians(c.get('yaw', 0)); S = c.get('scale', 1.0)
    root = bpy.data.objects.new('char', None); bpy.context.collection.objects.link(root)
    root.location = (x, y, 0); root.rotation_euler = (0, 0, yaw); root.scale = (S, S, S)
    parts = []
    head = ink(add('uv_sphere', (0, 0, 1.62), (0.26, 0.25, 0.31), m=skin, segments=48, ring_count=24)); parts.append(head)
    for ex in (-0.09, 0.09):
        parts.append(add('uv_sphere', (ex, -0.235, 1.64), (0.035, 0.02, 0.045), m=black))
        parts.append(add('cube', (ex, -0.245, 1.72), (0.05, 0.01, 0.008), m=black, smooth=False))  # brows
    parts.append(add('torus', (0, -0.2, 1.50), (0.07, 0.04, 0.03), rot=(math.pi / 2, 0, 0), m=black,
                     major_radius=1, minor_radius=0.25))  # mouth
    if c.get('hat', 'beanie') == 'beanie':
        parts.append(ink(add('uv_sphere', (0, 0, 1.80), (0.28, 0.27, 0.20), m=hatm, segments=32, ring_count=16)))
        parts.append(ink(add('cylinder', (0, 0, 1.75), (0.285, 0.275, 0.05), m=hatm, vertices=32)))
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
    for f in range(n):
        cam.location = a.lerp(b, ease(f / max(1, n - 1)))
        cam.keyframe_insert('location', frame=f + 1)
    return n


def look(scene, shot):
    scene.view_settings.view_transform = 'AgX'
    for name in (shot.get('grade', 'Medium High Contrast'),):
        for cand in (f'AgX - {name}', name):
            try: scene.view_settings.look = cand; break
            except TypeError: pass
    if shot.get('haze', 0) > 0:  # light shafts and depth haze through a thin volume box
        hz = add('cube', (0, 8, 1.4), (4, 14, 1.6), smooth=False)
        m = bpy.data.materials.new('haze'); m.use_nodes = True; nt = m.node_tree
        nt.nodes.remove(nt.nodes['Principled BSDF'])
        v = nt.nodes.new('ShaderNodeVolumePrincipled'); v.inputs['Density'].default_value = shot['haze']
        v.inputs['Color'].default_value = (1, 0.85, 0.7, 1)
        nt.links.new(v.outputs[0], nt.nodes['Material Output'].inputs['Volume'])
        hz.data.materials.append(m)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:]
    shot = validate_shot(json.load(open(argv[0]))); out = argv[1]; os.makedirs(out, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    if not sc.world: sc.world = bpy.data.worlds.new('w')
    sc.world.use_nodes = True
    engine = shot.get('engine') or os.environ.get('SHOT_ENGINE', 'eevee')
    if engine == 'eevee':
        sc.render.engine = 'BLENDER_EEVEE_NEXT'; ee = sc.eevee
        ee.taa_render_samples = shot.get('samples', 16)
        ee.use_shadows = True; ee.shadow_ray_count = 2; ee.shadow_step_count = 8
        ee.use_raytracing = True; ee.ray_tracing_method = 'SCREEN'
        ee.use_volumetric_shadows = True; ee.volumetric_tile_size = '8'; ee.volumetric_samples = 48
        ee.use_gtao = True; ee.fast_gi_method = 'GLOBAL_ILLUMINATION'
        sc.render.film_transparent = False
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
            for d in prefs.devices: d.use = d.type != 'CPU'
        cy.samples = shot.get('samples', 32); cy.use_adaptive_sampling = True
        cy.adaptive_threshold = 0.03; cy.use_denoising = True
        cy.max_bounces = 4; cy.diffuse_bounces = 2; cy.glossy_bounces = 2; cy.transmission_bounces = 2
        cy.volume_bounces = 0; cy.transparent_max_bounces = 8; cy.volume_step_rate = 4
    sc.render.use_persistent_data = True
    W, H = shot.get('size', [1080, 1920]); sc.render.resolution_x = W; sc.render.resolution_y = H
    sc.render.resolution_percentage = 100; fps = shot.get('fps', 30); sc.render.fps = fps
    sc.render.image_settings.file_format = 'PNG'
    SETS[shot['set']]()
    for c in shot.get('cast', []): character(c)
    look(sc, shot)
    n = camera(shot, fps); sc.frame_start = 1; sc.frame_end = n
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
