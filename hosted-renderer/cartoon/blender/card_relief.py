"""Painted cards with real volume.

A painted object card used to be a flat plane that turned to face the camera, so it read as a picture pasted on the scene: no shading from the sun,
no shadow, no thickness. Here the card's own silhouette becomes a rounded, pillow-thick 3D shape (front and back sealed at the edge), with the painting
projected onto both sides. The sun now shades it, it casts a real shadow on the ground and it keeps its volume while the camera moves.
Pure numpy + bpy, no downloads. Any failure makes the caller fall back to the flat plane, so a card can never stop a render.
"""
import math

import numpy as np

try:
    import bpy
except ImportError:   # the shape maths below is testable without Blender
    bpy = None


def _box_blur(a, r):
    """Separable box blur with edge clamping (numpy only)."""
    if r < 1:
        return a
    out = a
    for axis in (0, 1):
        pad = [(0, 0), (0, 0)]
        pad[axis] = (r + 1, r)
        c = np.cumsum(np.pad(out, pad, mode='edge'), axis=axis)
        n = out.shape[axis]
        hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
        lo = np.take(c, np.arange(0, n), axis=axis)
        out = (hi - lo) / (2 * r + 1)
    return out


def alpha_grid(pixels, w, h, columns=96):
    """Block-averaged colour and alpha on a coarse grid; rows run bottom to top like Blender's pixels."""
    px = np.asarray(pixels, dtype=np.float32).reshape(h, w, 4)
    f = max(1, w // columns)
    hh, ww = (h // f) * f, (w // f) * f
    blocks = px[:hh, :ww].reshape(hh // f, f, ww // f, f, 4).mean(axis=(1, 3))
    return blocks[..., 3]


def height_field(alpha, depth):
    """Half thickness at every grid point: zero at the silhouette, rounded like a pillow toward the middle."""
    mask = (alpha > .5).astype(np.float32)
    r = max(2, int(round(min(alpha.shape) * .09)))
    soft = _box_blur(_box_blur(_box_blur(mask, r), r), r)
    t = np.clip((soft - .5) / .5, 0, 1) * mask
    return depth * np.sqrt(np.clip(1 - (1 - t) ** 2, 0, 1)), mask


def trim_to_figure(pixels, w, h, pad=2):
    """The painted figure without its transparent margin (the model leaves empty space around it): returns (flat pixel list, w, h).
    Without this the object floats above the ground and is smaller than its planned size."""
    px = np.asarray(pixels, dtype=np.float32).reshape(h, w, 4)
    ys, xs = np.nonzero(px[..., 3] > .08)
    if len(xs) < 50:
        return px.ravel(), w, h
    y0, y1, x0, x1 = max(0, ys.min() - pad), min(h, ys.max() + 1 + pad), max(0, xs.min() - pad), min(w, xs.max() + 1 + pad)
    crop = np.ascontiguousarray(px[y0:y1, x0:x1])
    return crop.ravel(), x1 - x0, y1 - y0


def make_image(name, flat, w, h):
    img = bpy.data.images.new(name, w, h, alpha=True)
    img.pixels.foreach_set(np.asarray(flat, dtype=np.float32))
    img.pack()
    return img


def build_relief(pixels, w, h, width, height, columns=96, thickness=.2):
    """A mesh object for a card of the given world size (feet on z=0, front facing -Y). Returns the object (no material)."""
    alpha = alpha_grid(pixels, w, h, columns)
    ny, nx = alpha.shape
    depth = min(thickness * width, .42 * height)
    hf, mask = height_field(alpha, depth)
    # cover the silhouette by one more cell, the painting's own alpha trims the exact edge
    grow = _box_blur(mask, 1) > .01
    xs = (np.arange(nx) + .5) / nx
    ys = (np.arange(ny) + .5) / ny
    X, Z = np.meshgrid((xs - .5) * width, ys * height)
    idx = np.arange(nx * ny).reshape(ny, nx)
    keep = grow[:-1, :-1] & grow[1:, :-1] & grow[:-1, 1:] & grow[1:, 1:]
    quads = np.stack([idx[:-1, :-1][keep], idx[:-1, 1:][keep], idx[1:, 1:][keep], idx[1:, :-1][keep]], axis=1)
    if not len(quads):
        raise ValueError('card has no visible shape')
    front = np.stack([X.ravel(), -hf.ravel(), Z.ravel()], axis=1)
    back = np.stack([X.ravel(), hf.ravel(), Z.ravel()], axis=1)
    n = nx * ny
    verts = np.concatenate([front, back]).tolist()
    faces = quads.tolist() + [[q[0] + n, q[3] + n, q[2] + n, q[1] + n] for q in quads.tolist()]
    me = bpy.data.meshes.new('card relief')
    me.from_pydata(verts, [], faces)
    me.update()
    uv = me.uv_layers.new(name='UVMap')
    u = np.concatenate([(X.ravel() / width) + .5] * 2)
    v = np.concatenate([Z.ravel() / height] * 2)
    for loop in me.loops:
        uv.data[loop.index].uv = (float(u[loop.vertex_index]), float(v[loop.vertex_index]))
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)   # front and back meet at the silhouette: a sealed shape
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new('card relief', me)
    bpy.context.collection.objects.link(ob)
    return ob
