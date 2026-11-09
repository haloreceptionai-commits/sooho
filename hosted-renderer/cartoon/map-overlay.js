// Appended after the caption overlay. On map shots it burns in the documentary title badge
// (white on black, top-left), the years badge under it, and city labels projected from the map.
{
  const base = window.renderFrame;
  window.renderFrame = (f) => {
    const ok = base(f);
    const m = mapAt(f);
    if (!m) return ok;
    const out = document.querySelector('canvas'), g = out.getContext('2d'), W = out.width, H = out.height, u = Math.min(W, H) / 1080;
    const appear = Math.min(1, m.progress * 8);
    g.save(); g.globalAlpha = appear; g.textBaseline = 'middle';
    const box = (text, x, y, size) => {
      g.font = `900 ${size}px "DejaVu Sans", Arial, sans-serif`;
      const w = g.measureText(text).width, pad = size * .28;
      g.fillStyle = '#000000'; g.fillRect(x, y, w + pad * 2, size * 1.25);
      g.fillStyle = '#ffffff'; g.fillText(text, x + pad, y + size * .66);
      return y + size * 1.25;
    };
    let y = 40 * u;
    if (m.label) y = box(m.label.toUpperCase(), 40 * u, y, Math.round(78 * u)) + 10 * u;
    if (m.years) box(m.years, 40 * u, y, Math.round(36 * u));
    // City labels at their projected map positions.
    const v = new THREE.Vector3();
    for (const c of m.cities || []) {
      const lat = c.at[1], lon = c.at[0];
      v.set(lon * .5, 0.4, -lat * .5).project(camera);
      if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue;
      const x = (v.x * .5 + .5) * W, yy = (-v.y * .5 + .5) * H - 46 * u, size = Math.round(30 * u);
      g.font = `800 ${size}px "DejaVu Sans", Arial, sans-serif`; g.textAlign = 'center'; g.lineJoin = 'round';
      g.lineWidth = size * .22; g.strokeStyle = '#000000'; g.strokeText(c.name, x, yy);
      g.fillStyle = '#ffffff'; g.fillText(c.name, x, yy); g.textAlign = 'left';
    }
    g.restore();
    return ok;
  };
}
