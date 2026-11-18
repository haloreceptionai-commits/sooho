// Historical cast for long-form videos. A named person ("Queen Elizabeth I", "Napoleon") gets a 3D-cartoon cutout of themselves; a role ("soldier", "sailor",
// "queen's guard") gets a human cartoon face dressed for the era. Cutouts are transparent pictures placed in front of the background by the renderer, so every
// picture of the video shows the right people instead of one default character. Everything here is pure: the model calls and the painting are in documentary.server.ts.
import { findSpokenNumbers } from './spoken-numbers';
import type { BeatCast, CastSide, DocBeat, OverlaySpec } from './types';

export type CastKind = 'figure' | 'role';
export interface CastEntry { id: string; name: string; kind: CastKind; label: string; look: string }
export type Era = 'ancient' | 'medieval' | 'early-modern' | '19th' | '20th' | 'modern';
export type Side = CastSide;

export const MAX_FIGURES = 6;
export const MAX_ROLES = 3;

const STOP = new Set('the a an of and or in on at to for with from by as is was were are be been it its they their his her this that these those who which had has have not no but he she we you i so than then there here what when where how'.split(' '));
const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9']/g, '');
export const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'person';

// ---------------------------------------------------------------------------------------------------- era
/** The era the story mostly happens in, from the years the narrator speaks (BC years count as ancient). */
export function eraOf(texts: string[]): Era {
  const years: number[] = [];
  for (const t of texts) for (const n of findSpokenNumbers(t.split(/\s+/))) if (n.year || n.era) years.push(n.era === 'BC' || n.era === 'BCE' ? -n.value : n.value);
  if (!years.length) return 'modern';
  years.sort((a, b) => a - b);
  const y = years[Math.floor(years.length / 2)]!;
  return y < 500 ? 'ancient' : y < 1450 ? 'medieval' : y < 1800 ? 'early-modern' : y < 1900 ? '19th' : y < 1990 ? '20th' : 'modern';
}

// ---------------------------------------------------------------------------------------------------- roles
interface RoleSpec { id: string; label: string; re: RegExp; kit: Partial<Record<Era, string>>; any: string }
const ROLES: RoleSpec[] = [
  { id: 'soldier', label: 'Soldier', re: /\b(soldiers?|warriors?|legionar(?:y|ies)|legions?|infantry|troops?|army|armies|guards?|musketeers?|fighters?)\b/i, any: 'a soldier in the uniform and armour of the period',
    kit: { ancient: 'bronze helmet with a crest, leather and bronze cuirass, red tunic, round shield and spear', medieval: 'chainmail, iron helmet, tabard with a simple cross and a sword', 'early-modern': 'tricorn hat, long coat with brass buttons, musket and bayonet', '19th': 'dark blue wool uniform with brass buttons, shako hat and a rifle', '20th': 'khaki wartime uniform, steel helmet and webbing', modern: 'modern combat uniform, helmet and vest' } },
  { id: 'knight', label: 'Knight', re: /\b(knights?|crusaders?)\b/i, any: 'a knight in plate armour', kit: { medieval: 'plate armour, surcoat with a crest, helmet under one arm and a sword' } },
  { id: 'sailor', label: 'Sailor', re: /\b(sailors?|seamen|crew|mariners?|deckhands?)\b/i, any: 'a sailor in period seafaring clothes',
    kit: { ancient: 'short tunic, rope belt and bare feet', 'early-modern': 'striped shirt, knee breeches, neckerchief and a knitted cap', '19th': 'blue sailor jacket, flared trousers and a flat cap', '20th': 'white sailor uniform with a collar and a cap', modern: 'navy work uniform and a cap' } },
  { id: 'pirate', label: 'Pirate', re: /\bpirates?\b/i, any: 'a pirate', kit: { 'early-modern': 'tricorn hat, long red coat, sash and a cutlass' } },
  { id: 'worker', label: 'Worker', re: /\b(workers?|labou?rers?|builders?|craftsmen|masons?|carpenters?|riveters?|dockers?|navvies)\b/i, any: 'a worker in sturdy period work clothes',
    kit: { ancient: 'simple linen kilt, bare chest and a headcloth', medieval: 'rough tunic, leather apron and hood', '19th': 'flat cap, rolled sleeves, waistcoat and heavy boots', '20th': 'overalls, flat cap and work gloves', modern: 'hard hat, high-visibility vest and work boots' } },
  { id: 'farmer', label: 'Farmer', re: /\b(farmers?|peasants?|villagers?|shepherds?)\b/i, any: 'a farmer in plain period clothes', kit: { medieval: 'rough tunic, hood and wooden clogs', 'early-modern': 'linen shirt, waistcoat and straw hat' } },
  { id: 'merchant', label: 'Merchant', re: /\b(merchants?|traders?|dealers?|shopkeepers?)\b/i, any: 'a merchant in good period clothes', kit: { 'early-modern': 'dark doublet, ruff collar and a purse at the belt', '19th': 'frock coat, top hat and a pocket watch', '20th': 'three-piece suit and a hat' } },
  { id: 'scientist', label: 'Scientist', re: /\b(scientists?|engineers?|inventors?|researchers?|chemists?|physicists?)\b/i, any: 'a scientist in period clothes', kit: { '19th': 'long coat, cravat and round glasses', '20th': 'white lab coat and glasses' } },
  { id: 'doctor', label: 'Doctor', re: /\b(doctors?|physicians?|surgeons?|nurses?)\b/i, any: 'a doctor in period clothes', kit: {} },
  { id: 'priest', label: 'Priest', re: /\b(priests?|monks?|bishops?|friars?|clergy)\b/i, any: 'a priest in robes', kit: { medieval: 'brown monk robe with a rope belt and tonsure' } },
  { id: 'miner', label: 'Miner', re: /\bminers?\b/i, any: 'a miner with a helmet lamp', kit: {} },
  { id: 'pilot', label: 'Pilot', re: /\b(pilots?|aviators?)\b/i, any: 'a pilot in a leather flight jacket and goggles', kit: {} },
  { id: 'astronaut', label: 'Astronaut', re: /\bastronauts?\b/i, any: 'an astronaut in a white space suit with the helmet off', kit: {} },
  { id: 'spy', label: 'Spy', re: /\b(spy|spies|agents?)\b/i, any: 'a spy in a trench coat and hat', kit: {} },
  { id: 'police', label: 'Police officer', re: /\b(police(?:man|men)?|constables?|detectives?|inspectors?)\b/i, any: 'a police officer in period uniform', kit: { '19th': 'dark coat with brass buttons and a tall helmet' } },
  { id: 'crowd', label: 'Citizen', re: /\b(citizens?|townspeople|crowds?|people of)\b/i, any: 'an ordinary citizen in period clothes', kit: {} },
];
export const roleSpecs = () => ROLES.map(r => ({ id: r.id, label: r.label }));

