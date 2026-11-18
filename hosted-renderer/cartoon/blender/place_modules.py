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


GROUND_PAL = {   # custom places: ground colour sets (low, rock/slope, high)
    'grass': ((0.16, 0.30, 0.08), (0.28, 0.26, 0.20), (0.22, 0.34, 0.12)), 'sand': ((0.62, 0.46, 0.22), (0.45, 0.33, 0.20), (0.70, 0.52, 0.26)),
    'snow': ((0.82, 0.86, 0.92), (0.32, 0.32, 0.36), (0.95, 0.97, 1.0)), 'rock': ((0.30, 0.28, 0.26), (0.22, 0.2, 0.19), (0.45, 0.42, 0.4)),
    'dirt': ((0.33, 0.24, 0.14), (0.28, 0.22, 0.17), (0.4, 0.3, 0.18)), 'stone': ((0.55, 0.52, 0.47), (0.4, 0.38, 0.34), (0.62, 0.6, 0.55)),
    'mud': ((0.18, 0.13, 0.08), (0.22, 0.17, 0.12), (0.2, 0.16, 0.1)), 'ice': ((0.7, 0.85, 0.95), (0.45, 0.6, 0.75), (0.9, 0.96, 1.0)),
    'asphalt': ((0.1, 0.1, 0.11), (0.14, 0.14, 0.15), (0.18, 0.18, 0.19)), 'metal': ((0.35, 0.37, 0.4), (0.25, 0.27, 0.3), (0.5, 0.52, 0.56))}


MAIN_TEX = {'mountain_pass': 'grass', 'valley': 'grass', 'plain': 'grass', 'river_crossing': 'grass', 'camp': 'dirt', 'desert': 'dirt', 'snow_mountain': 'stone',
            'coast': 'dirt', 'jungle': 'grass', 'ancient_city': 'stone'}
GROUND_TEX = {'grass': 'grass', 'sand': 'dirt', 'snow': 'stone', 'rock': 'rock', 'dirt': 'dirt', 'stone': 'stone', 'mud': 'dirt', 'ice': 'stone', 'asphalt': 'stone', 'metal': 'stone'}


def tex_node(nt, name, role, metres, vec):
    """Triplanar (box) CC0 texture sampled in world space so it never stretches on slopes."""
    from set_library import asset_path
    sc = nt.nodes.new('ShaderNodeVectorMath'); sc.operation = 'SCALE'; sc.inputs['Scale'].default_value = 1.0 / metres; nt.links.new(vec, sc.inputs[0])
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(asset_path(name, 'texture', role), check_existing=True)
    t.image.colorspace_settings.name = 'sRGB' if role == 'color' else 'Non-Color'; t.projection = 'BOX'; t.projection_blend = 0.25
    nt.links.new(sc.outputs[0], t.inputs['Vector']); return t


