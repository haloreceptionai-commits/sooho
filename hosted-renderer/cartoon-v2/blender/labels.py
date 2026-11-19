"""In-world labels (benchmark rule: names, numbers and years live on a painted sign inside the scene, never as floating text)."""
import math
import bpy


def _mat(name, color, rough=0.9):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1); b.inputs['Roughness'].default_value = rough
    return m


def build_label(lb):
    """A cream board on two posts with dark ink lettering. lb = {'text','pos':[x,y],'yaw':degrees}."""
    x, y = lb['pos']; text = str(lb['text'])[:24]
    root = bpy.data.objects.new('label ' + text, None); bpy.context.collection.objects.link(root)
    root.location = (x, y, 0); root.rotation_euler.z = math.radians(lb.get('yaw', 0)); k = float(lb.get('scale', 1.0)); root.scale = (k, k, k)
    board_m = _mat('label board', (0.93, 0.84, 0.62)); wood = _mat('label post', (0.42, 0.28, 0.15)); ink = _mat('label ink', (0.035, 0.014, 0.016))
    width = max(1.2, min(2.6, 0.30 + 0.2 * len(text)))
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 1.3)); b = bpy.context.object; b.scale = (width, 0.07, 0.62); b.data.materials.append(board_m); b.parent = root
    for sx in (-1, 1):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.04, depth=1.35, location=(sx * (width / 2 - 0.12), 0.0, 0.62)); p = bpy.context.object; p.data.materials.append(wood); p.parent = root
    bpy.ops.object.text_add(location=(0, -0.045, 1.3)); t = bpy.context.object; t.data.body = text; t.data.align_x = 'CENTER'; t.data.align_y = 'CENTER'
    t.data.size = min(0.34, (width - 0.25) / max(1.0, len(text) * 0.62)); t.data.extrude = 0.008; t.rotation_euler = (math.pi / 2, 0, 0)
    t.data.materials.append(ink); t.parent = root
    return root
