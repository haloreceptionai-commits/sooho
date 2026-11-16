"""Local render gate for place-registry.json dressing entries (owner rule: a new word -> prop entry is usable only
after a local render check). Run: blender -b --factory-startup --python registry_check.py -- [out_dir]
For every entry: import the exact pinned model, scale it, add horns/flames, render one small CPU still and check
the evaluated meshes exist, stand on the ground, reach the requested height and sit inside the frame.
Writes registry-audit.json {id: {hash, pass, height, frame_box, still}}."""
import json, math, os, sys
import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from place_spec import DRESSING, entry_hash  # noqa: E402


def check(i, out):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    import set_library; set_library._MODEL_CACHE.clear()
    from place_modules import build_place
    sc = bpy.context.scene; sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True
    e = DRESSING[i]
    item = {'id': i, 'model': e['model'], 'pos': [0, 0, 0], 'height': e['height'], 'yaw': 0.0}
    for f in ('horns', 'fire'):
        if e.get(f): item[f] = e[f]
    before = set(bpy.data.objects)
    build_place({'terrain': 'plain', 'time': 'day', 'weather': 'clear', 'seed': 1, 'items': [item]}, 'day')
    made = [o for o in set(bpy.data.objects) - before if o.type == 'MESH' and o.name != 'terrain']
    pts = [o.matrix_world @ Vector(c) for o in made for c in o.bound_box]
    lo = min(p.z for p in pts); hi = max(p.z for p in pts); h = e['height']
    span = max(h, max(p.x for p in pts) - min(p.x for p in pts), max(p.y for p in pts) - min(p.y for p in pts))
    d = max(4.0, span * 2.6)
    bpy.ops.object.camera_add(location=(d * 0.6, -d, h * 0.6)); cam = bpy.context.object; sc.camera = cam
    direction = Vector((0, 0, h * 0.5)) - cam.location; cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = 35
    sc.render.resolution_x, sc.render.resolution_y = 180, 320
    bpy.context.view_layer.update()
    box = [world_to_camera_view(sc, cam, p) for p in pts]
    fb = [min(b.x for b in box), min(b.y for b in box), max(b.x for b in box), max(b.y for b in box)]
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 4
    sc.render.filepath = os.path.join(out, f'{i}.png'); bpy.ops.render.render(write_still=True)
    ok = bool(made) and abs(lo) < 0.2 and hi - lo >= h * 0.85 and fb[0] > -0.05 and fb[1] > -0.05 and fb[2] < 1.05 and fb[3] < 1.05
    return {'hash': entry_hash(i), 'pass': ok, 'height': round(hi - lo, 3), 'ground': round(lo, 3), 'frame_box': [round(v, 3) for v in fb], 'meshes': len(made)}


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = argv[0] if argv else '/tmp/registry-check'; os.makedirs(out, exist_ok=True)
    audit = {}
    for i in DRESSING:
        try: audit[i] = check(i, out)
        except Exception as ex: audit[i] = {'hash': entry_hash(i), 'pass': False, 'error': str(ex)[:200]}
        print('REGISTRY', i, audit[i], flush=True)
    with open(os.path.join(HERE, 'registry-audit.json'), 'w') as f: json.dump(audit, f, indent=1, sort_keys=True)
