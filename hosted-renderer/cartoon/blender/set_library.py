"""Offline CC0 set assets. Imported GLBs are normalized once in world space.

Only whitelisted kits/models/maps load; never a URL or a caller-selected path.
"""
import json
import math
from pathlib import Path
import bpy
from mathutils import Vector

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
        if role == 'normal':
            # Object-independent triplanar height bump avoids wrong UV tangents.
            bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.22
            bump.inputs['Distance'].default_value = 0.06
            nt.links.new(output, bump.inputs['Height']); output = bump.outputs[0]
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
                if any(word in old.name.lower() for word in ('wood', 'stone', 'rock', 'wall')):
                    o.data.materials[i] = replacement
        for poly in o.data.polygons: poly.use_smooth = False
    return root


def box(name, pos, size, material):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    o = bpy.context.active_object; o.name = name; o.scale = size
    o.data.materials.append(surface(material))
    mod = o.modifiers.new('soft edges', 'BEVEL'); mod.width = 0.025; mod.segments = 2
    return o


def lighting(mode, indoor=False):
    world = bpy.context.scene.world; nt = world.node_tree
    sky = nt.nodes.new('ShaderNodeTexEnvironment')
    sky.image = bpy.data.images.load(asset_path('overcast' if mode in ('rain', 'night') else mode, 'sky'), check_existing=True)
    nt.links.new(sky.outputs[0], nt.nodes['Background'].inputs['Color'])
    nt.nodes['Background'].inputs['Strength'].default_value = (0.13 if indoor else 0.65) if mode != 'night' else 0.025
    bpy.ops.object.light_add(type='AREA', location=(-3, -4, 7))
    key = bpy.context.active_object; key.rotation_euler = (Vector((0, 1, 1)) - key.location).to_track_quat('-Z', 'Y').to_euler()
    key.data.energy = 650 if indoor else 1500; key.data.size = 5
    key.data.color = (1, 0.72, 0.42) if mode == 'sunset' or indoor else (0.8, 0.89, 1)
    if mode == 'night': key.data.energy = 180; key.data.color = (0.35, 0.5, 1)
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
    for b in kit.get('structure', []): box(b['name'], b['pos'], b['size'], b['surface'])
    for item in kit['models']: model(item)
    lighting(mode, kit.get('indoor', False))


def dress_mine():
    for item in KITS['mine_tunnel']['models']: model(item)