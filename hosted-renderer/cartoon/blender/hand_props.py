"""Things a character holds: a pan and spatula, a knife, a phone, a book, a pen, a shovel, a broom, a camera, a fishing rod, a guitar...
Built from simple shapes in the colours of the toy-like benchmark world, parented to the wrist so they follow every motion.
Local axes of a wrist anchor: +z is up, -y is forward (the way the character faces), +x is the character's right.
"""
import math
import bpy
from set_detail import material, cube, rope
from mathutils import Vector

METAL = (.55, .57, .62); DARK = (.07, .07, .09); WOOD = (.55, .36, .18); WHITE = (.96, .96, .94); RED = (.85, .18, .15); GREEN = (.2, .62, .3)
TAN = (.84, .62, .32); CHOC = (.28, .15, .08); BLUE = (.2, .45, .9); YELLOW = (.98, .8, .2)


def sphere(name, pos, size, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, location=pos)
    o = bpy.context.active_object; o.name = name; o.scale = size; o.data.materials.append(mat)
    for p in o.data.polygons: p.use_smooth = True
    return o


def disc(name, pos, radius, depth, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=28, radius=radius, depth=depth, location=pos, rotation=rot)
    o = bpy.context.active_object; o.name = name; o.data.materials.append(mat); return o


def box(name, pos, size, mat, rot=(0, 0, 0), bevel=.006):
    o = cube(name, pos, size, mat, bevel); o.rotation_euler = rot; return o


def _m(name, c, rough=.6, metal=0): return material('hold ' + name, c, rough, metal)


def build(name, anchor, other=None):
    """Create the prop `name` on the wrist anchor (`other` is the other hand's anchor, used by two-handed props). Returns the created objects."""
    made = []

    def add(o):
        o.parent = anchor; made.append(o); return o
    metal = _m('metal', METAL, .35, .8); dark = _m('dark', DARK, .5); wood = _m('wood', WOOD, .7); white = _m('white', WHITE, .5)
    if name == 'pan':        # held out in front over the stove: a handle toward the hand and a shallow dark pan
        add(box('pan handle', (0, -.1, .02), (.03, .22, .025), dark)); add(disc('pan', (0, -.31, .02), .15, .045, dark)); add(disc('pan food', (0, -.31, .045), .125, .01, _m('pan food', TAN, .8)))
    elif name == 'spatula':
        add(rope('spatula handle', (0, 0, .02), (0, -.1, -.14), .012, wood)); add(box('spatula head', (0, -.13, -.19), (.085, .015, .07), metal, (.5, 0, 0)))
    elif name == 'knife':
        add(box('knife handle', (0, 0, .045), (.028, .026, .1), wood)); add(box('knife blade', (0, -.005, -.09), (.012, .05, .17), metal))
    elif name == 'food':     # a big cookie with chocolate chips
        add(disc('cookie', (0, -.02, .09), .075, .022, _m('cookie', TAN, .9), (math.pi / 2, 0, 0)))
        for k, (x, z) in enumerate(((-.03, .07), (.025, .11), (.0, .085), (.04, .07), (-.025, .115))): add(sphere('chip', (x, -.04, z), (.012, .008, .012), _m('chip', CHOC, .9)))
    elif name == 'cup':
        add(disc('mug', (0, 0, .06), .046, .11, white)); add(rope('mug handle', (.045, 0, .09), (.075, 0, .06), .008, white)); add(rope('mug handle', (.075, 0, .06), (.045, 0, .03), .008, white))
    elif name == 'pen':
        add(rope('pen', (0, 0, .03), (0, -.07, -.06), .009, _m('pen', BLUE, .4)))
    elif name == 'paper':
        add(box('paper', (0, -.1, .0), (.2, .28, .006), white, (0, 0, 0), .001))
    elif name == 'book':
        add(box('book cover', (-.1, -.02, .04), (.27, .05, .21), _m('book', RED, .6), (0, 0, 0), .008)); add(box('book pages', (-.1, -.02, .04), (.245, .04, .195), white, (0, 0, 0), .002))
    elif name == 'phone':
        add(box('phone', (0, -.02, .07), (.06, .012, .12), dark, (0, 0, 0), .005)); add(box('phone screen', (0, -.027, .07), (.05, .004, .105), _m('screen', (.35, .6, .95), .2), (0, 0, 0), .001))
    elif name == 'camera':
        add(box('camera body', (-.12, -.06, .05), (.2, .09, .11), dark)); add(disc('lens', (-.12, -.13, .05), .04, .06, metal, (math.pi / 2, 0, 0))); add(box('flash', (-.06, -.06, .115), (.045, .03, .02), white))
    elif name == 'magnifier':
        add(rope('magnifier handle', (0, 0, 0), (0, -.05, .14), .012, wood)); add(disc('glass', (0, -.07, .24), .11, .012, _m('glass', (.7, .88, 1), .1), (math.pi / 2, 0, 0)))
        add(disc('rim', (0, -.07, .24), .125, .02, metal, (math.pi / 2, 0, 0))); add(disc('rim hole', (0, -.062, .24), .105, .022, _m('glass', (.7, .88, 1), .1), (math.pi / 2, 0, 0)))
    elif name == 'cash':
        for k in range(4): add(box('banknote', (-.04 + .03 * k, -.04 - .004 * k, .06), (.16, .07, .004), _m('cash', GREEN, .6), (.3 * k - .4, 0, .25 * k - .3), .001))
    elif name == 'hammer':
        add(box('hammer handle', (0, 0, .11), (.03, .03, .3), wood)); add(box('hammer head', (0, 0, .29), (.17, .07, .07), metal))
    elif name == 'shovel':   # two hands: the shaft stands between them, the blade on the ground
        add(rope('shovel shaft', (0, 0, -.55), (0, 0, .5), .018, wood)); add(box('shovel blade', (0, -.01, -.7), (.22, .02, .26), metal)); add(box('shovel grip', (0, 0, .52), (.12, .03, .03), wood))
    elif name == 'broom':
        add(rope('broom shaft', (0, 0, -.62), (0, 0, .5), .016, wood)); add(box('bristles', (0, -.015, -.74), (.3, .1, .2), _m('straw', YELLOW, .9), (0, 0, 0), .02))
    elif name == 'brush':
        add(rope('brush', (0, 0, -.02), (0, -.05, .2), .01, wood)); add(sphere('paint', (0, -.055, .22), (.022, .022, .03), _m('paint', RED, .5)))
    elif name == 'rod':
        add(rope('rod', (0, 0, -.04), (0, -.75, .55), .013, _m('rod', DARK, .4))); add(rope('line', (0, -.75, .55), (0, -.8, -.2), .003, white)); add(disc('reel', (0, -.1, .02), .035, .04, metal, (0, math.pi / 2, 0)))
    elif name == 'ball':
        add(sphere('ball', (0, 0, .09), (.095, .095, .095), _m('ball', (.95, .45, .1), .5)))
    elif name == 'guitar':
        add(sphere('guitar body', (.02, -.06, -.12), (.2, .055, .24), _m('guitar', (.8, .42, .16), .4))); add(disc('guitar hole', (.02, -.115, -.1), .05, .01, dark, (math.pi / 2, 0, 0)))
        add(rope('guitar neck', (.0, -.08, .0), (-.38, -.22, .28), .022, wood))
    elif name == 'crate':
        add(box('crate', (-.18, 0, -.04), (.36, .25, .24), wood))
    return made
