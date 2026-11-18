"""Offline CC0 set assets. Imported GLBs are normalized once in world space.

Only whitelisted kits/models/maps load; never a URL or a caller-selected path.
"""
import json
import os
import math
from pathlib import Path
import bpy
from mathutils import Vector
from set_detail import detail_set, practical_lights
from prop_scale import fit_scale

HERE = Path(__file__).resolve().parent
ASSETS = HERE / 'assets'
KITS = json.loads((HERE / 'set-kits.json').read_text())
MANIFEST = json.loads((ASSETS / 'manifest.json').read_text())


def asset_path(identity, kind, role=None):
    matches = [e for e in MANIFEST if e['id'] == identity and e['kind'] == kind and (role is None or e.get('role') == role)]
    if len(matches) != 1:
        if kind == 'model':   # any model of the full CC0 library (catalog-checked, never a caller path)
            import library
            if library.known(identity): return library.path(identity)
        raise ValueError(f'Unknown offline asset {kind}/{identity}/{role}')
    return str(ASSETS / matches[0]['path'])


def plain(name, colour, rough=.8):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True; bs = m.node_tree.nodes['Principled BSDF']
    bs.inputs['Base Color'].default_value = (*colour, 1); bs.inputs['Roughness'].default_value = rough
    return m


def tile(name, a, b, metres=.6, rough=.3):
    """Floor tiles: two close light tones in a chequer, so the floor reads as tile and not as planks."""
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; bs = nt.nodes['Principled BSDF']; bs.inputs['Roughness'].default_value = rough
    geo = nt.nodes.new('ShaderNodeNewGeometry'); chk = nt.nodes.new('ShaderNodeTexChecker'); chk.inputs['Color1'].default_value = (*a, 1); chk.inputs['Color2'].default_value = (*b, 1); chk.inputs['Scale'].default_value = 1.0 / metres
    nt.links.new(geo.outputs['Position'], chk.inputs['Vector']); nt.links.new(chk.outputs['Color'], bs.inputs['Base Color'])
    return m


def surface(name, metres=2):
    if name == 'asphalt': return plain('modern-asphalt', (.13, .135, .15), .9)
    if name == 'pavement': return tile('modern-pavement', (.5, .49, .46), (.44, .43, .41), 1.2, .8)
    if name == 'lawn': return plain('modern-lawn', (.2, .5, .14), .95)
    existing = bpy.data.materials.get(f'cc0-{name}-{metres}')
    if existing: return existing
    m = bpy.data.materials.new(f'cc0-{name}-{metres}'); m.use_nodes = True
    nt = m.node_tree; bs = nt.nodes['Principled BSDF']
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    mapping = nt.nodes.new('ShaderNodeVectorMath'); mapping.operation = 'SCALE'
    mapping.inputs['Scale'].default_value = 1 / metres
    nt.links.new(geo.outputs['Position'], mapping.inputs[0])
    for role, socket in [('color', 'Base Color'), ('roughness', 'Roughness'), ('normal', 'Normal')]:
        tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = bpy.data.images.load(asset_path(name, 'texture', role), check_existing=True)
        tex.image.colorspace_settings.name = 'sRGB' if role == 'color' else 'Non-Color'
        tex.projection = 'BOX'; tex.projection_blend = 0.2
        nt.links.new(mapping.outputs[0], tex.inputs['Vector'])
        output = tex.outputs['Color']
        if role == 'color' and name == 'stone':
            tint=nt.nodes.new('ShaderNodeHueSaturation');tint.inputs['Saturation'].default_value=.25
            tint.inputs['Value'].default_value=1.15
            nt.links.new(output,tint.inputs['Color']);output=tint.outputs[0]
            # Masonry blocks write restrained per-block tint to object colour.
            info=nt.nodes.new('ShaderNodeObjectInfo');vary=nt.nodes.new('ShaderNodeMixRGB')
            vary.blend_type='MULTIPLY';vary.inputs[0].default_value=.35
            nt.links.new(output,vary.inputs[1]);nt.links.new(info.outputs['Color'],vary.inputs[2]);output=vary.outputs[0]
        if role == 'normal':
            # BOX projection has no matching tangent basis. Derive bump from
            # the scanned colour instead of treating tangent RGB as world XYZ.
            normal = nt.nodes.new('ShaderNodeBump')
            normal.inputs['Strength'].default_value = .28;normal.inputs['Distance'].default_value=.045
            color_tex=next(n for n in nt.nodes if n.type=='TEX_IMAGE' and n.image.colorspace_settings.name=='sRGB')
            nt.links.new(color_tex.outputs['Color'],normal.inputs['Height']);output=normal.outputs[0]
        nt.links.new(output, bs.inputs[socket])
    return m


