// Appended in the same lexical module as the pinned Pen (poly/ell/stroke/arc) and INK helpers.
// Every prop is drawn on the 600 x 1000 card, standing on the card base (y = 975), centred on x = 300.
// Pure function of (kind, frame): identical output on every render replica.
const OL = 5;
const rect = (p, x, y, w, h, fill, ol = OL) => p.poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], fill, ol);
const tri = (p, a, b, c, fill, ol = OL) => p.poly([a, b, c], fill, ol);
const star = (p, cx, cy, r, fill) => { const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); } p.poly(pts, fill, 4); };
function hull(p, y, w, fill, dark) {
  p.poly([[300 - w, y], [300 + w, y], [300 + w * .78, y + 120], [300 - w * .72, y + 120]], fill, OL);
  p.stroke([[300 - w * .9, y + 40], [300 + w * .92, y + 40]], 4, dark);
  for (let i = -2; i <= 2; i++) p.ell(300 + i * w * .3, y + 75, 9, 9, '#2b2230', 3);
}
function ship(p, f, pirate) {
  const sway = Math.sin(f * .06) * 4;
  hull(p, 760 + sway, 230, pirate ? '#4a3328' : '#9a6b3f', '#2b1d18');
  p.stroke([[300, 760 + sway], [300, 330]], 10, '#5a3d28');
  p.stroke([[190, 760 + sway], [190, 470]], 8, '#5a3d28');
  const sail = pirate ? '#3a3540' : '#f4efe2';
  p.poly([[300, 350], [440, 380 + Math.sin(f * .08) * 6], [430, 640], [300, 660]], sail, OL);
  p.poly([[190, 490], [270, 505], [265, 690], [190, 700]], sail, OL);
  if (pirate) { p.ell(368, 500, 34, 30, '#f2efe6', 4); p.ell(356, 495, 7, 8, INK, 0); p.ell(380, 495, 7, 8, INK, 0); p.stroke([[340, 545], [396, 575]], 6, '#f2efe6'); p.stroke([[396, 545], [340, 575]], 6, '#f2efe6'); }
  p.poly([[300, 330], [360, 345 + Math.sin(f * .2) * 5], [300, 362]], pirate ? '#1d1a20' : '#d8443a', 4);
}
const PROPS = {
  phone: p => { rect(p, 210, 590, 180, 370, '#3a3540'); rect(p, 228, 625, 144, 270, '#77c7c8', 3); p.ell(300, 928, 12, 12, '#f4efe2', 3); },
  pan: p => { p.ell(300, 860, 155, 80, '#5c5a57', OL); p.stroke([[430, 850], [560, 760]], 22, '#3a3540'); p.ell(300, 850, 130, 60, '#3a3540', 3); },
  magnifier: p => { p.ell(300, 690, 110, 110, '#dff2f2', 12); p.stroke([[300, 800], [300, 960]], 26, '#5a3d28'); },
  pickaxe: p => { p.stroke([[300, 600], [300, 960]], 20, '#a8784a'); p.poly([[100, 670], [270, 580], [330, 580], [500, 670], [340, 635], [260, 635]], '#8a8f96', OL); },
  gold_piece: p => p.poly([[170, 950], [210, 820], [310, 780], [430, 860], [450, 950]], '#f2c14e', OL),
  pirate_ship: (p, f) => ship(p, f, true),
  merchant_ship: (p, f) => ship(p, f, false),
  rowboat: (p, f) => { hull(p, 880, 170, '#a8784a', '#4a3020'); p.stroke([[150, 860], [80, 960]], 7, '#7a5434'); p.stroke([[450, 860], [520, 960]], 7, '#7a5434'); },
  barrel: p => { p.ell(300, 700, 120, 34, '#a8784a', OL); p.poly([[180, 700], [420, 700], [405, 960], [195, 960]], '#a8784a', OL); for (const y of [760, 900]) p.stroke([[186, y], [414, y]], 9, '#5c5a57'); p.ell(300, 700, 120, 34, '#c9925a', OL); },
  oil_jar: p => { p.poly([[230, 640], [370, 640], [420, 760], [390, 960], [210, 960], [180, 760]], '#d39b55', OL); rect(p, 255, 600, 90, 45, '#b07a3c'); p.stroke([[200, 780], [400, 780]], 4, '#9a6b3f'); },
  pot: p => { p.poly([[200, 760], [400, 760], [380, 960], [220, 960]], '#dfab57', OL); p.ell(300, 760, 105, 26, '#54433a', OL); },
  lantern: (p, f) => { rect(p, 240, 720, 120, 200, '#ffe48a'); p.ell(300, 820, 34 + Math.sin(f * .5) * 4, 50, '#ffb340', 0); rect(p, 225, 690, 150, 30, '#3a3540'); rect(p, 225, 920, 150, 30, '#3a3540'); p.arc(300, 690, 40, 40, 180, 360, 6); },
  map: p => { p.poly([[150, 700], [450, 680], [460, 950], [140, 960]], '#f1dfb0', OL); p.stroke([[190, 760], [260, 820], [330, 790], [400, 870]], 4, '#a8784a'); p.stroke([[380, 850], [420, 890]], 7, '#d8443a'); p.stroke([[420, 850], [380, 890]], 7, '#d8443a'); },
  coins: (p, f) => { for (let i = 0; i < 7; i++) { const x = 200 + (i % 4) * 60 + (i > 3 ? 30 : 0), y = 920 - (i > 3 ? 40 : 0); p.ell(x, y, 34, 14, '#f2c14e', 4); } p.ell(300, 860 - Math.abs(Math.sin(f * .2)) * 40, 26, 26, '#ffd85a', 4); },
  chest: p => { rect(p, 160, 760, 280, 200, '#9a6b3f'); p.poly([[160, 760], [440, 760], [420, 680], [180, 680]], '#b07a3c', OL); rect(p, 285, 760, 30, 60, '#f2c14e', 4); for (let i = 0; i < 4; i++) p.ell(210 + i * 60, 685, 22, 12, '#ffd85a', 3); },
  sword: p => { p.poly([[290, 420], [310, 420], [312, 820], [288, 820]], '#e7edf2', OL); rect(p, 230, 820, 140, 24, '#b08a4a'); rect(p, 288, 844, 24, 100, '#5a3d28'); p.ell(300, 955, 18, 18, '#f2c14e', 4); },
  cannon: (p, f) => { p.poly([[150, 760], [470, 700], [480, 780], [160, 840]], '#3a3540', OL); p.ell(480, 740, 26, 42, '#241726', 4); p.ell(220, 900, 70, 70, '#7a5434', OL); p.ell(220, 900, 18, 18, '#3a3540', 3); },
  anchor: p => { p.stroke([[300, 560], [300, 930]], 22, '#5c5a57'); p.arc(300, 840, 150, 110, 20, 160, 22, '#5c5a57'); p.ell(300, 540, 34, 34, null, 14); p.stroke([[220, 640], [380, 640]], 18, '#5c5a57'); },
  wave: (p, f) => { const k = Math.sin(f * .08) * 15; p.poly([[20, 980], [40, 700 + k], [160, 470 + k], [330, 380 + k], [470, 460 + k], [420, 520 + k], [340, 500 + k], [400, 650], [580, 980]], '#5fb2d6', OL); p.stroke([[180, 520 + k], [320, 430 + k], [440, 470 + k]], 14, '#effaff'); },
  rock: p => p.poly([[90, 970], [140, 760], [260, 640], [400, 690], [500, 820], [520, 970]], '#8a8f96', OL),
  tower: p => { p.poly([[220, 980], [250, 380], [350, 380], [380, 980]], '#cfc6b4', OL); for (let y = 330; y < 380; y += 1) { } rect(p, 230, 330, 140, 50, '#bdb3a0'); for (let i = 0; i < 4; i++) rect(p, 232 + i * 38, 300, 24, 30, '#bdb3a0', 4); rect(p, 280, 520, 40, 70, '#3a3540', 4); rect(p, 275, 860, 50, 120, '#5a3a24', 4); },
  lighthouse: (p, f) => { p.poly([[230, 980], [255, 420], [345, 420], [370, 980]], '#f4efe2', OL); for (const y of [560, 720, 880]) p.poly([[245, y], [355, y], [358, y + 60], [242, y + 60]], '#d8443a', 3); rect(p, 250, 340, 100, 80, '#ffe48a'); tri(p, [240, 340], [360, 340], [300, 280], '#d8443a'); const a = f * .08; p.poly([[300, 380], [300 + Math.cos(a) * 300, 380 + Math.sin(a) * 60 - 40], [300 + Math.cos(a) * 300, 380 + Math.sin(a) * 60 + 40]], 'rgba(255,240,170,.45)', 0); },
  cart: p => { rect(p, 120, 720, 360, 140, '#a8784a'); for (const x of [190, 410]) { p.ell(x, 900, 64, 64, '#7a5434', OL); p.ell(x, 900, 12, 12, '#3a3540', 3); } p.stroke([[480, 760], [580, 720]], 10, '#7a5434'); },
  books: p => { const c = ['#d8443a', '#3b78c2', '#4f9a52', '#f2b33d']; c.forEach((col, i) => rect(p, 170 + i * 10, 900 - i * 55, 260, 55, col)); },
  scroll: p => { rect(p, 200, 640, 200, 300, '#f1dfb0'); p.ell(300, 640, 115, 22, '#e2c98e', OL); p.ell(300, 940, 115, 22, '#e2c98e', OL); for (let i = 0; i < 5; i++) p.stroke([[230, 700 + i * 45], [370, 700 + i * 45]], 4, '#a8784a'); },
  flask: (p, f) => { rect(p, 270, 600, 60, 140, '#dff2f2'); p.poly([[270, 740], [330, 740], [420, 950], [180, 950]], '#dff2f2', OL); p.poly([[230, 840], [370, 840], [410, 945], [190, 945]], '#77c7c8', 0); for (let i = 0; i < 3; i++) p.ell(300 + Math.sin(f * .3 + i) * 20, 580 - ((f * 4 + i * 40) % 120), 10, 10, '#c8f0f0', 3); },
  crown: p => { p.poly([[160, 940], [160, 760], [230, 840], [300, 720], [370, 840], [440, 760], [440, 940]], '#f2c14e', OL); for (const x of [230, 300, 370]) p.ell(x, 900, 18, 18, '#d8443a', 3); },
  key: p => { p.ell(300, 620, 70, 70, null, 18); p.stroke([[300, 690], [300, 950]], 18, '#d9a93c'); for (const y of [870, 930]) p.stroke([[300, y], [360, y]], 16, '#d9a93c'); },
  letter: p => { rect(p, 150, 720, 300, 200, '#f4efe2'); p.stroke([[150, 720], [300, 830], [450, 720]], 5); p.ell(300, 830, 26, 26, '#d8443a', 4); },
  bell: (p, f) => { const a = Math.sin(f * .25) * .25; p.poly([[300 + Math.sin(a) * -40, 560], [300 + Math.sin(a) * 40, 560], [400, 860], [200, 860]], '#d9a93c', OL); p.ell(300 + Math.sin(a) * 60, 880, 26, 26, '#b08a4a', 4); rect(p, 285, 520, 30, 40, '#5a3d28', 4); },
  clock: (p, f) => { p.ell(300, 760, 170, 170, '#f4efe2', OL); const m = f * .05, h = f * .004; p.stroke([[300, 760], [300 + Math.sin(m) * 130, 760 - Math.cos(m) * 130]], 8); p.stroke([[300, 760], [300 + Math.sin(h) * 80, 760 - Math.cos(h) * 80]], 12); for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; p.ell(300 + Math.sin(a) * 145, 760 - Math.cos(a) * 145, 7, 7, INK, 0); } },
  telescope: p => { p.poly([[140, 820], [460, 640], [480, 690], [170, 870]], '#b08a4a', OL); p.poly([[380, 680], [470, 630], [495, 690], [405, 735]], '#5a3d28', 4); p.stroke([[300, 760], [220, 960]], 9, '#5a3d28'); p.stroke([[300, 760], [380, 960]], 9, '#5a3d28'); },
  compass: (p, f) => { p.ell(300, 800, 150, 150, '#d9a93c', OL); p.ell(300, 800, 120, 120, '#f4efe2', 4); const a = Math.sin(f * .1) * .5; p.poly([[300 + Math.sin(a) * 100, 800 - Math.cos(a) * 100], [300 + Math.cos(a) * 18, 800 + Math.sin(a) * 18], [300 - Math.cos(a) * 18, 800 - Math.sin(a) * 18]], '#d8443a', 3); },
  helm_wheel: (p, f) => { const a = f * .03; p.ell(300, 760, 150, 150, null, 22); for (let i = 0; i < 8; i++) { const t = a + i * Math.PI / 4; p.stroke([[300, 760], [300 + Math.cos(t) * 200, 760 + Math.sin(t) * 200]], 14, '#7a5434'); } p.ell(300, 760, 40, 40, '#b08a4a', OL); },
  oar: p => { p.stroke([[300, 380], [300, 800]], 16, '#a8784a'); p.ell(300, 870, 60, 110, '#a8784a', OL); },
  torch: (p, f) => { p.stroke([[300, 960], [300, 700]], 18, '#7a5434'); const k = Math.sin(f * .7) * 12; p.poly([[255, 700], [345, 700], [330 + k, 560], [300, 480 + k], [270 - k, 570]], '#ffb340', 4); p.poly([[280, 700], [320, 700], [305, 600 + k]], '#fff1a6', 0); },
  flag: (p, f) => { p.stroke([[220, 970], [220, 350]], 12, '#5a3d28'); const w = q => Math.sin(f * .15 + q) * 18; p.poly([[220, 370], [330, 360 + w(0)], [440, 370 + w(1)], [440, 540 + w(1)], [330, 530 + w(0)], [220, 540]], '#d8443a', OL); },
  gull: (p, f) => { const k = Math.sin(f * .3) * 50; p.stroke([[150, 500 - k], [230, 520], [300, 545], [370, 520], [450, 500 - k]], 12, '#f4efe2'); p.stroke([[150, 500 - k], [230, 520], [300, 545], [370, 520], [450, 500 - k]], 4); p.ell(300, 548, 18, 12, '#f4efe2', 3); },
  fish: (p, f) => { const y = 820 + Math.sin(f * .2) * 30; p.ell(300, y, 120, 60, '#f08a2c', OL); tri(p, [410, y], [500, y - 60], [500, y + 60], '#f08a2c'); p.ell(240, y - 10, 10, 10, INK, 0); },
  tree: p => { rect(p, 275, 700, 50, 280, '#6a4a32'); p.ell(300, 580, 170, 160, '#5c8a3c', OL); p.ell(220, 650, 100, 90, '#6c9a42', OL); p.ell(380, 650, 100, 90, '#6c9a42', OL); },
  house: p => { rect(p, 130, 620, 340, 350, '#efe2c8'); tri(p, [100, 630], [500, 630], [300, 430], '#c0533a'); rect(p, 260, 820, 80, 150, '#5a3a24', 4); rect(p, 170, 700, 70, 70, '#ffe9a6', 4); rect(p, 360, 700, 70, 70, '#ffe9a6', 4); },
  storm_cloud: (p, f) => { const d = Math.sin(f * .04) * 10; for (const [x, y, r] of [[200, 520, 110], [320, 470, 140], [440, 530, 100], [300, 580, 130]]) p.ell(x + d, y, r, r * .7, '#6d7080', OL); if (f % 47 < 3) p.poly([[300, 620], [260, 760], [310, 750], [270, 900], [360, 720], [310, 730], [340, 620]], '#fff3a0', 4); },
  sun: (p, f) => { for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 + f * .01; p.stroke([[300 + Math.cos(a) * 150, 600 + Math.sin(a) * 150], [300 + Math.cos(a) * 210, 600 + Math.sin(a) * 210]], 12, '#ffd85a'); } p.ell(300, 600, 120, 120, '#ffd85a', OL); },
  moon: p => { p.ell(300, 600, 140, 140, '#f6f0d2', OL); p.ell(250, 560, 24, 24, '#e2d9b4', 0); p.ell(340, 650, 32, 32, '#e2d9b4', 0); },
  bread: p => { p.ell(300, 900, 170, 70, '#d9a05b', OL); for (const x of [230, 300, 370]) p.stroke([[x - 20, 870], [x + 20, 920]], 5, '#a8703a'); },
  bottle: p => { rect(p, 275, 600, 50, 120, '#4f9a52'); p.poly([[255, 720], [345, 720], [360, 960], [240, 960]], '#4f9a52', OL); rect(p, 265, 800, 70, 80, '#f1dfb0', 3); },
  skull_sign: p => { p.stroke([[300, 970], [300, 760]], 14, '#7a5434'); rect(p, 170, 560, 260, 200, '#e9dcc0'); p.ell(300, 640, 50, 46, '#f4efe2', 4); p.ell(282, 636, 10, 12, INK, 0); p.ell(318, 636, 10, 12, INK, 0); },
};
export function drawProp(p, kind, frame) {
  const draw = PROPS[kind];
  if (!draw) throw Error('Prop has no drawing: ' + kind);
  draw(p, frame || 0);
}
// Small held versions are drawn inside the character card at the hand anchor.
export function drawHeld(p, kind, x, y, frame) {
  const g = p.g; g.save(); g.translate(x, y); g.scale(.28, .28); g.translate(-300, -900); drawProp(p, kind, frame); g.restore();
}
// Effects on the same 600 x 1000 card.
export const FX_ART = {
  rain: (p, f) => { for (let i = 0; i < 160; i++) { const x = (i * 97 + (i % 7) * 13) % 640 - 20, sp = 30 + (i % 5) * 6, y = ((i * 173 + f * sp) % 1150) - 80, l = 22 + (i % 4) * 9; p.stroke([[x, y], [x - 5, y + l]], i % 3 ? .7 : 1.1, i % 3 ? 'rgba(200,220,255,.45)' : 'rgba(235,245,255,.7)'); } },
  smoke: (p, f) => { for (let i = 0; i < 6; i++) { const t = ((f * .012 + i / 6) % 1), r = 50 + 90 * t; p.ell(300 + Math.sin(i * 2 + t * 3) * 60, 950 - t * 800, r, r * .8, `rgba(170,170,175,${(.75 * (1 - t)).toFixed(3)})`, 0); } },
  fire: (p, f) => { for (let i = 0; i < 5; i++) { const k = Math.sin(f * .6 + i) * 20; p.poly([[180 + i * 60, 970], [240 + i * 60, 970], [220 + i * 60 + k, 760 - (i % 2) * 120]], i % 2 ? '#ffb340' : '#f0662c', 3); } },
  sparkle: (p, f) => { for (let i = 0; i < 9; i++) { const t = ((f * .03 + i * .13) % 1); star(p, 80 + (i * 61) % 440, 300 + (i * 137) % 600 - t * 80, 26 * Math.sin(t * Math.PI) + 2, '#fff1a6'); } },
  splash: (p, f) => { const t = (f % 24) / 24; p.g.save(); p.g.translate(0, 300); p.g.scale(.75, .75); fxSplash(p, t); p.g.restore(); },
  dust: (p, f) => { const t = (f % 30) / 30; p.g.save(); p.g.translate(150, 700); p.g.scale(1.1, 1.1); fxPuff(p, t); p.g.restore(); },
  wind: (p, f) => { for (let i = 0; i < 7; i++) { const x = ((f * 30 + i * 140) % 900) - 150, y = 200 + i * 110; p.stroke([[x, y], [x + 120, y - 6], [x + 170, y + 6]], 2.5, 'rgba(255,255,255,.55)'); } },
  burst: (p, f) => { const t = Math.min(1, (f % 45) / 25); p.g.save(); p.g.translate(50, 250); fxBurst(p, t); p.g.restore(); },
  lightning: () => {},
};
