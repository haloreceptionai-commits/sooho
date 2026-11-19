"""House style finish (from the benchmark creator's rulebook): flat painted colours, soft 3-band cel shading, no gloss, and a thin dark ink
outline on every prop. Runs after a scene is built, on the materials and meshes that exist then. Cycles has no Shader-to-RGB, so the bands
come from the Toon BSDF node. Set ADVANCED_TOON=off to skip it."""
import math, os
import bpy

INK = (0.0356, 0.0137, 0.0161)   # #351f22 in linear light
_INK_MAT = None


def ink_material():
    """Ink: opaque on the shell's far faces, transparent on its near faces (inverted-hull outline)."""
    global _INK_MAT
    if _INK_MAT is None:
        m = bpy.data.materials.new('house ink'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial'); geo = nt.nodes.new('ShaderNodeNewGeometry'); mix = nt.nodes.new('ShaderNodeMixShader')
        tr = nt.nodes.new('ShaderNodeBsdfTransparent'); em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*INK, 1)
        nt.links.new(geo.outputs['Backfacing'], mix.inputs['Fac']); nt.links.new(em.outputs[0], mix.inputs[1]); nt.links.new(tr.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs['Surface']); _INK_MAT = m
    return _INK_MAT


def _skip(m):
    n = (m.name or '').lower()
    return any(k in n for k in ('ink', 'water', 'sea', 'river', 'fx ', 'flame', 'ember', 'sky', 'backdrop', 'glass', 'card'))


def toonify_material(m, size=0.55):
    """Replace the Principled BSDF with two Toon BSDFs of different band sizes (a 3-tone look). Keeps the base colour or its texture."""
    if not m or not m.use_nodes or m.get('toon') or _skip(m): return False
    nt = m.node_tree
    out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output), None) or next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None)
    if not out or not out.inputs['Surface'].links: return False
    src = out.inputs['Surface'].links[0].from_node
    if src.type != 'BSDF_PRINCIPLED': return False          # emission, transparent and custom shaders stay as they are
    p = src
    emis = p.inputs.get('Emission Strength'); trans = p.inputs.get('Transmission Weight') or p.inputs.get('Transmission')
    if (emis and emis.default_value > 0.5) or (trans and trans.default_value > 0.5): return False
    base = p.inputs['Base Color']
    t1 = nt.nodes.new('ShaderNodeBsdfToon'); t2 = nt.nodes.new('ShaderNodeBsdfToon'); mix = nt.nodes.new('ShaderNodeMixShader')
    t1.component = 'DIFFUSE'; t1.inputs['Size'].default_value = size; t1.inputs['Smooth'].default_value = 0.10
    t2.component = 'DIFFUSE'; t2.inputs['Size'].default_value = min(1.0, size + 0.38); t2.inputs['Smooth'].default_value = 0.16
    for t in (t1, t2):
        if base.links: nt.links.new(base.links[0].from_socket, t.inputs['Color'])
        else: t.inputs['Color'].default_value = base.default_value
    mix.inputs['Fac'].default_value = 0.5
    nt.links.new(t1.outputs[0], mix.inputs[1]); nt.links.new(t2.outputs[0], mix.inputs[2]); nt.links.new(mix.outputs[0], out.inputs['Surface'])
    m['toon'] = True
    return True


def ink_object(o, width):
    """Thin ink outline: a flipped, slightly inflated single-layer shell, camera-only. width is in world metres."""
    if o.type != 'MESH' or o.get('ink_hull') or o.name.startswith(('ink ', 'fx ', 'crowd ink')) or not o.data.polygons: return None
    s = o.matrix_world.to_scale(); mean = max(1e-4, (abs(s.x) + abs(s.y) + abs(s.z)) / 3)
    hull = o.copy(); hull.data = o.data.copy(); hull.name = 'ink ' + o.name; hull['ink_hull'] = True
    hull.data.materials.clear(); hull.data.materials.append(ink_material())
    for md in list(hull.modifiers):
        if md.type in ('ARMATURE',): continue           # keep skinning so outlines follow animated rigs
        hull.modifiers.remove(md)
    bpy.context.collection.objects.link(hull)
    for poly in hull.data.polygons: poly.flip()
    d = hull.modifiers.new('grow', 'DISPLACE'); d.strength = -width / mean; d.mid_level = 0
    hull.visible_shadow = False; hull.visible_diffuse = False; hull.visible_glossy = False; hull.visible_transmission = False; hull.visible_volume_scatter = False
    o['ink_hull'] = True
    return hull


def apply_house_style(ink_width=0.012, max_objects=400):
    """Toon materials everywhere, ink on every prop that is not ground-sized. Returns (materials changed, outlines added)."""
    if os.environ.get('ADVANCED_TOON', 'on') == 'off': return (0, 0)
    bpy.context.view_layer.update()
    mats = set()
    for o in bpy.data.objects:
        if o.type == 'MESH':
            for m in o.data.materials: mats.add(m)
    changed = sum(1 for m in mats if toonify_material(m))
    added = 0
    CHAR = ('cast ', ' cloth', ' hat', ' trim', ' skin', ' hair', ' trousers', ' shoes', ' eye', ' iris', ' pupil', ' brow', ' lip', ' blush', ' face ink', 'crowd', 'benchmark ink')
    meshes = [o for o in bpy.data.objects if o.type == 'MESH' and not o.get('ink_hull') and not o.name.startswith(('ink ', 'fx ', 'terrain', 'sea', 'river', 'crowd'))
              and not any(any(k in (m.name if m else '') for k in CHAR) for m in o.data.materials)]
    meshes.sort(key=lambda o: -max(o.dimensions))
    for o in meshes:
        if added >= max_objects: break
        if max(o.dimensions) > 60: continue                     # terrain, sea, sky domes: no outline
        if ink_object(o, ink_width): added += 1
    return (changed, added)
