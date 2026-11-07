import { describe, expect, it } from "vitest";
import { splitLongScenes } from "@/lib/pipeline";
import { GOLD_ANCHORS, GOLD_STORY, hookIssues, hookTextIssues, rankHookTypes, splitSentences, storyScore, validateStory, type StoryScene } from "@/lib/story-v2";

const fail = (ids: string[], s = GOLD_STORY()) => validateStory(s).failed.map((c) => c.id).filter((id) => ids.includes(id));

// Brief #3 verified script (the failure), one scene per caption line.
const LINES = [
  "A mailman knocks on a rooftop door—who lives here?", "The guard laughs and says, 'You lost, postman?'", "The mailman points down at a green street.",
  "Houses sit on nets over a huge roof.", "Sirens wail, and wardens shout, 'Blackout now!'", "The guard yells, 'This is nuts, and pointless!'",
  "So why build a street on a roof?", "A car rolls under canvas trees, and sags.", "Up in Seattle, Boeing hides a plant, too.",
  "Can paper trees even fool a plane crew?", "Major Rex walks by and says, 'Wait.'", "He used British night decoys, and taught studios.",
  "Most people think a full fake town stood here.", "But that's wrong, and here is the real trick.", "You see, they lay nets and light mock houses.",
  "It breaks the big roof shape from high above.", "Ever hide a big toy under a blanket?", "From a chair, it looks like lumpy floor.",
  "The guard bumps a fake fence; the mailman knocks again.", "No enemy bombers ever came to test.",
];
const failure = () => ({
  scenes: LINES.map((narration, i): StoryScene => ({ beat: i === 15 ? "reveal" : "context", narration, characters: ["mailman"], shot: "face", money: false, loop_opened: "", loop_closed: "" })),
  anchors: GOLD_ANCHORS, question: "How do you hide a factory from the sky?",
  hero: { name: "mailman", role: "postman", want: "" }, cast: [{ name: "mailman", role: "postman" }, { name: "guard", role: "guard" }], durationSec: 65,
});

describe("Brief #3 validators on the real failure script", () => {
  const ids = validateStory(failure()).failed.map((c) => c.id);
  it("fails V1 anchors (no factory/year/place/bombers by 8s)", () => expect(ids).toContain("V1"));
  it("fails V2 (the riddle isn't the real question)", () => expect(ids).toContain("V2"));
  it("fails V3 ('He used British night decoys' has no referent)", () => expect(ids).toContain("V3"));
  it("fails V4 (opening question never answered at the end)", () => expect(ids).toContain("V4"));
  it("fails V5 when it ends on 'No enemy bombers ever came'", () => expect(ids).toContain("V5"));
  it("fails V6 (mailman has no stated want)", () => expect(ids).toContain("V6"));
  it("fails V10 (no money shot)", () => expect(ids).toContain("V10"));
});

describe("gold rewrite passes every blocking validator", () => {
  it("passes V1-V10, clock, loops, cast, shots, language", () => expect(validateStory(GOLD_STORY()).failed.map((c) => c.msg)).toEqual([]));
  it("scores 85+ with good judges", () => {
    const g = storyScore(validateStory(GOLD_STORY()), { passA: 4, passB: 4, passC: true, payoff: "", weakest: "", readAloud: [], literal: [], filler: [] }, 11);
    expect(g.score).toBeGreaterThanOrEqual(85);
    expect(g.ready).toBe(true);
  });
  it("is not ready when Pass B misses one of four", () => {
    const g = storyScore(validateStory(GOLD_STORY()), { passA: 4, passB: 3, passC: true, payoff: "", weakest: "", readAloud: [], literal: [], filler: [] }, 11);
    expect(g.ready).toBe(false);
  });
});

describe("single rules", () => {
  it("V5 allows absence framed as success", () => {
    const s = GOLD_STORY();
    s.scenes = [...s.scenes.slice(0, -1), { ...s.scenes[s.scenes.length - 1]!, narration: "So how do you hide a factory from the sky? It worked so well that the enemy never found it." }];
    expect(fail(["V5"], s)).toEqual([]);
  });
  it("V3 flags a pronoun with no named person before it", () => {
    const s = GOLD_STORY();
    s.scenes = [...s.scenes]; s.scenes[3] = { ...s.scenes[3]!, narration: "The paint dries fast. He used British night decoys." };
    expect(fail(["V3"], s)).toEqual(["V3"]);
  });
  it("cast over 3 fails", () => {
    const s = GOLD_STORY(); s.cast = [...s.cast, { name: "Major", role: "officer" }];
    expect(fail(["CAST"], s)).toEqual(["CAST"]);
  });
  it("shot mix fails with face close-ups everywhere", () => {
    const s = GOLD_STORY(); s.scenes = s.scenes.map((x) => ({ ...x, shot: "face" }));
    expect(fail(["SHOTS"], s)).toEqual(["SHOTS"]);
  });
});

describe("hook rules", () => {
  it("bans the mailman riddle", () => expect(hookIssues("A mailman knocks on a rooftop door—who lives here?", GOLD_ANCHORS).length).toBeGreaterThan(0));
  it("accepts the anchored gold hook", () => expect(hookIssues("In 1942, Burbank hid a bomber factory under a fake street.", GOLD_ANCHORS, "1942")).toEqual([]));
  it("rejects numbers not in the facts", () => expect(hookIssues("In 1943, Burbank hid a bomber factory under a fake street.", GOLD_ANCHORS, "1942").join()).toMatch(/1943/));
  it("hook text max 6 words, no repeat", () => {
    expect(hookTextIssues("FAKE STREET. REAL BOMBERS.", "In 1942, Burbank hid a bomber factory under a fake street.")).toEqual([]);
    expect(hookTextIssues("ROOFTOP DOOR, WHO LIVES?", "x").length).toBeGreaterThan(0);
  });
});

describe("analytics re-ranking", () => {
  it("is empty without data", () => expect(rankHookTypes([{ hookType: "mid_action" }])).toEqual([]));
  it("ranks by retention", () => expect(rankHookTypes([{ hookType: "a", hold3: 40, completion: 20 }, { hookType: "b", hold3: 80, completion: 60 }])[0]).toBe("b"));
});

describe("sentence splitter", () => {
  it("keeps initials together", () => expect(splitSentences("Major John F. Ohmer wants it. Next one? Yes.")).toEqual(["Major John F. Ohmer wants it.", "Next one?", "Yes."]));
});

describe("long scenes get a second picture", () => {
  it("splits a 3-sentence 25-word scene", () => {
    const sc = { beat: "payoff", narration: "It worked so well that pilots got lost over their own factory. So how do you hide a factory from the sky? You turn its roof into a fake street.", image_prompt: "x", characters: [], camera: "push_in" as const, sfx: "none", mood: "reveal" as const, color: "bright", angle: "wide", shot: "wide" as const, money: true, loop_opened: "", loop_closed: "main", purpose: "" };
    const out = splitLongScenes([sc]);
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(out.map((x) => x.narration).join(" ")).toBe(sc.narration);
    expect(out.filter((x) => x.money).length).toBe(1);
  });
});
