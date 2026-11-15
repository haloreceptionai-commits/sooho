"""Offline CC0 set assets. Imported GLBs are normalized once in world space.

Only whitelisted kits/models/maps load; never a URL or a caller-selected path.
"""
import json
import math
from pathlib import Path
import bpy
from mathutils import Vector
from set_detail import detail_set, practical_lights

HERE = Path(__file__).resolve().parent
ASSETS = HERE / 'assets'
KITS = json.loads((HERE / 'set-kits.json').read_text())
MANIFEST = json.loads((ASSETS / 'manifest.json').read_text())


def asset_path(identity, kind, role=None):
    matches = [e for e in MANIFEST if e['id'] == identity and e['kind'] == kind and (role is None or e.get('role') == role)]
    if len(matches) != 1:
        raise ValueError(f'Unknown offline asset {kind}/{identity}/{role}')
    return str(ASSETS / matches[0]['path'])


def surface(name, metres=2):
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
        if role == 'normal':
            normal = nt.nodes.new('ShaderNodeNormalMap'); normal.space = 'WORLD'
            normal.inputs['Strength'].default_value = .35
            nt.links.new(output, normal.inputs['Color']); output = normal.outputs[0]
        nt.links.new(output, bs.inputs[socket])
    return m


def model(spec):
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
    factor = spec['height'] / height
    root.scale = (factor,) * 3; root.location = spec['pos']; root.rotation_euler.z = math.radians(spec.get('yaw', 0))
    for o in meshes:
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
    return root


def box(name, pos, size, material):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    o = bpy.context.active_object; o.name = name; o.scale = size
    o.data.materials.append(surface(material))
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
    visible_sky = nt.nodes.new('ShaderNodeTexSky');visible_sky.sky_type='NISHITA'
    visible_sky.sun_elevation=math.radians(30 if mode=='day' else 8)
    visible_sky.sun_rotation=math.radians(140);visible_sky.sun_disc=False
    nt.links.new(visible_sky.outputs[0],background.inputs['Color'])
    background.inputs['Strength'].default_value = .012 if mode=='night' else .15 if mode=='rain' else .7
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(light_path.outputs['Is Camera Ray'], mix.inputs[0])
    nt.links.new(nt.nodes['Background'].outputs[0], mix.inputs[1]); nt.links.new(background.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], nt.nodes['World Output'].inputs['Surface'])
    nt.nodes['Background'].inputs['Strength'].default_value = (0.08 if indoor else .22) if mode != 'night' else 0.025
    bpy.ops.object.light_add(type='AREA', location=(-2, 1, 3.8) if indoor else (-3,-4,7))
    key = bpy.context.active_object; key.rotation_euler = (Vector((0, 6, 1.5)) - key.location).to_track_quat('-Z', 'Y').to_euler()
    key.data.energy = 450 if indoor else 1100; key.data.size = 1.3 if indoor else 3
    key.data.color = (1, 0.72, 0.42) if mode == 'sunset' or indoor else (0.8, 0.89, 1)
    if mode == 'night': key.data.energy = 400; key.data.color = (0.35, 0.5, 1)
    if not indoor and mode in ('day', 'sunset'):
        bpy.ops.object.light_add(type='SUN', rotation=(math.radians(35 if mode == 'day' else 65), math.radians(-20), math.radians(-30)))
        bpy.context.active_object.rotation_euler=(Vector((0,6,0))-Vector((-6,-10,12 if mode=='day' else 5))).to_track_quat('-Z','Y').to_euler()
        bpy.context.active_object.data.energy = 3.5
        bpy.context.active_object.data.angle = math.radians(2)
        bpy.context.active_object.data.color = (1, .7, .38) if mode == 'sunset' else (1, .96, .86)
        bpy.ops.object.light_add(type='AREA',location=(5,8,6))
        rim=bpy.context.active_object;rim.rotation_euler=(Vector((0,5,1))-rim.location).to_track_quat('-Z','Y').to_euler()
        rim.data.energy=500;rim.data.size=4;rim.data.color=(.65,.8,1)
    if indoor:
        # Table lamp pool and warm fill, instead of a single distant ceiling light.
        bpy.ops.object.light_add(type='AREA', location=(1,-1,3.2))
        fill=bpy.context.active_object; fill.rotation_euler=(Vector((0,3,1))-fill.location).to_track_quat('-Z','Y').to_euler()
        fill.data.energy=180;fill.data.size=2;fill.data.color=(1,.76,.48)
        bpy.ops.object.light_add(type='POINT', location=(1,2,1.65))
        bpy.context.active_object.data.energy=35;bpy.context.active_object.data.color=(1,.57,.22);bpy.context.active_object.data.shadow_soft_size=.08
        bpy.ops.object.light_add(type='AREA',location=(2.8,8.4,2.7))
        window=bpy.context.active_object;window.rotation_euler=(Vector((0,2,1))-window.location).to_track_quat('-Z','Y').to_euler()
        window.data.energy=250;window.data.size=1.6;window.data.color=(.55,.7,1)
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


def build_set(name, mode='day'):
    kit = KITS[name]
    for b in kit.get('structure', []):
        if b['name'] != 'ocean':box(b['name'], b['pos'], b['size'], b['surface'])
    for item in kit['models']: model(item)
    detail_set(name,surface)
    lighting(mode, kit.get('indoor', False))
    practical_lights(name,mode)


def dress_mine():
    for item in KITS['mine_tunnel']['models']: model(item)