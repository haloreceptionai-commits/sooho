// Builds the documentary manifest the Azure worker renders: beats from the visual planner, chapter openers, a title after the cold open,
// planned breaths of silence before reveals, a music mood per chapter and ambience per scene, then measures it with the boredom meter.
import { boredomReport, estimateTimes, type BoredomReport } from './boredom';
import { attachCast, type CastEntry } from './cast';
import { planVideo, type SceneInput } from './plan-visuals';
import { DOC_WPS, type AiScenePlan, type DocBeat, type DocManifest, type DocScene, type Mood, type MusicMood } from './types';

export interface BuildScene { narration: string; mood?: Mood | undefined; ambience?: string | undefined; cold?: boolean | undefined; reveal?: boolean | undefined; beat?: string | undefined; aside?: boolean | undefined }
export interface BuildChapter { scene: number; title: string; subtitle?: string | undefined; music?: MusicMood | undefined }
export interface BuildInput {
  title: string; subtitle?: string | undefined;
  scenes: BuildScene[]; chapters: BuildChapter[];
  /** Picture index (into `images`) used for each scene. */
  sceneImage: number[];
  images: string[];
  voice: { path: string; scenes: number[] }[];
  ai?: AiScenePlan[] | undefined;
  /** People of the story whose cutouts were painted, and where those pictures are stored (same order as `cast`). */
  cast?: CastEntry[] | undefined;
  cutouts?: string[] | undefined;
  sources?: string[] | undefined;
  width?: number | undefined; height?: number | undefined; captions?: boolean | undefined;
}

const AMBIENT = new Set(['rain', 'wind', 'traffic', 'chatter', 'crickets', 'birds', 'fire', 'water']);
const MUSIC_WORDS: Record<MusicMood, RegExp> = {
  epic: /\b(war|wars|battle|battles|army|armies|soldier|soldiers|empire|king|queen|conquer\w*|legion\w*|victory|siege|fight\w*|invad\w*|invasion|general|revolution|knight|knights|castle|rome|roman|crusade\w*|warrior\w*|sword|swords)\b/gi,
  suspense: /\b(mystery|mysterious|secret|secrets|dark|murder\w*|crime|ghost|haunted|horror|disappear\w*|missing|trap|danger\w*|threat\w*|spy|spies|conspiracy|monster|curse\w*|unknown|shadow\w*|killer|poison\w*|escape|vanish\w*|con|fraud|lie|lies)\b/gi,
  sad: /\b(died|death|dead|dies|lost|loss|tragic|tragedy|cry|cried|crying|tears|alone|funeral|orphan\w*|goodbye|grief|sorrow|broken|heartbroken|sad)\b/gi,
  lofi: /\b(study|relax\w*|chill|coffee|cozy|calm|routine|habit|habits|productiv\w*|focus|peaceful|morning|rainy|invent\w*|discover\w*|design\w*|build\w*|science|experiment\w*)\b/gi,
};

/** The music mood that fits a stretch of narration (epic for war, suspense for mystery and crime, sad for loss, lofi for ideas); suspense when unclear. */
export function moodFor(text: string): MusicMood {
  let best: MusicMood = 'suspense', top = 0;
  (Object.keys(MUSIC_WORDS) as MusicMood[]).forEach(k => { const n = (text.match(MUSIC_WORDS[k]) ?? []).length; if (n > top) { top = n; best = k; } });
  return top >= 2 ? best : 'suspense';
}

