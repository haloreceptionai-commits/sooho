"""Photographic street for 'look': 'realistic' shots: asphalt road with painted edge lines, concrete pavers on the footpaths,
kerbs, and a noisy lawn. Procedural node materials only (no images, no URLs), so every machine renders the same street."""
import bpy
from set_library import box, tile, plain


def _node_mat(name, base_a, base_b, scale, rough, bump, noise_detail=8):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; bs = nt.nodes['Principled BSDF']
    bs.inputs['Roughness'].default_value = rough
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = scale; nz.inputs['Detail'].default_value = noise_detail
    ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color = (*base_a, 1); ramp.color_ramp.elements[1].color = (*base_b, 1)
    nt.links.new(geo.outputs['Position'], nz.inputs['Vector']); nt.links.new(nz.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], bs.inputs['Base Color'])
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = bump; bp.inputs['Distance'].default_value = 0.02
    nt.links.new(nz.outputs['Fac'], bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], bs.inputs['Normal'])
    return m


import os
from pathlib import Path
_TEX = Path(__file__).resolve().parent / 'assets' / 'ambientcg'


def _scanned(name, folder, metres, bump=0.6):
    """A CC0 scanned surface (colour, normal, roughness) projected in world space; cached per name."""
    m = bpy.data.materials.get(name)
    if m: return m
    base = _TEX / folder / f'{folder}_1K-JPG'
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; bs = nt.nodes['Principled BSDF']
    geo = nt.nodes.new('ShaderNodeNewGeometry'); mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1 / metres,) * 3
    nt.links.new(geo.outputs['Position'], mp.inputs['Vector'])
    def img(suffix, srgb):
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(str(base) + suffix, check_existing=True)
        t.image.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'; t.projection = 'BOX'; t.projection_blend = 0.3
        nt.links.new(mp.outputs['Vector'], t.inputs['Vector']); return t
    col = img('_Color.jpg', True); rough = img('_Roughness.jpg', False); nrm = img('_NormalGL.jpg', False)
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = bump
    nt.links.new(col.outputs['Color'], bs.inputs['Base Color']); nt.links.new(rough.outputs['Color'], bs.inputs['Roughness'])
    nt.links.new(nrm.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bs.inputs['Normal'])
    return m


def asphalt():
    if (_TEX / 'Asphalt010').exists(): return _scanned('real-asphalt-scan', 'Asphalt010', 4.0, 0.4)
    return _node_mat('real-asphalt', (0.16, 0.16, 0.17), (0.26, 0.26, 0.27), 14.0, 0.85, 0.5, 10)


def paver():
    if (_TEX / 'PavingStones070').exists(): return _scanned('real-paver-scan', 'PavingStones070', 2.0, 0.5)
    return tile('real-paver', (0.66, 0.64, 0.6), (0.6, 0.58, 0.55), metres=0.6, rough=0.8)


def brick():
    """Scanned brick for the house walls, used by set_library.reskin_house when the realistic look is on."""
    if (_TEX / 'Bricks059').exists(): return _scanned('real-brick-scan', 'Bricks059', 2.2, 0.7)
    return None


def lawn():
    return _node_mat('real-lawn', (0.09, 0.22, 0.05), (0.18, 0.34, 0.1), 6.0, 0.95, 0.3, 6)


def paint_line():
    m = bpy.data.materials.get('real-paint')
    if m: return m
    m = bpy.data.materials.new('real-paint'); m.use_nodes = True; m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.9, 0.88, 0.8, 1)
    m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.6
    return m


def build_streetscape(y0=-2.0, y1=40.0, road_half=3.0, walk=1.8):
    """Road centred on x=0 running along y, kerbs, footpaths and a lawn strip beside the houses."""
    L = y1 - y0; cy = (y0 + y1) / 2
    box('real road', (0, cy, 0.04), (road_half * 2, L, 0.08), asphalt())
    for s in (-1, 1):
        x = s * (road_half + walk / 2)
        box('real footpath', (x, cy, 0.02), (walk, L, 0.08), paver())
        box('real kerb', (s * (road_half + 0.08), cy, 0.09), (0.16, L, 0.18), paver())
    for y in range(int(y0), int(y1), 4):   # dashed centre line
        box('real centre dash', (0, y + 1.0, 0.085), (0.14, 2.0, 0.01), paint_line())
    box('real verge', (-(road_half + walk + 1.5), cy, -0.01), (3.0, L, 0.02), lawn())
    box('real verge', ((road_half + walk + 1.5), cy, -0.01), (3.0, L, 0.02), lawn())


