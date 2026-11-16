# Rebuild the Shorts script writer (your task file)

Only Shorts scripts change, in Create and the Script Writer, for all three engines (Own images, Own cartoon, Advanced Video AI). Long videos and finished videos stay as they are.

## What the new writer does

The writer runs six steps, each as its own AI request:

1. **Fact sheet**: 8–12 specific facts covering who, what, when, where, numbers and the result. Each is marked certain or uncertain, and only certain facts may be used.
2. **Story spine**: premise, contradiction, problem, 2–3 linked attempts, twist, payoff and a closing line (under 15 words, different wording from the hook). A separate check rejects a spine whose steps don't cause each other, and rewrites it once.
3. **Hooks**: 10 hooks of 8–12 words, each a contradiction that hides the answer. No questions and no "Did you know". The best one is picked and locked.
4. **Script**: written as a narrator telling a friend a true story, never describing a camera or a scene. It follows your beat order, with your two gold examples, the "why they work" notes and the Moon Hoax bad-and-good lines as guidance.
5. **Critic**: a separate reviewer reads the script as a viewer, line by line. It checks whether each line follows the one before, is clear on first listen, is narration and adds a new fact. It also answers the hook, ending and twist questions, and scores coherence, clarity and curiosity out of 10. Only the flagged lines are rewritten, up to 3 times. If coherence is still under 8, the writer starts again from step 2 with a different spine (once).
6. **Light checks only**: word count, no repeated line, no names or dates outside the fact sheet, and a hook of 8–12 words that isn't a question. The old bans on fragments, "like a" comparisons and metaphors are removed, along with the old Story Shape rules for Shorts.

**Length follows your setting:** about 2.5 words per second. 30 seconds is about 65–75 words, 60 seconds about 130–150 and 90 seconds about 195–225. The number of lines scales the same way.

**After the words are final:** the existing scene step splits the approved narration into pictures without changing a single word. Voice, pictures, cartoon cast, captions and rendering then run as they do today.

## Acceptance test before shipping

1. Run the three topics through the real new writer: Benjamin Franklin and the oil, railway gaps and welded rails, and the Great Moon Hoax.
2. For each topic, show you the fact sheet, story spine, all 10 hooks with the chosen one, the final script and the critic scores, unedited.
3. A script passes only if: every line is clear on first listen, no line describes a scene, the hook doesn't give the answer, the ending doesn't copy the hook, and coherence is 8 or more.
4. I fix and re-run until all three pass, then wait for your approval. The new writer is built behind an off switch and only turned on for real Shorts after you approve.

## Technical details

- New `src/lib/shorts-writer/` module:
  - `prompts.ts`: gold examples, why-they-work notes, bad-and-good lines, beat guide.
  - `operations.server.ts`: factSheet, spine, spineCheck, hooks, script, critic and rewriteLines, all as strict-JSON Azure calls.
  - `checks.ts`: the light checks, kept pure and tested.
  - `orchestrate.ts`: shared step order, retries and spine restart, with calls injected so the same flow runs in all three paths.
- Wired into the browser pipeline (`pipeline.ts`), the background coordinator (`generation-script.server.ts`) and the Script Writer page. Each step is saved as a checkpoint so Resume never pays twice.
- `generatePlanOperation` gets a `lockedNarration` mode for scene splitting. The scene text must equal the approved narration word for word, otherwise it retries, then fails safely before any images or voice.
- For Shorts, the readiness gate becomes critic coherence of 8 or more plus the light checks. The old story-v2 validators and storyScore stay for long videos only. The Advanced engine's literal-picture checks still run on the scenes.
- Model settings:
  - Steps 4 and 5 use the strongest deployment set in Settings.
  - Our Azure GPT-5-family models do not accept a temperature setting, so I'll check this on the real deployment first. If it isn't accepted, I'll use the closest supported option and report it rather than guess.
- An off switch (`SHORTS_WRITER_V4`) stays off until you approve the three scripts.
- Tests: word-count scaling by length, repeated-line check, unknown name/date check, hook check, and the critic decision rules for patching versus restarting. Run with the full test suite.
- Records:
  - `AGENTS.md` rule replaced with the new writer architecture.
  - The gold-shape memory updated with your rules.
  - The roadmap updated.
