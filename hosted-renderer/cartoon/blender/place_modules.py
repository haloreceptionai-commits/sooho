"""Blender builder for compiled Advanced places (place_spec.compile_place output). Engine-owned geometry only:
displaced terrain, river water, whitelisted CC0 models, horns/flames, sky, fog. No painted backdrop."""
import math
import bpy, bmesh
from place_spec import height, RIVER_Y, RIVER_HALF

PALETTE = {  # low ground, rock, high ground colours per terrain (linear)
    'mountain_pass': ((0.20, 0.24, 0.11), (0.30, 0.27, 0.24), (0.80, 0.82, 0.86)),
    'valley': ((0.16, 0.30, 0.08), (0.28, 0.26, 0.20), (0.22, 0.34, 0.12)),
    'plain': ((0.36, 0.33, 0.16), (0.32, 0.28, 0.22), (0.30, 0.34, 0.14)),
    'river_crossing': ((0.18, 0.30, 0.10), (0.30, 0.27, 0.22), (0.20, 0.32, 0.12)),
    'camp': ((0.33, 0.28, 0.17), (0.30, 0.26, 0.21), (0.24, 0.32, 0.13)),
    'desert': ((0.62, 0.46, 0.22), (0.45, 0.33, 0.2), (0.7, 0.52, 0.26)),
    'snow_mountain': ((0.82, 0.86, 0.92), (0.32, 0.32, 0.36), (0.95, 0.97, 1.0)),
    'jungle': ((0.07, 0.22, 0.05), (0.25, 0.22, 0.15), (0.1, 0.28, 0.07)),
    'ancient_city': ((0.55, 0.5, 0.42), (0.4, 0.37, 0.32), (0.3, 0.34, 0.16)),
    'coast': ((0.74, 0.65, 0.45), (0.35, 0.32, 0.28), (0.25, 0.4, 0.15)),
}