def _glass():
    m = bpy.data.materials.get('real-glass')
    if m: return m
    m = bpy.data.materials.new('real-glass'); m.use_nodes = True; bs = m.node_tree.nodes['Principled BSDF']
    bs.inputs['Base Color'].default_value = (0.04, 0.06, 0.08, 1); bs.inputs['Roughness'].default_value = 0.08
    bs.inputs['Metallic'].default_value = 0.0
    return m


def _white():
    m = bpy.data.materials.get('real-trim')
    if m: return m
    m = bpy.data.materials.new('real-trim'); m.use_nodes = True; bs = m.node_tree.nodes['Principled BSDF']
    bs.inputs['Base Color'].default_value = (0.9, 0.89, 0.86, 1); bs.inputs['Roughness'].default_value = 0.5
    return m


def _door():
    m = bpy.data.materials.get('real-door')
    if m: return m
    m = bpy.data.materials.new('real-door'); m.use_nodes = True; bs = m.node_tree.nodes['Principled BSDF']
    bs.inputs['Base Color'].default_value = (0.1, 0.22, 0.2, 1); bs.inputs['Roughness'].default_value = 0.45
    return m


def _scanned_roof():
    """Clay roof tiles: the CC0 brick scan is too regular for tiles, so tile courses are generated (no image)."""
    return _node_mat('real-roof-tile', (0.52, 0.22, 0.14), (0.66, 0.3, 0.18), 7.0, 0.7, 0.8, 4)


