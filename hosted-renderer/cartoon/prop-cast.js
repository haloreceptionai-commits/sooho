// Appended in the same lexical module as the pinned Pen, FACE table and cast helpers.
// Arm poses per action; [left, right]. Every pose already exists in the supplied character kit.
const ACTION_ARMS = {
  idle: ['hang', 'hang'], walk: ['hang', 'hang'], run: ['hang', 'hang'], point: ['hang', 'point'], react: ['hang', 'cheek'],
  wave: ['hang', 'wave'], shrug: ['hip', 'hip'], cheer: ['up', 'up'], think: ['hang', 'temple'], cross_arms: ['cross', 'cross'],
  grab: ['hang', 'reach'], worried: ['cheek', 'cheek'], thumbs_up: ['hang', 'thumb'], shout: ['up', 'point'], look_back: ['hang', 'hang'],
  cower: ['cheek', 'cheek'], carry: ['lift', 'lift'], hold: ['hang', 'reach'], lift: ['hang', 'lift'], pour: ['hang', 'reach'],
};
// Speech mouth shapes from the kit, registered as face variants so eyes and brows keep the emotion.
const VISEMES = ['dash', 'o', 'O', 'grin'];
function talkFace(expr, viseme) {
  const name = `${expr}__${viseme}`;
  if (!FACE[name]) FACE[name] = { ...FACE[expr], mouth: viseme };
  return name;
}
export function visemeAt(word, t) {
  // Letter-driven mouth: vowels open, m/b/p close, e/i spread; deterministic per frame.
  const letters = word.replace(/[^a-z]/g, '') || 'a';
  const ch = letters[Math.min(letters.length - 1, Math.floor(t * letters.length))];
  if ('mbp'.includes(ch)) return 'dash';
  if ('ou'.includes(ch)) return 'o';
  if ('a'.includes(ch)) return 'O';
  if ('ei'.includes(ch)) return 'grin';
  return t * letters.length % 1 < .5 ? 'o' : 'dash';
}
export function propCharacter(p, outfit, opts) {
  const [L, R] = ACTION_ARMS[opts.action] || ACTION_ARMS.idle;
  const held = opts.held || (opts.action === 'lift' || opts.action === 'pour' ? 'pot' : null);
  const expr = opts.viseme ? talkFace(opts.expr, opts.viseme) : opts.expr;
  const shout = opts.action === 'shout' && !opts.viseme ? talkFace(opts.expr, 'O') : expr;
  const clean = { ...opts, expr: shout, L, R: held && R === 'hang' ? 'reach' : R, wv: (opts.frame || 0) * .35 };
  if (held) clean.tilt = 0;
  romanFront(p, outfit, clean);
  if (!held) return;
  const pose = clean.R === 'lift' ? 'lift' : 'reach';
  const H = headBlob(opts.seed, 118, opts.facing || 0), HH = 2 * H.b, W = 2 * H.a, u = W / 100;
  const torsoBot = 975 - 1.38 * HH - (opts.bob || 0) * HH;
  const chin = torsoBot - 1.08 * HH;
  const ta = (.4 * W) / 1.06;
  const shoulderY = chin + .12 * HH;
  const lift = (opts.lift || 0) * .15;
  const handX = 300 + ta * 1.1 + (pose === 'lift' ? 4 : 35) * u;
  const handY = shoulderY - (pose === 'lift' ? .82 : .1 + lift) * HH;
  const g = p.g; g.save(); g.translate(handX, handY);
  const angle = opts.action === 'pour' ? (opts.progress || 0) * 1.2 : 0;
  g.rotate(angle);
  // The wrist and object share one anchor, never independent world guesses.
  drawHeld(p, held, 0, 10, opts.frame);
  g.restore();
  if (opts.action === 'pour' && opts.progress > .25) {
    const x = handX + Math.sin(angle) * 46 + Math.cos(angle) * 25;
    const y = handY - Math.cos(angle) * 46 + Math.sin(angle) * 25;
    g.save(); g.strokeStyle = '#e7c04e'; g.lineWidth = 6; g.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const offset = ((opts.frame || 0) * 6 + i * 20) % 80;
      g.beginPath(); g.moveTo(x, y + offset); g.lineTo(x + Math.sin(i) * 3, y + offset + 15); g.stroke();
    }
    g.restore();
  }
}