def natural_foliage(m):
    """The kit palette renders leaves and grass teal; shift them to natural greens (same brightness) so worlds look like the benchmark."""
    name = (m.name or '').lower()
    if not m.use_nodes or m.get('foliage_fixed') or not any(k in name for k in ('leaf', 'leafs', 'grass', 'plant', 'bush', 'fern', 'foliage', 'pine', 'palm')): return
    if any(k in name for k in ('wood', 'bark', 'trunk', 'stem')): return
    bs = m.node_tree.nodes.get('Principled BSDF')
    if not bs or bs.inputs['Base Color'].links: return
    r, g, b, a = bs.inputs['Base Color'].default_value
    if not (g > r and b > r * 1.5): return                       # only the teal range
    k = max(0.55, min(1.2, g / 0.8))
    bs.inputs['Base Color'].default_value = (0.20 * k, 0.60 * k, 0.12 * k, a); m['foliage_fixed'] = True


def finish_palette(m):
    """Retain original colour identities, add grain instead of plastic flats."""
    if not m.use_nodes or m.get('set_finish'):return
    bs=m.node_tree.nodes.get('Principled BSDF')
    if not bs:return
    m['set_finish']=True;nt=m.node_tree
    geo=nt.nodes.new('ShaderNodeNewGeometry');noise=nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value=18;noise.inputs['Detail'].default_value=3
    nt.links.new(geo.outputs['Position'],noise.inputs['Vector'])
    bump=nt.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.22;bump.inputs['Distance'].default_value=.025
    nt.links.new(noise.outputs['Fac'],bump.inputs['Height']);nt.links.new(bump.outputs[0],bs.inputs['Normal'])
    ramp=nt.nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(.48,.48,.48,1);ramp.color_ramp.elements[1].color=(1,1,1,1)
    nt.links.new(noise.outputs['Fac'],ramp.inputs[0])
    multiply=nt.nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1
    links=list(bs.inputs['Base Color'].links)
    if links:nt.links.new(links[0].from_socket,multiply.inputs[1])
    else:multiply.inputs[1].default_value=bs.inputs['Base Color'].default_value
    nt.links.new(ramp.outputs[0],multiply.inputs[2]);nt.links.new(multiply.outputs[0],bs.inputs['Base Color'])
    bs.inputs['Roughness'].default_value=.64


_MODEL_CACHE = {}
BIG_ASSETS = []         # props wider than 10 m: checked against the lens in hide_engulfing


def scale_for(spec, height, foot):
    f, clamped = fit_scale(spec['height'], height, foot)
    if clamped: print('ASSET_CLAMPED', spec['id'], round(foot * spec['height'] / height, 1), '->', round(foot * f, 1), flush=True)
    return f