def _part(root, name, loc, size, mat, rot_x=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
    o = bpy.context.active_object; o.name = name
    o.scale = size; o.location = loc; o.rotation_euler.x = rot_x
    o.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.parent = root
    return o


def townhouse(x, y, yaw, lot=6.4, depth=8.5, height=6.2, roof_h=2.6, floors=2, seed=0):
    """A brick townhouse with a pitched tile roof, a chimney, framed glass windows on each floor and a front door.
    Local front faces -y, so yaw=+90 faces +x (the left side of the road) and yaw=-90 faces -x. Built from boxes, like the
    reference scene, with scanned brick and generated tile for the surfaces."""
    import math, random
    rng = random.Random(seed)
    root = bpy.data.objects.new(f'townhouse {x:.1f},{y:.1f}', None); bpy.context.collection.objects.link(root)
    root.location = (x, y, 0); root.rotation_euler.z = math.radians(yaw)
    wall = brick()
    if wall is None: wall = _node_mat('real-brick-fallback', (0.6, 0.3, 0.2), (0.5, 0.24, 0.16), 3.0, 0.8, 0.5, 6)
    _part(root, 'wall', (0, 0, height / 2), (lot, depth, height), wall)
    slope = math.atan2(roof_h, lot / 2)
    run = math.hypot(lot / 2, roof_h)
    for s in (-1, 1):   # two roof planes meeting at the ridge
        _part(root, 'roof plane', (s * lot / 4, 0, height + roof_h / 2), (run + 0.3, depth + 0.5, 0.14), _scanned_roof(), rot_x=0.0).rotation_euler.y = s * slope
    _part(root, 'chimney', (lot * 0.28, depth * 0.2, height + roof_h * 0.75), (0.8, 0.8, 1.6), wall)
    fl = height / floors
    for f in range(floors):
        zc = fl * f + fl * 0.55
        for wx in (-lot * 0.28, lot * 0.28):
            _part(root, 'window frame', (wx, -depth / 2 - 0.02, zc), (1.45, 0.1, 1.45), _white())
            _part(root, 'window glass', (wx, -depth / 2 - 0.08, zc), (1.2, 0.06, 1.2), _glass())
    _part(root, 'door frame', (0.0, -depth / 2 - 0.02, 1.15), (1.25, 0.1, 2.35), _white())
    _part(root, 'door', (0.0, -depth / 2 - 0.08, 1.1), (1.0, 0.06, 2.2), _door())
    _part(root, 'plinth', (0, 0, 0.18), (lot + 0.2, depth + 0.2, 0.36), _white())
    return root


def build_townhouse_row(side, y0, y1, setback=5.5, lot=6.4, depth=8.5, seed=1):
    """A continuous row of townhouses along one side of the road. side=-1 is the left, +1 the right."""
    import math
    x = side * (setback + depth / 2)
    yaw = 90.0 if side < 0 else -90.0
    y = y0 + lot / 2; i = 0
    while y + lot / 2 <= y1:
        townhouse(x, y, yaw, lot=lot, depth=depth, seed=seed + i)
        y += lot + 0.25; i += 1
    return i


_LEAF = Path(__file__).resolve().parent / 'assets' / 'ambientcg' / 'LeafSet001' / 'LeafSet001_1K-JPG'
_HDRI = Path(__file__).resolve().parent / 'assets' / 'hdri' / 'kloofendal_48d_partly_cloudy_puresky_1k.hdr'


def leaf_material():
    """Scanned leaf colour with its opacity map as alpha, so foliage has cut-out edges and real leaf colour."""
    m = bpy.data.materials.get('real-leaf-scan')
    if m: return m
    m = bpy.data.materials.new('real-leaf-scan'); m.use_nodes = True; nt = m.node_tree; bs = nt.nodes['Principled BSDF']
    bs.inputs['Roughness'].default_value = 0.7
    geo = nt.nodes.new('ShaderNodeNewGeometry'); mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (0.5, 0.5, 0.5)
    nt.links.new(geo.outputs['Position'], mp.inputs['Vector'])
    def img(suffix, srgb):
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(str(_LEAF) + suffix, check_existing=True)
        t.image.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'; t.projection = 'BOX'; t.projection_blend = 0.3
        nt.links.new(mp.outputs['Vector'], t.inputs['Vector']); return t
    col = img('_Color.jpg', True); op = img('_Opacity.jpg', False); rg = img('_Roughness.jpg', False)
    nt.links.new(col.outputs['Color'], bs.inputs['Base Color']); nt.links.new(rg.outputs['Color'], bs.inputs['Roughness'])
    nt.links.new(op.outputs['Color'], bs.inputs['Alpha'])
    try: m.surface_render_method = 'DITHERED'
    except Exception: pass
    m.blend_method = 'CLIP'
    return m


def apply_hdri(world, strength=1.0):
    """Replace the world with a CC0 sky HDRI: it lights the scene and shows the sky behind the houses."""
    if not _HDRI.exists() or world is None: return False
    world.use_nodes = True; nt = world.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    env = nt.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(str(_HDRI), check_existing=True)
    bg = nt.nodes.new('ShaderNodeBackground'); bg.inputs['Strength'].default_value = strength
    out = nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(env.outputs['Color'], bg.inputs['Color']); nt.links.new(bg.outputs['Background'], out.inputs['Surface'])
    return True


def _card(root, loc, size, rot, mat):
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, 0))
    o = bpy.context.active_object; o.name = 'leaf card'
    o.rotation_euler = rot; o.location = loc
    o.data.materials.append(mat); o.parent = root
    return o


def leaf_tree(x, y, height=7.0, seed=0, card=1.5, cards=70):
    """A tree made of many leaf cards (scanned leaf colour, opacity cut-outs) round a bark trunk. Crown is irregular and
    deterministic per seed, so the same tree is drawn the same way on every machine."""
    import math, random
    rng = random.Random(seed)
    root = bpy.data.objects.new(f'tree {x:.1f},{y:.1f}', None); bpy.context.collection.objects.link(root)
    root.location = (x, y, 0)
    bark = plain('real-bark', (0.22, 0.17, 0.12), 0.9)
    leaves = leaf_material()
    trunk_h = height * 0.42
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.16, depth=trunk_h, location=(0, 0, trunk_h / 2))
    t = bpy.context.active_object; t.name = 'trunk'; t.data.materials.append(bark); t.parent = root
    crown_c = trunk_h + height * 0.3
    for k in range(cards):
        a = rng.uniform(0, math.tau); r = rng.uniform(0, 1.9) * (height / 7.0)
        zc = crown_c + rng.uniform(-1.0, 1.6) * (height / 7.0)
        loc = (math.cos(a) * r, math.sin(a) * r, zc)
        rot = (rng.uniform(-0.5, 0.5) + math.pi / 2, 0.0, rng.uniform(0, math.tau))
        _card(root, loc, card * rng.uniform(0.8, 1.25), rot, leaves)
    return root


