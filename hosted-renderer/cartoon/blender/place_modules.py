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
    if t == 'river_crossing':
        bpy.ops.mesh.primitive_plane_add(size=1, location=(0, RIVER_Y, -0.35)); w = bpy.context.object; w.name = 'river'
        w.scale = (size, RIVER_HALF * 2 + 2.5, 1)
        m = bpy.data.materials.new('water'); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (0.05, 0.16, 0.2, 1); b.inputs['Roughness'].default_value = 0.08
        w.data.materials.append(m)
    return ob


def flame(loc, size=0.25, m=None):
    if m is None:
        m = bpy.data.materials.get('flame') or bpy.data.materials.new('flame'); m.use_nodes = True
        e = m.node_tree.nodes['Principled BSDF']; e.inputs['Base Color'].default_value = (1, 0.3, 0.03, 1)
        e.inputs['Emission Color' if 'Emission Color' in e.inputs else 'Emission'].default_value = (1, 0.28, 0.02, 1)
        e.inputs['Emission Strength'].default_value = 4.5
    bpy.ops.mesh.primitive_cone_add(radius1=size * 0.5, depth=size * 1.6, location=(loc[0], loc[1], loc[2] + size * 0.8))
    ob = bpy.context.object; ob.data.materials.append(m)
    bpy.ops.object.light_add(type='POINT', location=(loc[0], loc[1], loc[2] + size * 1.4))
    L = bpy.context.object.data; L.energy = 60 * size / 0.25; L.color = (1, 0.55, 0.2); L.shadow_soft_size = 0.2
    return ob


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


def build_place(p, mode):
    from set_library import model
    if p['terrain'] not in PALETTE: return False
    build_terrain(p['terrain'], p['seed'])
    for it in p['items']:
        x, y, z = it['pos']
        root = model({'id': it['model'], 'pos': [x, y, z], 'height': it['height'], 'yaw': it['yaw']})
        root['place_item'] = it['id']
        if it.get('horns'):
            ox_coat(root)
            yaw = math.radians(it['yaw']); h = it['height']
            fx, fy = -math.sin(yaw), math.cos(yaw)   # model front
            for sx in (-1, 1):
                rx, ry = math.cos(yaw) * sx * 0.22, math.sin(yaw) * sx * 0.22
                tip = (x + fx * 0.75 + rx, y + fy * 0.75 + ry, z + h * 0.98)
                m = bpy.data.materials.get('horn') or bpy.data.materials.new('horn'); m.use_nodes = True
                m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.85, 0.8, 0.65, 1)
                bpy.ops.mesh.primitive_cone_add(radius1=0.05, depth=0.35, location=tip, rotation=(0, sx * math.radians(55), yaw))
                bpy.context.object.data.materials.append(m)
                if it.get('fire') == 'horns': flame((tip[0] + sx * 0.12, tip[1], tip[2] + 0.1), 0.22)
        elif it.get('fire') == 'top':
            flame((x, y, z + it['height'] * (0.95 if it['id'] == 'torch' else 0.3)), 0.2 if it['id'] == 'torch' else 0.45)
    w = bpy.context.scene.world.node_tree; nodes = w.nodes
    sky = nodes.new('ShaderNodeTexSky')
    try: sky.sky_type = 'NISHITA'; sky.sun_elevation = math.radians(30); sky.sun_rotation = math.radians(35)
    except Exception: pass
    w.links.new(sky.outputs[0], nodes['Background'].inputs['Color']); nodes['Background'].inputs['Strength'].default_value = .2
    bpy.ops.object.light_add(type='SUN', rotation=(math.radians(52), 0, math.radians(35)))
    s = bpy.context.active_object.data; s.energy = 2.4; s.angle = math.radians(4); s.color = (1.0, 0.93, 0.82)
    return True