def terrain_mat(t, params=None):
    low, rock, high = GROUND_PAL[(params or {}).get('ground', 'grass')] if t == 'custom' else PALETTE[t]
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
    # painted flat colour with soft wear (house style): two scales of noise nudge the lightness +-12%, no photo texture, no gloss
    pos = geo.outputs['Position']
    wear1 = nt.nodes.new('ShaderNodeTexNoise'); wear1.inputs['Scale'].default_value = 1.1; wear1.inputs['Detail'].default_value = 3
    wear2 = nt.nodes.new('ShaderNodeTexNoise'); wear2.inputs['Scale'].default_value = 5.0; wear2.inputs['Detail'].default_value = 1
    nt.links.new(pos, wear1.inputs['Vector']); nt.links.new(pos, wear2.inputs['Vector'])
    mixw = nt.nodes.new('ShaderNodeMath'); mixw.operation = 'ADD'; mixw.use_clamp = False
    nt.links.new(wear1.outputs['Fac'], mixw.inputs[0]); nt.links.new(wear2.outputs['Fac'], mixw.inputs[1])
    gain_v = nt.nodes.new('ShaderNodeMapRange'); gain_v.inputs['From Min'].default_value = 0.4; gain_v.inputs['From Max'].default_value = 1.6
    gain_v.inputs['To Min'].default_value = 0.74; gain_v.inputs['To Max'].default_value = 1.22; nt.links.new(mixw.outputs[0], gain_v.inputs['Value'])
    gain = nt.nodes.new('ShaderNodeMix'); gain.data_type = 'RGBA'; gain.blend_type = 'MULTIPLY'; gain.inputs['Factor'].default_value = 1.0
    nt.links.new(c.outputs[0], gain.inputs['A'])
    gcol = nt.nodes.new('ShaderNodeCombineColor'); nt.links.new(gain_v.outputs['Result'], gcol.inputs[0]); nt.links.new(gain_v.outputs['Result'], gcol.inputs[1]); nt.links.new(gain_v.outputs['Result'], gcol.inputs[2])
    nt.links.new(gcol.outputs[0], gain.inputs['B']); nt.links.new(gain.outputs['Result'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 1.0
    return m


def build_terrain(t, seed, size=180.0, n=150, params=None):
    me = bpy.data.meshes.new('terrain'); bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=n, y_segments=n, size=size / 2)
    for v in bm.verts: v.co.z = height(t, v.co.x, v.co.y, seed, params)
    bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new('terrain', me); bpy.context.collection.objects.link(ob)
    ob.data.materials.append(terrain_mat(t, params)); ob['place_terrain'] = t
    water = (params or {}).get('water', 'none') if t == 'custom' else 'none'
    if water in ('sea', 'lake'):
        from place_spec import COAST_Y
        bpy.ops.mesh.primitive_plane_add(size=1, location=(0, COAST_Y + 60, -0.35)); w = bpy.context.object; w.name = 'sea'; w.scale = (size * 2, 120, 1)
        m = bpy.data.materials.new('water'); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (0.04, 0.2, 0.3, 1) if water == 'sea' else (0.08, 0.26, 0.28, 1); b.inputs['Roughness'].default_value = 0.06
        w.data.materials.append(m)
    elif water == 'river':
        bpy.ops.mesh.primitive_plane_add(size=1, location=(0, RIVER_Y, -0.35)); w = bpy.context.object; w.name = 'river'; w.scale = (size, RIVER_HALF * 2 + 2.5, 1)
        m = bpy.data.materials.new('water'); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (0.05, 0.16, 0.2, 1); b.inputs['Roughness'].default_value = 0.08
        w.data.materials.append(m)
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


def build_sky(mode, weather='clear', keep_light=False):
    """Painted storybook sky (benchmark look): gradient, toon-edged clouds, a big moon and stars at night, a warm glow at dawn/dusk.
    keep_light: the camera sees the painted sky while the world's existing lighting (a set kit's HDRI) still lights the scene."""
    w = bpy.context.scene.world; nt = w.node_tree; light_src = None
    if keep_light:
        out = next((n for n in nt.nodes if n.type == 'OUTPUT_WORLD'), None)
        if out is None or not out.inputs['Surface'].is_linked: keep_light = False
        else: light_src = out.inputs['Surface'].links[0].from_socket
    if not keep_light:
        nt.nodes.clear(); out = nt.nodes.new('ShaderNodeOutputWorld')
    bg = nt.nodes.new('ShaderNodeBackground')
    coord = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(coord.outputs['Generated'], sep.inputs[0])
    pal = {'day': ((0.04, 0.2, 0.72), (0.3, 0.56, 0.95), (1, 1, 1), (0.7, 0.8, 0.95), 1.0),   # benchmark: a saturated blue right down to the horizon, no milky band
           'sunset': ((0.22, 0.26, 0.55), (1.0, 0.55, 0.28), (1.0, 0.82, 0.68), (0.75, 0.45, 0.5), 0.9),
           'night': ((0.01, 0.02, 0.09), (0.07, 0.14, 0.38), (0.35, 0.45, 0.75), (0.08, 0.12, 0.28), 0.9),
           'rain': ((0.22, 0.25, 0.3), (0.42, 0.46, 0.52), (0.55, 0.58, 0.62), (0.3, 0.33, 0.38), 0.8)}[mode if mode in ('day', 'sunset', 'night', 'rain') else 'day']
    zen, hor, cl_hi, cl_lo, strength = pal
    elev = nt.nodes.new('ShaderNodeMapRange'); elev.inputs['From Min'].default_value = -0.05; elev.inputs['From Max'].default_value = 0.85; nt.links.new(sep.outputs[2], elev.inputs['Value'])
    ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color = (*hor, 1); ramp.color_ramp.elements[1].color = (*zen, 1)
    nt.links.new(elev.outputs['Result'], ramp.inputs['Fac'])
    # clouds: stretched noise thresholded with a short ramp = soft toon edge, brighter on top
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (2.2, 2.2, 5.5); nt.links.new(coord.outputs['Generated'], mp.inputs['Vector'])
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 1.6; nz.inputs['Detail'].default_value = 5; nz.inputs['Roughness'].default_value = 0.55
    nt.links.new(mp.outputs[0], nz.inputs['Vector'])
    cover = 0.55 if mode != 'rain' else 0.35
    cr = nt.nodes.new('ShaderNodeValToRGB'); cr.color_ramp.elements[0].position = cover; cr.color_ramp.elements[1].position = cover + 0.1
    nt.links.new(nz.outputs['Fac'], cr.inputs['Fac'])
    hz = nt.nodes.new('ShaderNodeMapRange'); hz.inputs['From Min'].default_value = 0.04; hz.inputs['From Max'].default_value = 0.22; nt.links.new(sep.outputs[2], hz.inputs['Value'])
    cm = nt.nodes.new('ShaderNodeMath'); cm.operation = 'MULTIPLY'; nt.links.new(cr.outputs[0], cm.inputs[0]); nt.links.new(hz.outputs['Result'], cm.inputs[1])
    cc = nt.nodes.new('ShaderNodeMixRGB'); cc.inputs['Color1'].default_value = (*cl_lo, 1); cc.inputs['Color2'].default_value = (*cl_hi, 1)
    nt.links.new(nz.outputs['Fac'], cc.inputs['Fac'])
    sky = nt.nodes.new('ShaderNodeMixRGB'); nt.links.new(cm.outputs[0], sky.inputs['Fac']); nt.links.new(ramp.outputs[0], sky.inputs['Color1']); nt.links.new(cc.outputs[0], sky.inputs['Color2'])
    last = sky.outputs[0]
    if mode == 'night':   # stars and a big moon
        vr = nt.nodes.new('ShaderNodeTexVoronoi'); vr.feature = 'F1'; vr.inputs['Scale'].default_value = 42; nt.links.new(coord.outputs['Generated'], vr.inputs['Vector'])
        st = nt.nodes.new('ShaderNodeMath'); st.operation = 'LESS_THAN'; st.inputs[1].default_value = 0.035; nt.links.new(vr.outputs['Distance'], st.inputs[0])
        sg = nt.nodes.new('ShaderNodeMath'); sg.operation = 'MULTIPLY'; nt.links.new(st.outputs[0], sg.inputs[0]); nt.links.new(hz.outputs['Result'], sg.inputs[1])
        sc = nt.nodes.new('ShaderNodeMath'); sc.operation = 'MULTIPLY'; sc.inputs[1].default_value = 0;
        inv = nt.nodes.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1; nt.links.new(cm.outputs[0], inv.inputs[1])
        sk = nt.nodes.new('ShaderNodeMath'); sk.operation = 'MULTIPLY'; sk.inputs[1].default_value = 6.0; nt.links.new(sg.outputs[0], sk.inputs[0])
        sg2 = nt.nodes.new('ShaderNodeMath'); sg2.operation = 'MULTIPLY'; nt.links.new(sk.outputs[0], sg2.inputs[0]); nt.links.new(inv.outputs[0], sg2.inputs[1])
        addst = nt.nodes.new('ShaderNodeMixRGB'); addst.blend_type = 'ADD'; nt.links.new(sg2.outputs[0], addst.inputs['Fac']); nt.links.new(last, addst.inputs['Color1']); addst.inputs['Color2'].default_value = (1, 1, 1, 1)
        last = addst.outputs[0]
    # moon (night) / sun glow (day, dawn): a bright disc plus a soft halo in a fixed direction
    d = {'night': (0.25, 0.80, 0.52), 'day': (0.30, 0.78, 0.52), 'sunset': (0.1, 0.9, 0.16)}.get(mode)
    if d:
        ln = math.sqrt(sum(v * v for v in d)); d = tuple(v / ln for v in d)
        dot = nt.nodes.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; dot.inputs[1].default_value = d
        nrm = nt.nodes.new('ShaderNodeVectorMath'); nrm.operation = 'NORMALIZE'; nt.links.new(coord.outputs['Generated'], nrm.inputs[0]); nt.links.new(nrm.outputs[0], dot.inputs[0])
        disc = nt.nodes.new('ShaderNodeMapRange'); disc.inputs['From Min'].default_value = 0.9962 if mode == 'night' else 0.9985; disc.inputs['From Max'].default_value = 0.9972 if mode == 'night' else 0.9990
        nt.links.new(dot.outputs['Value'], disc.inputs['Value'])
        halo = nt.nodes.new('ShaderNodeMapRange'); halo.inputs['From Min'].default_value = 0.93; halo.inputs['From Max'].default_value = 1.0; halo.inputs['To Max'].default_value = 0.35
        nt.links.new(dot.outputs['Value'], halo.inputs['Value'])
        glow = nt.nodes.new('ShaderNodeMixRGB'); glow.blend_type = 'ADD'; glow.inputs['Color2'].default_value = ((0.5, 0.6, 0.9, 1) if mode == 'night' else (1, 0.75, 0.45, 1))
        nt.links.new(halo.outputs['Result'], glow.inputs['Fac']); nt.links.new(last, glow.inputs['Color1'])
        disk = nt.nodes.new('ShaderNodeMixRGB'); disk.blend_type = 'ADD'; disk.inputs['Color2'].default_value = ((1.6, 1.6, 1.5, 1) if mode == 'night' else (3.0, 2.6, 1.8, 1))
        nt.links.new(disc.outputs['Result'], disk.inputs['Fac']); nt.links.new(glow.outputs[0], disk.inputs['Color1']); last = disk.outputs[0]
    nt.links.new(last, bg.inputs['Color']); bg.inputs['Strength'].default_value = strength
    if keep_light:
        lp = nt.nodes.new('ShaderNodeLightPath'); mx = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(lp.outputs['Is Camera Ray'], mx.inputs[0]); nt.links.new(light_src, mx.inputs[1]); nt.links.new(bg.outputs[0], mx.inputs[2])
        nt.links.new(mx.outputs[0], out.inputs[0])
    else: nt.links.new(bg.outputs[0], out.inputs[0])


def scatter_detail(p, seed):
    """Real ground detail like the benchmark: tufts of grass and a few flowers instanced over grassy places."""
    from set_library import model
    import library
    t = p['terrain']; ground = (p.get('params') or {}).get('ground', 'grass')
    grassy = (t in ('valley', 'plain', 'river_crossing', 'jungle', 'mountain_pass') or (t == 'custom' and ground in ('grass', 'mud'))) and t != 'snow_mountain'
    if not grassy: return 0
    tufts = [m for m in ('nature-kit/grass_leafsLarge', 'nature-kit/grass_large', 'nature-kit/grass_leafs') if library.known(m)]
    if not tufts: return 0
    n = 0
    for k in range(260):
        a = _wobble(seed, k * 3 + 1) * math.tau; d = 4.2 + 24 * (_wobble(seed + 5, k) ** 0.8)
        x, y = math.cos(a) * d, math.sin(a) * d
        if t == 'river_crossing' and abs(y - RIVER_Y) < RIVER_HALF + 1.5: continue
        z = height(t, x, y, seed, p.get('params'))
        if z < -0.2: continue
        flower = k % 9 == 0 and library.known('nature-kit/flower_yellowA')
        mid = ('nature-kit/flower_yellowA', 'nature-kit/flower_redA', 'nature-kit/flower_purpleA')[k % 3] if flower else tufts[k % len(tufts)]
        try: model({'id': mid, 'pos': [round(x, 3), round(y, 3), round(z, 3)], 'height': (0.35 if flower else 0.45 + 0.45 * _wobble(seed + 9, k)), 'yaw': _wobble(seed + 2, k) * 360}); n += 1
        except Exception: break
    return n


def build_assembly(it):
    """An object the library lacks, composed from <=16 validated primitives (shape, size, position, colour, glow) and scaled to its real height."""
    parts = it['asm']['parts']; shapes = {'box': 'cube', 'cylinder': 'cylinder', 'sphere': 'uv_sphere', 'cone': 'cone', 'torus': 'torus'}
    root = bpy.data.objects.new('asm:' + it['asm']['name'], None); bpy.context.collection.objects.link(root)
    top = max((q['pos'][2] + q['size'][2] / 2) for q in parts); bottom = min((q['pos'][2] - q['size'][2] / 2) for q in parts)
    span = max(1e-3, top - bottom); k = it['height'] / span
    for q in parts:
        getattr(bpy.ops.mesh, f"primitive_{shapes[q['shape']]}_add")(location=(0, 0, 0))
        o = bpy.context.object; o.scale = tuple(v / 2 if q['shape'] != 'torus' else v / 3 for v in q['size']); o.parent = root
        o.location = (q['pos'][0], q['pos'][1], q['pos'][2] - bottom)
        m = bpy.data.materials.new('asm part'); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (*q['color'], 1); b.inputs['Roughness'].default_value = 0.7
        if q.get('glass'):   # transparent glass: beakers, flasks, test tubes, windows
            for name, val in (('Transmission Weight', 1.0), ('Transmission', 1.0)):
                if name in b.inputs: b.inputs[name].default_value = val
            b.inputs['Roughness'].default_value = 0.03
            if 'IOR' in b.inputs: b.inputs['IOR'].default_value = 1.45
            o.visible_shadow = False
        if q.get('glow'):
            b.inputs['Emission Color' if 'Emission Color' in b.inputs else 'Emission'].default_value = (*q['color'], 1); b.inputs['Emission Strength'].default_value = q['glow']
        o.data.materials.append(m)
        for pl in o.data.polygons: pl.use_smooth = q['shape'] in ('sphere', 'cylinder', 'cone')
    root.scale = (k, k, k); root.location = it['pos']; root.rotation_euler.z = math.radians(it['yaw']); root['place_item'] = it['id']
    return root


def build_kit_items(p):
    """Props placed on the floor of an indoor set (lab, workshop, room, office): library models and shape-built objects."""
    from set_library import model
    n = 0
    for it in p.get('items', []):
        x, y, z = it['pos']
        if it['id'].startswith('asm:'): build_assembly(it); n += 1
        elif it['id'].startswith('lib:'):
            try: root = model({'id': it['model'], 'pos': [x, y, z], 'height': it['height'], 'yaw': it['yaw']}); root['place_item'] = it['id']; n += 1
            except Exception as e: print('kit item skipped', it['id'], str(e)[:100], flush=True)
    return n


def build_place(p, mode, duration=1.0, fps=30):
    from set_library import model, _MODEL_CACHE
    if p['terrain'] not in PALETTE and p['terrain'] != 'custom': return False
    frames = max(1, int(round(duration * fps)))
    build_terrain(p['terrain'], p['seed'], params=p.get('params'))
    herd = 0
    for it in p['items']:
        x, y, z = it['pos']
        if it['id'].startswith('asm:'): build_assembly(it); continue
        if it['id'].startswith('lib:'):
            root = model({'id': it['model'], 'pos': [x, y, z], 'height': it['height'], 'yaw': it['yaw']}); root['place_item'] = it['id']; continue
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
    build_sky(mode)
    try: scatter_detail(p, p.get('seed', 0))
    except Exception as e: print('scatter skipped', str(e)[:120], flush=True)
    bpy.ops.object.light_add(type='SUN', rotation=(math.radians(52), 0, math.radians(35)))
    s = bpy.context.active_object.data; s.energy = 2.4; s.angle = math.radians(4); s.color = (1.0, 0.93, 0.82)
    return True
