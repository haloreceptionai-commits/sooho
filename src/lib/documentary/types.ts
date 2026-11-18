// Shapes shared by the documentary planner (this folder) and the Azure worker (hosted-renderer/cartoon/documentary/*.py).
// The plan never holds seconds: a beat starts on the word it names, so the worker lines every card up with the spoken word.

export const CARD_KINDS = ['number', 'quote', 'document', 'timeline', 'location', 'compare', 'keyfact', 'chapter', 'title', 'steps'] as const;
export type CardKind = (typeof CARD_KINDS)[number];
export const OVERLAY_KINDS = ['lower_third', 'date_stamp', 'source_tag'] as const;
export type OverlayKind = (typeof OVERLAY_KINDS)[number];
export const MOVES = ['push', 'pull', 'pan_left', 'pan_right', 'tilt_up', 'tilt_down', 'orbit_left', 'orbit_right', 'drift', 'hold', 'punch'] as const;
export type Move = (typeof MOVES)[number];
export const TRANSITIONS = ['cut', 'cross', 'dip', 'whip', 'flash'] as const;
export type Transition = (typeof TRANSITIONS)[number];
export const SFX = ['none', 'hit', 'riser', 'whoosh', 'sting'] as const;
export type Sfx = (typeof SFX)[number];
export const MOODS = ['neutral', 'tension', 'reveal', 'warm', 'cold', 'dark'] as const;
export type Mood = (typeof MOODS)[number];
export const MUSIC = ['lofi', 'epic', 'suspense', 'sad'] as const;
export type MusicMood = (typeof MUSIC)[number];

export type CardData = Record<string, unknown>;
export interface OverlaySpec { kind: OverlayKind | CardKind; data: CardData; at?: number; dur?: number }
export type BeatVisual =
  | { type: 'image'; src: number; move: Move; focus?: [number, number]; strength?: number; zoom?: [number, number] }
  | { type: 'card'; card: CardKind; data: CardData; bg?: number | null };
export interface DocBeat { scene: number; w0: number; w1: number; visual: BeatVisual; transition?: Transition; sfx?: Sfx; overlays?: OverlaySpec[]; mood?: Mood }
export interface DocScene { text: string; mood?: Mood; ambience?: string }
export interface DocManifest {
  kind: 'documentary'; version: 1; width: number; height: number; title: string;
  images: string[]; voice: { path: string; scenes: number[] }[]; scenes: DocScene[]; beats: DocBeat[];
  pauses: { scene: number; after_word: number; sec: number; hush?: boolean }[]; music: { scene: number; mood: MusicMood }[]; captions: boolean;
}

/** What the visual planner (AI or heuristic) proposes for one scene; every proposal is checked against the spoken words before it is used. */
export interface AiBeat {
  w0: number; w1: number; kind: 'image' | CardKind; move?: Move; focus?: number[]; zoom?: number[]; strength?: number;
  data?: CardData; overlay?: { kind: OverlayKind; data: CardData }; sfx?: Sfx; transition?: Transition; prompt?: string;
}
export interface AiScenePlan { scene: number; beats: AiBeat[] }

/** Narrator speed used to estimate how long a beat lasts before the real timings exist (words per second). */
export const DOC_WPS = 2.55;