def _instance(spec):
    """Repeat of an already-imported model: copy its objects (sharing mesh data) under a new root.
    Re-importing the same GLB for every tree took most of the scene-build time."""
    c = _MODEL_CACHE[spec['id']]
    root = bpy.data.objects.new('asset:' + spec['id'], None); bpy.context.collection.objects.link(root)
    mapping = {c['root']: root}
    for o in c['order']:
        n = o.copy(); bpy.context.collection.objects.link(n); mapping[o] = n
    for o in c['order']:
        n = mapping[o]; n.parent = mapping.get(o.parent); n.matrix_parent_inverse = o.matrix_parent_inverse.copy()
        n.matrix_basis = o.matrix_basis.copy()
    factor = scale_for(spec, c['height'], c['foot'])
    root.scale = (factor,) * 3; root.location = spec['pos']; root.rotation_euler.z = math.radians(spec.get('yaw', 0))
    if c['foot'] * factor > 10: BIG_ASSETS.append(root)
    return root


def model(spec):
    if spec['id'] in _MODEL_CACHE and 'surface' not in spec and not spec.get('ink'): return _instance(spec)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=asset_path(spec['id'], 'model'))
    objects = set(bpy.data.objects) - before
    meshes = [o for o in objects if o.type == 'MESH']
    if not meshes: raise ValueError(f'Empty model {spec["id"]}')
    bpy.context.view_layer.update()
    points = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    low = Vector(tuple(min(v[i] for v in points) for i in range(3)))
    high = Vector(tuple(max(v[i] for v in points) for i in range(3)))
    height = high.z - low.z
    if height < 1e-6: raise ValueError(f'Zero-height model {spec["id"]}')
    root = bpy.data.objects.new('asset:' + spec['id'], None); bpy.context.collection.objects.link(root)
    center = Vector(((low.x + high.x) / 2, (low.y + high.y) / 2, low.z))
    for o in objects:
        if o.parent not in objects:
            world = o.matrix_world.copy(); o.parent = root; o.matrix_world = world
            o.location -= center
    foot = max(high.x - low.x, high.y - low.y, 1e-6)
    factor = scale_for(spec, height, foot)
    root.scale = (factor,) * 3; root.location = spec['pos']; root.rotation_euler.z = math.radians(spec.get('yaw', 0))
    if foot * factor > 10: BIG_ASSETS.append(root)
    print('ASSET_BOUNDS',spec['id'],[round(float(v),3) for v in (high-low)*factor], 'yaw',spec.get('yaw',0),flush=True)
    for o in meshes:
        for old in o.data.materials:natural_foliage(old);finish_palette(old)
        # Reuse the real model geometry; assign scanned surfaces to appropriate
        # material groups rather than flattening every prop to one wood colour.
        if 'surface' in spec:
            replacement = surface(spec['surface'], spec.get('metres', 2))
            for i, old in enumerate(o.data.materials):
                o.data.materials[i] = replacement
        if spec['id'].startswith('q-modulartrain/'):
            for old in o.data.materials:
                if not old.use_nodes:continue
                bs=old.node_tree.nodes.get('Principled BSDF')
                if bs:
                    bs.inputs['Roughness'].default_value=.38
                    bs.inputs['Metallic'].default_value=.5
        if spec.get('ink'):
            wire = o.modifiers.new('masonry edges', 'BEVEL'); wire.width = 0.007; wire.segments = 1
        # Preserve the source model's smooth/flat shading rather than forcing
        # every detailed surface into coarse flat-shaded facets.
    if 'surface' not in spec and not spec.get('ink') and spec['id'] not in _MODEL_CACHE:
        order = []
        def walk(parent):
            for ch in [o for o in objects if o.parent == parent]: order.append(ch); walk(ch)
        walk(root)
        _MODEL_CACHE[spec['id']] = {'root': root, 'order': order, 'height': height, 'foot': foot}
    return root


def hide_engulfing(points):
    """Last line of defence against a brown or grey void: a wide prop whose bounding box contains the camera (at either end of its move) is hidden for this shot."""
    hidden = []
    for root in BIG_ASSETS:
        meshes = [o for o in root.children_recursive if o.type == 'MESH']
        pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
        if not pts: continue
        lo = [min(v[i] for v in pts) for i in range(3)]; hi = [max(v[i] for v in pts) for i in range(3)]
        if any(all(lo[i] - .05 <= p[i] <= hi[i] + .05 for i in range(3)) for p in points):
            for o in meshes: o.hide_render = True; o.hide_viewport = True
            hidden.append(root.name); print('LENS_BLOCKED', root.name, flush=True)
    return hidden