def terrain_mat(t):
    low, rock, high = PALETTE[t]
    m = bpy.data.materials.new('terrain'); m.use_nodes = True; nt = m.node_tree
    b = nt.nodes['Principled BSDF']; b.inputs['Roughness'].default_value = 0.95
    for k in ('Specular IOR Level', 'Specular'):
        if k in b.inputs: b.inputs[k].default_value = 0.0
    geo = nt.nodes.new('ShaderNodeNewGeometry'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nz = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(geo.outputs['Position'], sep.inputs[0]); nt.links.new(geo.outputs['Normal'], nz.inputs[0])
    hr = nt.nodes.new('ShaderNodeMapRange'); hr.inputs['From Min'].default_value = 12; hr.inputs['From Max'].default_value = 22
    nt.links.new(sep.outputs[2], hr.inputs['Value'])
    sr = nt.nodes.new('ShaderNodeMapRange'); sr.inputs['From Min'].default_value = 0.86; sr.inputs['From Max'].default_value = 0.7
    nt.links.new(nz.outputs[2], sr.inputs['Value'])
    tex = nt.nodes.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value = 0.35
    vary = nt.nodes.new('ShaderNodeMixRGB'); vary.inputs['Color1'].default_value = (*low, 1)
    vary.inputs['Color2'].default_value = (*(c * 0.75 for c in low), 1); nt.links.new(tex.outputs['Fac'], vary.inputs['Fac'])
    a = nt.nodes.new('ShaderNodeMixRGB'); nt.links.new(sr.outputs['Result'], a.inputs['Fac']); nt.links.new(vary.outputs[0], a.inputs['Color1'])
    a.inputs['Color2'].default_value = (*rock, 1)
    c = nt.nodes.new('ShaderNodeMixRGB'); nt.links.new(hr.outputs['Result'], c.inputs['Fac']); nt.links.new(a.outputs[0], c.inputs['Color1'])
    c.inputs['Color2'].default_value = (*high, 1)
    nt.links.new(c.outputs[0], b.inputs['Base Color'])
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.25
    nt.links.new(tex.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    return m


def build_terrain(t, seed, size=180.0, n=150):
    me = bpy.data.meshes.new('terrain'); bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=n, y_segments=n, size=size / 2)
    for v in bm.verts: v.co.z = height(t, v.co.x, v.co.y, seed)
    bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new('terrain', me); bpy.context.collection.objects.link(ob)
    ob.data.materials.append(terrain_mat(t)); ob['place_terrain'] = t
    if t == 'coast':
        from place_spec import COAST_Y
        bpy.ops.mesh.primitive_plane_add(size=1, location=(0, COAST_Y + 60, -0.35)); w = bpy.context.object; w.name = 'sea'; w.scale = (size * 2, 120, 1)
        m = bpy.data.materials.new('water'); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (0.04, 0.2, 0.3, 1); b.inputs['Roughness'].default_value = 0.06
        w.data.materials.append(m)
    if t == 'river_crossing':
        bpy.ops.mesh.primitive_plane_add(size=1, location=(0, RIVER_Y, -0.35)); w = bpy.context.object; w.name = 'river'
        w.scale = (size, RIVER_HALF * 2 + 2.5, 1)
        m = bpy.data.materials.new('water'); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (0.05, 0.16, 0.2, 1); b.inputs['Roughness'].default_value = 0.08
        w.data.materials.append(m)
    return ob


def _flame_mats():
    out = []
    for name, col, strength in (('flame_outer', (1, 0.1, 0.0), 1.1), ('flame_core', (1, 0.45, 0.04), 2.2)):
        m = bpy.data.materials.get(name)
        if m is None:
            m = bpy.data.materials.new(name); m.use_nodes = True
            e = m.node_tree.nodes['Principled BSDF']; e.inputs['Base Color'].default_value = (*col, 1)
            e.inputs['Emission Color' if 'Emission Color' in e.inputs else 'Emission'].default_value = (*col, 1)
            e.inputs['Emission Strength'].default_value = strength
        out.append(m)
    return out


def _wobble(seed, k):
    """Deterministic 0..1 noise for flicker (no random module: same frames on every machine)."""
    return (math.sin(seed * 12.9898 + k * 78.233) * 43758.5453) % 1.0


def flame(loc, size=0.25, seed=0, frames=1, fps=30, energy=None):
    """Layered, flickering fire: outer teardrop, hot core, point light that flickers with it, rising embers."""
    outer_m, core_m = _flame_mats()
    parts = []
    for layer, (mat, sc) in enumerate(((outer_m, 1.0), (core_m, 0.55))):
        bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=size * 0.3 * sc, radius2=size * 0.02, depth=size * 1.5 * sc,
                                        location=(loc[0], loc[1], loc[2] + size * (0.75 if layer == 0 else 0.5) * sc + size * 0.1))
        ob = bpy.context.object; ob.data.materials.append(mat)
        for p in ob.data.polygons: p.use_smooth = True
        parts.append((ob, sc))
    bpy.ops.object.light_add(type='POINT', location=(loc[0], loc[1], loc[2] + size * 1.4))
    light = bpy.context.object; L = light.data
    base = (energy if energy is not None else 260 * size / 0.2)
    L.energy = base; L.color = (1, 0.5, 0.16); L.shadow_soft_size = 0.25
    step = max(1, fps // 10)
    for f in range(1, max(2, frames) + 1, step):
        k = f // step
        w1, w2, w3 = _wobble(seed, k), _wobble(seed + 7, k), _wobble(seed + 13, k)
        for ob, sc in parts:
            ob.scale = (0.8 + 0.4 * w1, 0.8 + 0.4 * w2, 0.85 + 0.35 * w3)
            ob.keyframe_insert('scale', frame=f)
        L.energy = base * (0.75 + 0.5 * w3); L.keyframe_insert('energy', frame=f)
    # embers: small emissive sparks that rise and fade out
    for e in range(5):
        bpy.ops.mesh.primitive_ico_sphere_add(radius=size * 0.04, subdivisions=1, location=(loc[0], loc[1], loc[2] + size))
        em = bpy.context.object; em.data.materials.append(core_m)
        dx, dy = (_wobble(seed, e) - 0.5) * size * 1.5, (_wobble(seed + 3, e) - 0.5) * size * 1.5
        life = max(8, int(fps * (0.6 + 0.5 * _wobble(seed + 5, e)))); t0 = 1 + int(_wobble(seed + 9, e) * life)
        for f in range(1, max(2, frames) + 1, max(1, life // 2)):
            u = ((f + t0) % life) / life
            em.location = (loc[0] + dx * u, loc[1] + dy * u, loc[2] + size + size * 3.0 * u)
            em.scale = (1 - u,) * 3
            em.keyframe_insert('location', frame=f); em.keyframe_insert('scale', frame=f)
    return parts[0][0]


def animate_ox(root, new_actions, yaw, frames, fps, phase, speed_mps, clip='Run'):
    """Play the cow's own Run/Walk clip on its armature (looped, phase-shifted per animal) and carry the root forward."""
    rig = next((o for o in bpy.data.objects if o.type == 'ARMATURE' and o.parent is not None and _under(o, root)), None)
    act = next((a for a in new_actions if f'{clip}_' in a.name), None)
    if rig is None or act is None: return False
    rig.animation_data_create()
    for t in list(rig.animation_data.nla_tracks): rig.animation_data.nla_tracks.remove(t)
    rig.animation_data.action = None
    length = max(1, int(act.frame_range[1] - act.frame_range[0]))
    track = rig.animation_data.nla_tracks.new()
    strip = track.strips.new(act.name, 1 - int(phase * length), act)
    strip.repeat = (frames + length) / length + 1
    strip.scale = (fps / 30.0) if clip == 'Run' else 1.0
    # forward = the direction the farm-animal model faces after the yaw rotation (checked against the rendered still)
    a = math.radians(yaw); fx, fy = -math.sin(a) * -1, math.cos(a)
    x, y, z = root.location
    root.location = (x, y, z); root.keyframe_insert('location', frame=1)
    dist = speed_mps * frames / fps
    root.location = (x + fx * dist, y + fy * dist, z); root.keyframe_insert('location', frame=max(2, frames))
    if root.animation_data and root.animation_data.action:
        for fc in root.animation_data.action.fcurves:
            for kp in fc.keyframe_points: kp.interpolation = 'LINEAR'
    return True


def _under(o, root):
    while o is not None:
        if o is root: return True
        o = o.parent
    return False


def ox_coat(root):
    """Draught-ox colouring: the farm cow's white patches become a warm brown hide (dark parts stay dark)."""
    seen = set()
    stack = list(root.children)
    while stack:
        o = stack.pop(); stack.extend(o.children)
        if o.type != 'MESH': continue
        for i, m in enumerate(o.data.materials):
            if not m or not m.use_nodes: continue
            if m.name not in seen:
                b = m.node_tree.nodes.get('Principled BSDF')
                if b:
                    nt = m.node_tree; inp = b.inputs['Base Color']
                    if inp.links:   # textured: multiply by hide colour (white -> brown, black stays black)
                        src = inp.links[0].from_socket; mul = nt.nodes.new('ShaderNodeMixRGB'); mul.blend_type = 'MULTIPLY'
                        mul.inputs['Fac'].default_value = 1.0; mul.inputs['Color2'].default_value = (0.42, 0.23, 0.1, 1)
                        nt.links.new(src, mul.inputs['Color1']); nt.links.new(mul.outputs[0], inp)
                    else:
                        c = inp.default_value
                        if (c[0] + c[1] + c[2]) / 3 > 0.35: inp.default_value = (0.36, 0.2, 0.09, 1)
                seen.add(m.name)


def build_place(p, mode, duration=1.0, fps=30):
    from set_library import model, _MODEL_CACHE
    if p['terrain'] not in PALETTE: return False
    frames = max(1, int(round(duration * fps)))
    build_terrain(p['terrain'], p['seed'])
    herd = 0
    for it in p['items']:
        x, y, z = it['pos']
        is_ox = bool(it.get('horns') or it.get('animate'))
        if is_ox:
            _MODEL_CACHE.pop(it['model'], None)   # each animal needs its own armature, so import it fresh instead of copying
        before = set(bpy.data.actions); mark = set(bpy.data.objects)
        root = model({'id': it['model'], 'pos': [x, y, z], 'height': it['height'], 'yaw': it['yaw']})
        root['place_item'] = it['id']
        if is_ox:
            if it.get('horns'): ox_coat(root)
            new_actions = [a for a in bpy.data.actions if a not in before]
            k = herd; herd += 1
            moves = frames > 1 and it.get('herd', True)
            if moves:
                animate_ox(root, new_actions, it['yaw'], frames, fps, phase=_wobble(k, 1), speed_mps=(3.2 + 1.6 * _wobble(k, 2)) if it.get('animate', 'Run') == 'Run' else 0.9, clip=it.get('animate', 'Run'))
            yaw = math.radians(it['yaw']); h = it['height']
            if not it.get('horns'): continue
            fx, fy = math.sin(yaw), -math.cos(yaw)   # farm-animal models face -Y before the yaw rotation (head bone measured at y=-0.71)
            horn_objs = []
            for sx in (-1, 1):
                rx, ry = -fy * sx * 0.16, fx * sx * 0.16
                tip = (x + fx * 0.74 * h / 1.5 + rx * h / 1.5, y + fy * 0.74 * h / 1.5 + ry * h / 1.5, z + h * 0.93)
                m = bpy.data.materials.get('horn') or bpy.data.materials.new('horn'); m.use_nodes = True
                m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.85, 0.8, 0.65, 1)
                bpy.ops.mesh.primitive_cone_add(radius1=0.05, depth=0.35, location=tip, rotation=(sx * math.radians(55), 0, yaw))
                horn = bpy.context.object; horn.data.materials.append(m); horn_objs.append(horn)
                if it.get('fire') == 'horns':
                    before_f = set(bpy.data.objects)
                    flame((tip[0] + rx * 0.8, tip[1] + ry * 0.8, tip[2] + 0.12), 0.2, seed=k * 2 + (sx > 0), frames=frames, fps=fps)
                    horn_objs += [o for o in set(bpy.data.objects) - before_f]
            for o in horn_objs:   # carry horns and flames with the animal
                o.parent = root; o.matrix_parent_inverse = root.matrix_world.inverted()
        elif it.get('fire') == 'top':
            before_f = set(bpy.data.objects)
            flame((x, y, z + it['height'] * (0.95 if it['id'] == 'torch' else 0.3)), 0.2 if it['id'] == 'torch' else 0.45,
                  seed=hash(it['id']) % 97, frames=frames, fps=fps)
    w = bpy.context.scene.world.node_tree; nodes = w.nodes
    sky = nodes.new('ShaderNodeTexSky')
    elev = {'night': -3.5, 'sunset': 4, 'rain': 18}.get(mode, 30)   # night: sun below the horizon so the sky itself is dark; dusk/dawn: low and warm
    try: sky.sky_type = 'NISHITA'; sky.sun_elevation = math.radians(elev); sky.sun_rotation = math.radians(35)
    except Exception: pass
    w.links.new(sky.outputs[0], nodes['Background'].inputs['Color']); nodes['Background'].inputs['Strength'].default_value = .2
    bpy.ops.object.light_add(type='SUN', rotation=(math.radians(52), 0, math.radians(35)))
    s = bpy.context.active_object.data; s.energy = 2.4; s.angle = math.radians(4); s.color = (1.0, 0.93, 0.82)
    return True