def build_street_trees(y0, y1, every=8.0, height=7.0, setback=4.5):
    """Leaf-card trees on both footpaths, between the lamp posts."""
    n = 0; y = y0 + every / 2
    while y < y1:
        for s in (-1, 1):
            leaf_tree(s * setback, y + (0.0 if s < 0 else every / 2), height, seed=int(y * 10) + s, )
            n += 1
        y += every
    return n


_SHOP_COLOURS = [(0.55, 0.12, 0.1), (0.1, 0.25, 0.45), (0.12, 0.42, 0.25), (0.62, 0.5, 0.2), (0.35, 0.12, 0.42)]


def _awning(root, lot, depth, y_front, colour):
    m = _node_mat('real-awning-%s' % (round(colour[0] * 100),), colour, (colour[0] * 1.2, colour[1] * 1.2, colour[2] * 1.2), 2.0, 0.7, 0.2, 3)
    _part(root, 'awning', (0, -depth / 2 - 0.8, 3.0), (lot * 0.92, 1.6, 0.08), m, rot_x=0.35)


def shop(x, y, yaw, lot=6.4, depth=8.5, height=6.2, seed=0):
    """A high-street shop: brick upper floor, a large glass shopfront with a coloured awning, and a fascia sign board."""
    import math, random
    rng = random.Random(seed)
    root = bpy.data.objects.new(f'shop {x:.1f},{y:.1f}', None); bpy.context.collection.objects.link(root)
    root.location = (x, y, 0); root.rotation_euler.z = math.radians(yaw)
    wall = brick()
    if wall is None: wall = _node_mat('real-brick-fallback', (0.6, 0.3, 0.2), (0.5, 0.24, 0.16), 3.0, 0.8, 0.5, 6)
    _part(root, 'shop wall', (0, 0, height / 2), (lot, depth, height), wall)
    slope = math.atan2(2.6, lot / 2); run = math.hypot(lot / 2, 2.6)
    for s in (-1, 1):
        _part(root, 'shop roof', (s * lot / 4, 0, height + 1.3), (run + 0.3, depth + 0.5, 0.14), _scanned_roof()).rotation_euler.y = s * slope
    colour = rng.choice(_SHOP_COLOURS)
    sign = _node_mat('real-sign-%d' % rng.randrange(1000), colour, colour, 2.0, 0.5, 0.0, 2)
    _part(root, 'fascia sign', (0, -depth / 2 - 0.04, 4.0), (lot * 0.9, 0.12, 0.7), sign)
    _part(root, 'shopfront glass', (0, -depth / 2 - 0.06, 1.7), (lot * 0.8, 0.06, 2.4), _glass())
    _part(root, 'shopfront frame', (0, -depth / 2 - 0.03, 0.4), (lot * 0.86, 0.12, 0.8), _white())
    _part(root, 'shop door', (lot * 0.36, -depth / 2 - 0.08, 1.1), (0.9, 0.06, 2.2), _door())
    _awning(root, lot, depth, -depth / 2, colour)
    for f in range(2):
        for wx in (-lot * 0.28, lot * 0.28):
            _part(root, 'upper window', (wx, -depth / 2 - 0.02, height * 0.45 + f * 2.2 + 0.4), (1.3, 0.1, 1.3), _glass())
    return root


def build_high_street(y0, y1, side=1, setback=5.5, lot=6.4, depth=8.5, seed=7):
    """A row of shops along one side of the road, with a few parked cars left to the caller."""
    x = side * (setback + depth / 2); yaw = 90.0 if side < 0 else -90.0
    y = y0 + lot / 2; i = 0
    while y + lot / 2 <= y1:
        shop(x, y, yaw, lot=lot, depth=depth, seed=seed + i)
        y += lot + 0.25; i += 1
    return i