# Pastel paint for the walls of the older indoor kits (picked per kit), light floors and white ceilings: the brown wood and grey stone made every room dark.
MODERN_WALLS = [(.94, .93, .9), (.86, .92, .95), (.95, .9, .86), (.9, .94, .9)]    # warm white, pale blue, blush, soft sage: painted plaster
PASTELS = [(0.85, 2.3, 2.6), (2.6, 1.25, 1.15), (2.6, 2.3, 0.8), (1.15, 2.5, 1.35), (1.9, 1.3, 2.7)]    # multiplied onto the scanned texture: aqua, coral, lemon, mint, lavender


ERA = None   # story year of the shot being built (set by build_set): before 1900 rooms get period materials


def painted(kit, part, surface_name, metres=2):
    """A bright copy of a scanned surface for a room's floor, walls or ceiling (the texture detail stays, the colour is lifted)."""
    if ERA is not None and ERA < 1900 and kit != 'saloon':   # period rooms: worn planks, lime-wash plaster, dark timber (no tile, no white ceiling, no brick feature wall)
        if 'floor' in part: return plain('period-floor', (.42, .29, .17), .75)
        if 'ceiling' in part: return plain('period-ceiling', (.33, .23, .14), .9)
        if part == 'beam': return plain('period-beam', (.27, .18, .1), .8)
        if 'wall' in part: return plain('period-plaster', (.82, .74, .58), .95)
    if kit != 'saloon':   # modern rooms: tile floor, smooth white ceiling, plain painted walls and one brick feature wall (only the saloon keeps old planks and beams)
        if 'floor' in part: return tile('modern-floor-tile', (.68, .67, .64), (.58, .57, .55), .6)
        if 'ceiling' in part: return plain('modern-ceiling', (.97, .97, .96), .95)
        if part == 'beam': return plain('modern-trim', (.95, .95, .93), .6)
        if 'wall' in part and part != 'back wall': return plain('modern-plaster-' + kit, MODERN_WALLS[sum(map(ord, kit)) % len(MODERN_WALLS)], .9)
        if part == 'back wall': surface_name = 'stone'; tint = (1.9, 1.55, 1.4)    # real brick, lifted and warm
        else: tint = None
        if tint:
            key = f'modern-brick-{metres}'
            if key in bpy.data.materials: return bpy.data.materials[key]
            m = surface(surface_name, metres).copy(); m.name = key; nt = m.node_tree; bs = nt.nodes.get('Principled BSDF')
            if bs is None: return m
            mul = nt.nodes.new('ShaderNodeMixRGB'); mul.blend_type = 'MULTIPLY'; mul.inputs[0].default_value = 1.0; mul.inputs[2].default_value = (*tint, 1)
            links = list(bs.inputs['Base Color'].links)
            if links: nt.links.new(links[0].from_socket, mul.inputs[1])
            nt.links.new(mul.outputs[0], bs.inputs['Base Color']); return m
    if 'floor' in part: tint = (2.2, 2.0, 1.75)          # pale, only slightly warm: a saturated honey floor read as orange
    elif 'ceiling' in part: tint = (3.4, 3.3, 3.1)
    elif part == 'beam': tint = (2.6, 2.5, 2.3)
    elif 'wall' in part: tint = PASTELS[sum(map(ord, kit)) % len(PASTELS)]
    else: return surface(surface_name, metres)
    key = f'bright-{surface_name}-{metres}-{tint}'
    if key in bpy.data.materials: return bpy.data.materials[key]
    m = surface(surface_name, metres).copy(); m.name = key; nt = m.node_tree; bs = nt.nodes.get('Principled BSDF')
    if bs is None: return m
    mul = nt.nodes.new('ShaderNodeMixRGB'); mul.blend_type = 'MULTIPLY'; mul.inputs[0].default_value = 1.0; mul.inputs[2].default_value = (*tint, 1)
    links = list(bs.inputs['Base Color'].links); src = links[0].from_socket if links else None
    if surface_name == 'wood' and src is not None:   # take most of the orange out of the scanned wood first: lifting orange only gives bright orange
        des = nt.nodes.new('ShaderNodeHueSaturation'); des.inputs['Saturation'].default_value = .28; nt.links.new(src, des.inputs['Color']); src = des.outputs[0]
    if src is not None: nt.links.new(src, mul.inputs[1])
    else: mul.inputs[1].default_value = bs.inputs['Base Color'].default_value
    nt.links.new(mul.outputs[0], bs.inputs['Base Color'])
    return m