/** Roles the narrator names in these lines, with how many scenes mention each (most mentioned first). */
export function detectRoles(lines: string[]): { id: string; label: string; scenes: number[] }[] {
  const hits = new Map<string, number[]>();
  lines.forEach((t, i) => { for (const r of ROLES) if (r.re.test(t)) hits.set(r.id, [...(hits.get(r.id) ?? []), i]); });
  return [...hits.entries()].map(([id, scenes]) => ({ id, label: ROLES.find(r => r.id === id)!.label, scenes })).sort((a, b) => b.scenes.length - a.scenes.length);
}

/** The cartoon description of a role in an era: a human face, dressed for the period. */
export function roleLook(id: string, era: Era): string {
  const r = ROLES.find(x => x.id === id);
  if (!r) return 'an ordinary person in clothes of the period';
  const kit = r.kit[era];
  return kit ? `a ${r.label.toLowerCase()} wearing ${kit}` : r.any;
}

// ---------------------------------------------------------------------------------------------------- figures
/** Distinctive words of a name (surname, "Elizabeth"): the part the narrator says. Titles and filler never count. */
export function nameTokens(name: string): string[] {
  const skip = new Set(['king', 'queen', 'emperor', 'empress', 'pharaoh', 'general', 'captain', 'commodore', 'sir', 'lady', 'lord', 'saint', 'st', 'dr', 'mr', 'mrs', 'president', 'prince', 'princess', 'pope', 'the', 'of', 'de', 'van', 'von', 'la', 'le', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii']);
  return name.split(/\s+/).map(w => w.replace(/[^A-Za-z'-]/g, '')).filter(w => w.length >= 3 && !skip.has(w.toLowerCase()));
}

/** Does the narrator say this person's name? (any distinctive word of it, capitalised the way a name is). */
export function mentions(name: string, text: string): boolean {
  const toks = nameTokens(name);
  if (!toks.length) return false;
  const words = text.split(/\s+/).map(w => w.replace(/[^A-Za-z'-]/g, ''));
  return toks.some(t => words.some((w, i) => w === t || (w.toLowerCase() === t.toLowerCase() && i > 0 && /^[A-Z]/.test(w))));
}

/** People the story names, found without a model: the outline's characters, the dossier's people and the hero. */
export function heuristicFigures(names: { name: string; role?: string; look?: string }[], lines: string[], era: Era): CastEntry[] {
  const seen = new Set<string>();
  const out: CastEntry[] = [];
  for (const n of names) {
    if (!n.name?.trim()) continue;
    const key = nameTokens(n.name).map(t => t.toLowerCase()).join(' ');
    if (!key || seen.has(key) || !lines.some(l => mentions(n.name, l))) continue;
    seen.add(key);
    out.push({ id: slug(n.name), name: n.name.trim().slice(0, 60), kind: 'figure', label: (n.role ?? '').trim().slice(0, 60), look: figureLook(n.name, n.role ?? '', n.look ?? '', era) });
  }
  return out.slice(0, MAX_FIGURES);
}

/** The cartoon description of a named person: recognisable features and signature clothing of the era. */
export function figureLook(name: string, role: string, look: string, era: Era): string {
  return `${name}${role ? `, ${role}` : ''}${look ? `: ${look}` : ''}. Their real, recognisable hairstyle, face shape and signature clothing of the ${era.replace('-', ' ')} period, as a friendly cartoon caricature`;
}

// ---------------------------------------------------------------------------------------------------- AI answer
export const castSchema = {
  type: 'object', additionalProperties: false, required: ['cast'],
  properties: { cast: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'kind', 'label', 'look'], properties: {
    name: { type: 'string' }, kind: { type: 'string', enum: ['figure', 'role'] }, label: { type: 'string' }, look: { type: 'string' } } } } },
};

export const castPrompt = (topic: string, era: Era, lines: { index: number; text: string }[], known: string[]) => ({
  system: `You are the casting director of a history documentary. Pictures show places and events; every person who matters is added as a 3D cartoon cutout. Decide who gets one.
- kind "figure": a REAL, NAMED person the narrator talks about (queen, president, general, inventor, criminal). name = their full usual name exactly as the narration or history gives it. look = how a cartoonist draws THEM: age, build, face shape, hair, beard, signature clothes and accessories of their period, so they are recognisable. label = 2-5 words of who they are ("Queen of England").
- kind "role": an anonymous type of person the narrator mentions ("soldier", "sailor", "scrap metal dealer", "queen's guard"). name = the role in 1-3 words. look = a HUMAN cartoon person with a real face (never a stick figure or egg head) dressed exactly for the era and role. label = the same role.
Only include people the narration actually names or describes. At most ${MAX_FIGURES} figures and ${MAX_ROLES} roles; prefer the ones mentioned most or that matter most to the story. Era of the story: ${era.replace('-', ' ')}.`,
  user: `Topic: ${topic}\nPeople already known: ${known.join(', ') || 'none'}\n\nNarration:\n${lines.map(l => `[${l.index}] ${l.text}`).join('\n')}`,
});

/** Reads the model's cast answer: names must be spoken, roles must be real roles, and the total stays small. */
export function parseCast(answer: { cast?: { name: string; kind: string; label: string; look: string }[] }, lines: string[], era: Era): CastEntry[] {
  const out: CastEntry[] = [];
  const used = new Set<string>();
  for (const c of answer.cast ?? []) {
    const name = String(c.name ?? '').trim().slice(0, 60);
    if (!name) continue;
    if (c.kind === 'figure') {
      if (out.filter(e => e.kind === 'figure').length >= MAX_FIGURES || !lines.some(l => mentions(name, l))) continue;
      const id = slug(name);
      if (used.has(id)) continue;
      used.add(id);
      out.push({ id, name, kind: 'figure', label: String(c.label ?? '').trim().slice(0, 60), look: String(c.look ?? '').trim().slice(0, 400) || figureLook(name, c.label ?? '', '', era) });
    } else if (c.kind === 'role') {
      if (out.filter(e => e.kind === 'role').length >= MAX_ROLES) continue;
      const spec = ROLES.find(r => r.re.test(name) || r.id === slug(name) || r.re.test(c.label ?? ''));
      const id = spec ? spec.id : slug(name);
      if (used.has(id) || !lines.some(l => (spec ?? { re: new RegExp(`\\b${name.replace(/[^a-z ]/gi, '')}`, 'i') }).re.test(l))) continue;
      used.add(id);
      out.push({ id, name: spec?.label ?? name, kind: 'role', label: spec?.label ?? name, look: String(c.look ?? '').trim().slice(0, 400) || roleLook(id, era) });
    }
  }
  return out;
}

/** The cast for a video: the model's answer when it came, the built-in finders otherwise, always capped. */
export function buildCast(o: { lines: string[]; era: Era; ai?: CastEntry[] | undefined; names: { name: string; role?: string; look?: string }[] }): CastEntry[] {
  const figures = (o.ai ?? []).filter(e => e.kind === 'figure');
  const base = figures.length ? figures : heuristicFigures(o.names, o.lines, o.era);
  const roles = (o.ai ?? []).filter(e => e.kind === 'role').length ? (o.ai ?? []).filter(e => e.kind === 'role')
    : detectRoles(o.lines).slice(0, MAX_ROLES).map(r => ({ id: r.id, name: r.label, kind: 'role' as const, label: r.label, look: roleLook(r.id, o.era) }));
  return [...base.slice(0, MAX_FIGURES), ...roles.slice(0, MAX_ROLES)];
}

// ---------------------------------------------------------------------------------------------------- placing the cast on beats
const TTL = { figure: 4, role: 2 } as const;

/** Which beats show which cutouts. A person appears when the narrator says their name and stays for a few beats; a role appears while it is being talked about.
 *  Never on a card beat (the card covers the picture), never more than two at once, and a first-time figure also gets a name label. */
export function attachCast(beats: DocBeat[], sceneTexts: string[], cast: CastEntry[]): DocBeat[] {
  if (!cast.length) return beats;
  const byId = new Map(cast.map(c => [c.id, c]));
  const active: { id: string; ttl: number; side: Side }[] = [];
  const introduced = new Set<string>();
  const roleRe = (id: string) => ROLES.find(r => r.id === id)?.re;
  return beats.map(b => {
    if (b.visual.type !== 'image') return b;
    const words = (sceneTexts[b.scene] ?? '').split(/\s+/).slice(b.w0, b.w1).join(' ');
    // age what is already on screen, then add whoever is mentioned now
    for (const a of active) a.ttl--;
    for (let i = active.length - 1; i >= 0; i--) if (active[i]!.ttl <= 0) active.splice(i, 1);
    for (const c of cast) {
      const hit = c.kind === 'figure' ? mentions(c.name, words) : !!roleRe(c.id)?.test(words);
      if (!hit) continue;
      const cur = active.find(a => a.id === c.id);
      if (cur) { cur.ttl = TTL[c.kind]; continue; }
      const taken = new Set(active.map(a => a.side));
      if (active.length >= 2) active.shift();
      const side: Side = !taken.has('left') ? 'left' : 'right';
      active.push({ id: c.id, ttl: TTL[c.kind], side: active.some(a => a.side === side) ? (side === 'left' ? 'right' : 'left') : side });
    }
    if (!active.length) return b;
    const placed: BeatCast[] = active.map(a => ({ id: a.id, side: a.side }));
    const overlays: OverlaySpec[] = [...(b.overlays ?? [])];
    for (const a of active) {
      const c = byId.get(a.id)!;
      if (c.kind === 'figure' && !introduced.has(c.id) && !overlays.some(o => o.kind === 'lower_third')) overlays.push({ kind: 'lower_third', data: { name: c.name, sub: c.label, side: a.side === 'left' ? 'right' : 'left' }, at: .4, dur: 3 });   // the label stands on the side the cutout does not
      if (c.kind === 'figure') introduced.add(c.id);
    }
    return { ...b, cast: placed, ...(overlays.length ? { overlays } : {}) } as DocBeat;
  });
}

// ---------------------------------------------------------------------------------------------------- painting
/** Same art style as the video's pictures (whatever style the owner chose), drawn by the image model as one transparent full-body cutout. Never a 3D render. */
export const DEFAULT_CUTOUT_LOOK = 'Stylized 3D animated cartoon illustration look (clay-like shapes, big expressive human face, slightly exaggerated proportions, rich period costume detail, soft lighting, thin dark outline).';
export const cutoutStyle = (look: string) => `${look || DEFAULT_CUTOUT_LOOK} Draw ONE single full-body character standing in a relaxed three-quarter pose, feet visible, centered, on a fully transparent background; nothing else in the picture, no ground, no shadow, no text, no logo.`;

/** The painting prompts for a cutout. Three tries: the named person, the same description without the name (some image services refuse real people), then a generic person of that role. */
export function cutoutPrompts(c: CastEntry, era: Era, look = ''): string[] {
  const style = cutoutStyle(look);
  if (c.kind === 'role') return [`${style} Character: ${c.look}.`, `${style} Character: ${roleLook(c.id, era)}.`];
  const plain = c.look.replace(new RegExp(c.name.replace(/[^A-Za-z ]/g, ''), 'gi'), 'a historical figure');
  return [
    `${style} Character: a friendly caricature of the historical figure ${c.name}${c.label ? ` (${c.label})` : ''}. ${c.look}`,
    `${style} Character: ${plain}`,
    `${style} Character: a ${c.label || 'person'} of the ${era.replace('-', ' ')} period in typical clothing, calm confident expression.`,
  ];
}

/** Added to every background picture prompt of a documentary: people come from the cutouts, so the picture shows the place and the event. */
export const BACKGROUND_RULE = 'Show the place, objects and event. Any people are tiny and far away; no person fills the foreground or looks at the camera. Keep the lower left and lower right of the frame as open ground, floor or water where a character can stand.';
