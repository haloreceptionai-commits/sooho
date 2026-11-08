// Appended to the prepared main.js. The capture reads the first <canvas>, so this 2D canvas is
// prepended: each frame copies the finished WebGL image (same task, before the buffer clears) and
// burns in the approved captions: bold white words, yellow key word, black outline, lower-middle safe area.
{
  const gl = document.querySelector('canvas');
  const out = document.createElement('canvas'); out.width = gl.width; out.height = gl.height;
  document.body.prepend(out);
  const g = out.getContext('2d');
  const base = window.renderFrame;
  window.renderFrame = (f) => {
    const ok = base(f);
    g.drawImage(gl, 0, 0, out.width, out.height);
    const words = captionAt(f);
    if (words && words.length) {
      const W = out.width, size = Math.round(W * .085), y = Math.round(out.height * .7);
      g.font = `900 ${size}px "DejaVu Sans", Arial, sans-serif`; g.textBaseline = 'middle'; g.lineJoin = 'round';
      const shown = words.filter(w => w.shown);
      const widths = shown.map(w => g.measureText(w.text.toUpperCase()).width), gap = size * .42;
      const total = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, shown.length - 1);
      const scale = Math.min(1, W * .9 / Math.max(1, total));
      g.save(); g.translate(W / 2, y); g.scale(scale, scale);
      let x = -total / 2;
      shown.forEach((w, i) => {
        const text = w.text.toUpperCase(), pop = w.live ? 1.08 : 1;
        g.save(); g.translate(x + widths[i] / 2, 0); g.scale(pop, pop);
        g.lineWidth = size * .2; g.strokeStyle = '#000000'; g.strokeText(text, -widths[i] / 2, 0);
        g.fillStyle = w.key ? '#ffd400' : '#ffffff'; g.fillText(text, -widths[i] / 2, 0);
        g.restore(); x += widths[i] + gap;
      });
      g.restore();
    }
    return ok;
  };
}