def box(name, pos, size, material):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    o = bpy.context.active_object; o.name = name; o.scale = size
    o.data.materials.append(material if not isinstance(material, str) else surface(material))
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    mod = o.modifiers.new('soft edges', 'BEVEL'); mod.width = 0.025; mod.segments = 2
    return o


def lighting(mode, indoor=False):
    world = bpy.context.scene.world; nt = world.node_tree
    sky = nt.nodes.new('ShaderNodeTexEnvironment')
    sky.image = bpy.data.images.load(asset_path('overcast' if mode in ('rain', 'night') else mode, 'sky'), check_existing=True)
    nt.links.new(sky.outputs[0], nt.nodes['Background'].inputs['Color'])
    # Separate camera backdrop from illumination: never show a modern city
    # around a historical set, even when a photographic HDR lights it.
    light_path = nt.nodes.new('ShaderNodeLightPath')
    background = nt.nodes.new('ShaderNodeBackground')
    visible_sky = nt.nodes.new('ShaderNodeTexSky')
    for kind in ('NISHITA', 'MULTIPLE_SCATTERING', 'HOSEK_WILKIE'):
        try: visible_sky.sky_type = kind; break
        except TypeError: pass
    visible_sky.sun_elevation=math.radians(30 if mode=='day' else 8)
    visible_sky.sun_rotation=math.radians(140);visible_sky.sun_disc=False
    nt.links.new(visible_sky.outputs[0],background.inputs['Color'])
    background.inputs['Strength'].default_value = .012 if mode=='night' else .15 if mode=='rain' else .7
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(light_path.outputs['Is Camera Ray'], mix.inputs[0])
    nt.links.new(nt.nodes['Background'].outputs[0], mix.inputs[1]); nt.links.new(background.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], nt.nodes['World Output'].inputs['Surface'])
    nt.nodes['Background'].inputs['Strength'].default_value = (0.45 if indoor else .5) if mode != 'night' else 0.08     # a bright, airy world
    if not indoor and os.environ.get('PAINTED_SKY', '1') != '0':   # benchmark: the camera sees a saturated painted sky, not a pale photographic one
        try:
            from place_modules import build_sky
            build_sky(mode, keep_light=True)
        except Exception as e: print('painted sky skipped', str(e)[:120], flush=True)
    bpy.ops.object.light_add(type='AREA', location=(-2, 1, 3.8) if indoor else (-3,-4,7))
    key = bpy.context.active_object; key.rotation_euler = (Vector((0, 6, 1.5)) - key.location).to_track_quat('-Z', 'Y').to_euler()
    key.data.energy = 900 if indoor else 1500; key.data.size = 2.4 if indoor else 3
    key.data.color = (1, 0.72, 0.42) if mode == 'sunset' else (1, 0.95, 0.88) if indoor else (0.9, 0.95, 1)     # neutral daylight, not an orange lamp
    if mode == 'night': key.data.energy = 650; key.data.color = (0.45, 0.6, 1)
    if not indoor and mode in ('day', 'sunset'):
        bpy.ops.object.light_add(type='SUN', rotation=(math.radians(35 if mode == 'day' else 65), math.radians(-20), math.radians(-30)))
        bpy.context.active_object.rotation_euler=(Vector((0,6,0))-Vector((-6,-10,12 if mode=='day' else 5))).to_track_quat('-Z','Y').to_euler()
        bpy.context.active_object.data.energy = 3.2
        bpy.context.active_object.data.angle = math.radians(2)
        bpy.context.active_object.data.color = (1, .7, .38) if mode == 'sunset' else (1, .96, .86)
        bpy.ops.object.light_add(type='AREA',location=(5,8,6))
        rim=bpy.context.active_object;rim.rotation_euler=(Vector((0,5,1))-rim.location).to_track_quat('-Z','Y').to_euler()
        rim.data.energy=500;rim.data.size=4;rim.data.color=(.65,.8,1)
    if indoor:
        # Table lamp pool and warm fill, instead of a single distant ceiling light.
        bpy.ops.object.light_add(type='AREA', location=(1,-1,3.2))
        fill=bpy.context.active_object; fill.rotation_euler=(Vector((0,3,1))-fill.location).to_track_quat('-Z','Y').to_euler()
        fill.data.energy=420;fill.data.size=3;fill.data.color=(1,.97,.92)
        bpy.ops.object.light_add(type='POINT', location=(1,2,1.65))
        bpy.context.active_object.data.energy=45;bpy.context.active_object.data.color=(1,.85,.6);bpy.context.active_object.data.shadow_soft_size=.08
        bpy.ops.object.light_add(type='AREA',location=(2.8,8.4,2.7))
        window=bpy.context.active_object;window.rotation_euler=(Vector((0,2,1))-window.location).to_track_quat('-Z','Y').to_euler()
        window.data.energy=520;window.data.size=2.4;window.data.color=(.75,.85,1)
    if mode == 'rain':
        # Static rain at step 3; animated weather is the step-7 effects clock.
        import random
        rng = random.Random(301)
        m = bpy.data.materials.new('rain'); m.diffuse_color = (0.55, 0.65, 0.8, 1)
        verts=[]; faces=[]
        for i in range(350):
            x,y,z = rng.uniform(-7,7),rng.uniform(-1,12),rng.uniform(0.5,7)
            j=len(verts); verts += [(x,y,z),(x+0.01,y,z),(x+0.07,y,z-0.25),(x+0.06,y,z-0.25)]; faces.append((j,j+1,j+2,j+3))
        mesh=bpy.data.meshes.new('rain-streaks'); mesh.from_pydata(verts,[],faces)
        o=bpy.data.objects.new('rain-streaks',mesh);bpy.context.collection.objects.link(o);o.data.materials.append(m)