export function buildManifest(inp: BuildInput): { manifest: DocManifest; report: BoredomReport } {
  const n = inp.scenes.length;
  if (!n) throw new Error('A documentary needs scenes');
  if (inp.sceneImage.length !== n) throw new Error('Every scene needs a picture');
  const chapters = [...inp.chapters].sort((a, b) => a.scene - b.scene);
  const chapterAt = new Map(chapters.map((c, i) => [c.scene, { ...c, number: i + 1 }]));
  let coldEnd = 0;
  inp.scenes.forEach((s, i) => { if (s.cold) coldEnd = i + 1; });      // first scene after the cold open (0 when there is none)
  const sceneInputs: SceneInput[] = inp.scenes.map((s, i) => ({
    index: i, text: s.narration.trim(), mood: s.mood, cold: s.cold, chapterStart: chapterAt.has(i) && i > 0, image: inp.sceneImage[i]!, sources: inp.sources,
    ai: inp.ai?.find(p => p.scene === i),
  }));
  const beats = attachCast(planVideo(sceneInputs, { pace: 'long' }), inp.scenes.map(s => s.narration.trim()), inp.cast ?? []);
  // a wry aside gets comic timing: a quick punch-in and a record scratch on its first picture beat
  inp.scenes.forEach((s, i) => {
    if (!s.aside) return;
    const b = beats.find(x => x.scene === i && x.visual.type === 'image');
    if (b && b.visual.type === 'image') { b.visual = { ...b.visual, move: 'punch' }; if (!b.sfx) b.sfx = 'scratch'; }
  });
  // chapter openers sit on the first beat of the chapter; the video's own title sits on the first beat after the cold open
  const first = (scene: number): DocBeat | undefined => beats.find(b => b.scene === scene);
  for (const [scene, c] of chapterAt) {
    if (scene === 0 && coldEnd > 0) continue;
    const b = first(scene);
    if (!b) continue;
    if (coldEnd > 0 && scene === coldEnd) continue;                       // the title card opens this one instead
    b.overlays = [...(b.overlays ?? []), { kind: 'chapter', data: { number: String(c.number), title: c.title, subtitle: c.subtitle ?? '' }, at: .3, dur: 2.6 }];
  }
  if (coldEnd > 0 && coldEnd < n) {
    const b = first(coldEnd);
    if (b) { b.overlays = [...(b.overlays ?? []), { kind: 'title', data: { title: inp.title, subtitle: inp.subtitle ?? '' }, at: .1, dur: 2.6 }]; b.transition = 'dip'; b.sfx = 'sting'; }
  }
  // breaths of silence: before the title, and before a reveal (at most one every ~40 s)
  const pauses: DocManifest['pauses'] = [];
  const times = estimateTimes({ scenes: inp.scenes.map(s => ({ text: s.narration })), beats, pauses: [] });
  const sceneTime = (i: number) => times.find(t => t.beat.scene === i)?.start ?? 0;
  let lastPause = -99;
  const lastWord = (i: number) => Math.max(0, inp.scenes[i]!.narration.trim().split(/\s+/).length - 1);
  if (coldEnd > 0 && coldEnd < n) { pauses.push({ scene: coldEnd - 1, after_word: lastWord(coldEnd - 1), sec: .55, hush: true }); lastPause = sceneTime(coldEnd); }
  inp.scenes.forEach((s, i) => {
    if (i < 2 || !(s.reveal || s.beat === 'reveal') || sceneTime(i) - lastPause < 40) return;
    pauses.push({ scene: i - 1, after_word: lastWord(i - 1), sec: .6, hush: true });
    lastPause = sceneTime(i);
    const b = first(i);
    if (b && !b.sfx) b.sfx = 'hit';
  });
  // music: the outline's mood per chapter, else read from the words; the cold open is always suspense
  const music: DocManifest['music'] = [];
  const bounds = chapters.length ? chapters : [{ scene: 0, title: '' }];
  if (coldEnd > 0) music.push({ scene: 0, mood: 'suspense' });
  bounds.forEach((c, k) => {
    const to = k + 1 < bounds.length ? bounds[k + 1]!.scene : n;
    const text = inp.scenes.slice(c.scene, to).map(s => s.narration).join(' ');
    const start = coldEnd > 0 && c.scene < coldEnd ? coldEnd : c.scene;
    const mood = ('music' in c && c.music) || moodFor(text);
    if (!music.length || music.at(-1)!.mood !== mood || start === 0) music.push({ scene: start, mood });
  });
  const scenes: DocScene[] = inp.scenes.map(s => ({ text: s.narration.trim(), ...(s.mood ? { mood: s.mood } : {}), ...(s.ambience && AMBIENT.has(s.ambience) ? { ambience: s.ambience } : {}) }));
  const manifest: DocManifest = {
    kind: 'documentary', version: 1, width: inp.width ?? 1920, height: inp.height ?? 1080, title: inp.title,
    images: inp.images, voice: inp.voice, scenes, beats, pauses, ...(inp.cast?.length && inp.cutouts?.length ? { cutouts: inp.cutouts, cast: inp.cast.map((c, i) => ({ id: c.id, name: c.name, kind: c.kind, cutout: i })) } : {}), music: music.filter((m, i, a) => a.findIndex(x => x.scene === m.scene) === i), captions: inp.captions !== false,
  };
  return { manifest, report: boredomReport(manifest) };
}

/** How many pictures a long video needs and what they cost, so the owner sees it before paying: one per scene plus planned inserts. */
export const wordsPerScene = (durationSec: number) => Math.round(DOC_WPS * 5.5 * (durationSec > 300 ? 1 : 1.2));
