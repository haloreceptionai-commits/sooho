"""Screen overlays of the benchmark's editing language: speed lines, white flash, warm light leak, RGB glitch, film grain.
Speed lines are thin emissive streaks parented to the camera (they survive any camera move); the rest are compositor nodes."""
import math, random
import bpy
from mathutils import Vector

NAMES = {'speed_lines', 'flash', 'light_leak', 'glitch', 'grain'}


def _speed_image(w, h, seed):
    """Radial white streaks that stay in the outer ring of the frame (a chase, a dash, a fall), drawn into an RGBA image."""
    import numpy as np
    rng = random.Random(seed); px = np.zeros((h, w, 4), dtype=np.float32); cx, cy = w / 2, h / 2; rmax = math.hypot(cx, cy)
    for k in range(34):
        a = k * math.tau / 34 + rng.uniform(-.05, .05); r0 = rng.uniform(.52, .68) * rmax; r1 = r0 + rng.uniform(.18, .34) * rmax; half = rng.uniform(1.0, 2.6)
        for r in np.arange(r0, min(r1, rmax * 1.02), 1.0):
            taper = 1.0 - (r - r0) / max(1.0, (r1 - r0)) * .4
            x = cx + math.cos(a) * r; y = cy + math.sin(a) * r
            for off in np.arange(-half, half + .5, 1.0):
                xx = int(round(x - math.sin(a) * off)); yy = int(round(y + math.cos(a) * off))
                if 0 <= xx < w and 0 <= yy < h: px[yy, xx, :] = (1, 1, 1, .85 * taper)
    return px


def add_overlays(nt, img, shot, fps):
    """Compositor overlays; returns the final image socket."""
    names = [x for x in shot.get('overlay', []) if x in NAMES]; n = round(shot['duration'] * fps)
    if 'speed_lines' in names:
        w, h = shot.get('size', [432, 768])
        im = bpy.data.images.new('speed lines', w, h, alpha=True); im.pixels.foreach_set(_speed_image(w, h, shot.get('duration', 1)).ravel().tolist()); im.pack()
        node = nt.nodes.new('CompositorNodeImage'); node.image = im
        ao = nt.nodes.new('CompositorNodeAlphaOver')
        nt.links.new(img, ao.inputs[1]); nt.links.new(node.outputs['Image'], ao.inputs[2]); img = ao.outputs['Image']
        for f in range(n):   # streaks pulse every other frame so they read as motion
            ao.inputs[0].default_value = 1.0 if (f // 2) % 2 == 0 else 0.55; ao.inputs[0].keyframe_insert('default_value', frame=f + 1)
    if 'glitch' in names:
        ld = nt.nodes.new('CompositorNodeLensdist'); ld.use_jitter = False
        nt.links.new(img, ld.inputs['Image']); img = ld.outputs['Image']
        for f in range(n):
            t = f / fps; burst = (t < .25) or (abs(t - shot['duration'] * .55) < .12)
            ld.inputs['Dispersion'].default_value = .09 if burst else 0.0; ld.inputs['Dispersion'].keyframe_insert('default_value', frame=f + 1)
    if 'light_leak' in names:
        mix = nt.nodes.new('CompositorNodeMixRGB'); mix.blend_type = 'ADD'; mix.inputs[2].default_value = (1.0, .45, .12, 1)
        mask = nt.nodes.new('CompositorNodeEllipseMask'); mask.x = .05; mask.y = .85; mask.width = .8; mask.height = .8
        blur = nt.nodes.new('CompositorNodeBlur'); blur.filter_type = 'FAST_GAUSS'; blur.use_relative = True; blur.factor_x = .4; blur.factor_y = .4
        mul = nt.nodes.new('CompositorNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = .7
        nt.links.new(mask.outputs[0], blur.inputs[0]); nt.links.new(blur.outputs[0], mul.inputs[0]); nt.links.new(mul.outputs[0], mix.inputs[0])
        nt.links.new(img, mix.inputs[1]); img = mix.outputs[0]
    if 'flash' in names:   # white flash that burns out in the first 6 frames (a cut, a bang, a reveal)
        mix = nt.nodes.new('CompositorNodeMixRGB'); mix.blend_type = 'MIX'; mix.inputs[2].default_value = (1, 1, 1, 1)
        nt.links.new(img, mix.inputs[1]); img = mix.outputs[0]
        for f in range(n):
            mix.inputs[0].default_value = max(0.0, .85 - f * .17) if f < 6 else 0.0; mix.inputs[0].keyframe_insert('default_value', frame=f + 1)
    if 'grain' in names:
        tex = bpy.data.textures.new('film grain', 'NOISE')
        tn = nt.nodes.new('CompositorNodeTexture'); tn.texture = tex
        mix = nt.nodes.new('CompositorNodeMixRGB'); mix.blend_type = 'OVERLAY'; mix.inputs[0].default_value = .12
        nt.links.new(tn.outputs[1], mix.inputs[2]); nt.links.new(img, mix.inputs[1]); img = mix.outputs[0]
    return img