def build_set(name, mode='day', shell=None, era=None):
    global ERA
    ERA = era
    kit = KITS[name]
    if shell:   # a recipe's own room: its colours, its lights, no legacy cabin decor
        from shell import build_shell, period_shell
        build_shell(period_shell(shell) if era is not None and era < 1900 else shell); lighting(mode, True)
        for ob in bpy.data.objects:   # the legacy cabin lights are far too hot for a white room: keep them as soft fill
            if ob.type == 'LIGHT' and ob.data.type in ('AREA', 'POINT') and ob.name != 'Area' or (ob.type == 'LIGHT' and ob.data.type in ('AREA', 'POINT')): ob.data.energy *= 0.3
        return
    for b in kit.get('structure', []):
        if b['name'] != 'ocean':box(b['name'], b['pos'], b['size'], painted(name, b['name'], b['surface']) if kit.get('indoor') and b['surface'] in ('wood', 'stone') else b['surface'])
    for item in kit['models']: model(item)
    detail_set(name, (lambda n, m=2: painted(name, 'beam' if n == 'wood' else 'wall' if n == 'stone' else '', n, m)) if kit.get('indoor') else surface)
    lighting(mode, kit.get('indoor', False))
    practical_lights(name,mode)


def dress_mine():
    for item in KITS['mine_tunnel']['models']: model(item)