"""Room shell: the floor, walls, ceiling and lights of an indoor world, in the colours the recipe asks for.
A hospital is pale and tiled, a courtroom is dark wood, a throne room is stone. Replaces the single wooden-cabin set and its decor (window, beams, map);
the recipe's own furniture fills the room. Pure data in, Blender objects out; validated by place_spec.validate_shell."""
import bpy
import math


def _mat(name, color, rough=.7, checker=None, scale=1.2, glow=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; bs = nt.nodes['Principled BSDF']
    bs.inputs['Roughness'].default_value = rough
    if checker:
        geo = nt.nodes.new('ShaderNodeNewGeometry'); chk = nt.nodes.new('ShaderNodeTexChecker')
        chk.inputs['Color1'].default_value = (*color, 1); chk.inputs['Color2'].default_value = (*checker, 1); chk.inputs['Scale'].default_value = 1.0 / scale
        nt.links.new(geo.outputs['Position'], chk.inputs['Vector']); nt.links.new(chk.outputs['Color'], bs.inputs['Base Color'])
    else:
        bs.inputs['Base Color'].default_value = (*color, 1)
    if glow:
        bs.inputs['Emission Color' if 'Emission Color' in bs.inputs else 'Emission'].default_value = (*color, 1); bs.inputs['Emission Strength'].default_value = glow
    return m


def _box(name, pos, size, mat, bevel=.02):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    o = bpy.context.active_object; o.name = name; o.scale = size
    o.data.materials.append(mat); bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = o.modifiers.new('soft edges', 'BEVEL'); mod.width = bevel; mod.segments = 2
    return o


def build_shell(sh):
    floor = _mat('shell floor', tuple(sh['floor']), .55, tuple(sh['floor2']) if sh.get('floor2') else None)
    wall = _mat('shell wall', tuple(sh['wall']), .85)
    ceil = _mat('shell ceiling', tuple(sh['ceiling']), .9)
    _box('floor', (0, -1, -0.1), (12, 24, .2), floor, 0)
    _box('back wall', (0, 9, 2.3), (12, .2, 4.6), wall)
    _box('left wall', (-5.9, -1, 2.3), (.2, 20, 4.6), wall)
    _box('right wall', (5.9, -1, 2.3), (.2, 20, 4.6), wall)
    _box('ceiling', (0, -1, 4.7), (12, 24, .2), ceil)
    skirt = _mat('shell skirting', tuple(sh.get('accent', [.9, .9, .9])), .6)
    _box('skirting', (0, 8.88, .1), (12, .06, .2), skirt, .01)
    if sh.get('wainscot'):   # lower wall panelling (courtrooms, halls)
        pan = _mat('shell wainscot', tuple(sh['wainscot']), .6)
        _box('wainscot back', (0, 8.86, .65), (12, .1, 1.3), pan, .015); _box('wainscot left', (-5.78, 4, .65), (.1, 10, 1.3), pan, .015); _box('wainscot right', (5.78, 4, .65), (.1, 10, 1.3), pan, .015)
    lc = tuple(sh.get('light', [1, .95, .85]))
    lm = _mat('shell lamp', lc, .5, None, 1, 6.0)
    for x in (-2.8, 2.8):
        for y in (2.0, 6.0):
            _box('ceiling lamp', (x, y, 4.58), (1.6, .5, .05), lm, 0)
    if sh.get('window'):   # a sunlit window on the back wall: the world outside is a soft bright sky
        sky = _mat('shell window', tuple(sh.get('sky', [.7, .85, 1.0])), .2, None, 1, 1.8)
        frame = _mat('shell window frame', (.95, .95, .95), .5)
        wx = float(sh.get('window_x', 3.2))
        _box('window glass', (wx, 8.86, 2.5), (2.4, .04, 1.7), sky, 0)
        for dx in (-1.25, 0, 1.25): _box('window frame v', (wx + dx, 8.84, 2.5), (.08, .08, 1.8), frame, .01)
        for dz in (1.65, 3.35): _box('window frame h', (wx, 8.84, dz), (2.5, .08, .08), frame, .01)
    bpy.ops.object.light_add(type='AREA', location=(0, 4, 4.3))
    a = bpy.context.active_object; a.data.energy = 0.45 * float(sh.get('energy', 900)); a.data.size = 7.0; a.data.color = lc; a.rotation_euler = (0, 0, 0)
