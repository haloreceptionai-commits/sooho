# Pipeline upgrade to match the Storm Oil guide

## Where the pipeline falls short of the guide

| Guide asks for | Today | Gap |
|---|---|---|
| Fact-check before writing (5–8 claims, myth vs reality, a hedge line when the effect is only partial) | None | Missing |
| Beat sheet first, then the script, then a validator | Writes everything in one go | Missing |
| 10 scored hooks, best one used, runner-up kept, 3–6 word on-screen hook text | Only a hook rule in the prompt | Missing |
| Topic passes 5 tests (needs 18/25 or more) + topic history so topics don't repeat | Keyword score only, no history | Partial |
| Open loop answered at 60–72% of the video, a re-hook every 6–8s, a skeptic line, an analogy, a proof shot, a closing loop line | Reveal beat exists, timing not enforced, ending has no loop line | Partial |
| Sentences of 12 words or fewer, ~2.6 words a second | Prompt asks for long run-on sentences; pace already ~153 wpm | Conflict, fix wording rules |
| Colour arc per beat (bright setup, dark tension, warm reveal, high-contrast payoff) | One colour direction for the whole video | Missing |
| A shot every ~3s, smooth moves, varied angles, soft dissolves | Hard cut every ~1.7s with whip blur | Change (your choice) |
| White captions, key noun or number in yellow and larger, at ~68% of the screen height | Every word yellow, at 60% | Change (your choice) |
| Pause before the reveal, faster in action, slower at the reveal | Steady Atlas pace | Missing |
| Music ducks under the voice, muffled dip before the reveal, hit on the payoff, a sound for every visual event | Fixed music level, one sound per scene | Partial |
| Loudness -14 LUFS, range 4–6 LU | Limiter only | Missing |
| Quality score 0–100, warning under 80 | None | Missing (your choice: show warning) |
| 1080x1920 at 30fps | Already done | OK |
| Viewer analytics feedback loop | Needs YouTube data | Deferred |

## What I'll build

1. **Fact-check step**: before writing, the script model lists 5–8 key claims, each with sources and a confidence rating, plus a "myth vs reality" note. Weak claims get a one-line hedge in the script.
2. **Hook writer**: writes 10 hooks across 5 types and scores each one (curiosity, clarity, how visual it is, how easy it is to say). Uses the best one, saves the runner-up, and adds a 3–6 word hook text on screen for the first 3 seconds.
3. **Beat sheet, script and checker**: writes a timed beat sheet first, then the narration. A checker tests for greetings, sentences over 12 words, word budget, reveal position at 60–72%, skeptic line, analogy, proof moment and a closing loop line. If it fails, the script is rewritten once.
4. **Topic tests and history**: the 5-test topic score (out of 25) shows on the Create page next to each idea. Topics already made are flagged so they aren't repeated.
5. **Visual planner**: each beat gets its own colour mood, the angle changes on every shot (wide, close, aerial, macro, point of view), and there's a close-up proof shot at the reveal.
6. **Editing**: a shot every ~3s with smooth continuous camera moves and soft dissolves. A hard punch-in only on big shocks.
7. **Captions**: white with a thick black outline. The key noun or number is shown in yellow and larger. Moved to ~68% height.
8. **Audio**: 0.4s of silence before the reveal, a slightly faster voice in action scenes and slightly slower at the reveal. Music ducks under the voice, dips (muffled) before the reveal and ends on a hit. Extra sounds for pours, waves and crashes, and the final mix levelled to about -14 LUFS.
9. **Quality score**: each finished video gets a 0–100 score with a breakdown in My videos. A warning shows under 80, and the video is still saved.

Not included: the YouTube analytics loop, because it needs your channel data. We can add it later.

## Testing
Generate one 60-second Short end to end, then check the length, reveal timing, captions, pause before the reveal, loudness and quality score, and compare frames against the reference.

## Technical details
- `pipeline.functions.ts`: new `factCheck` and `generateHooks` server functions using gpt-5 with strict JSON and streaming. `generatePlan` takes the facts and the chosen hook, adds a `beats` sheet, plus `color` and `angle` per scene, `hookText` and `loopLine`. A shared validator lives in `viral-brain.ts` (unit tested), and failures trigger one repair call.
- `viral-brain.ts`: `scoreTopic5` (5 tests), topic history read from the store's videos.
- `renderer.ts`: ~3s shots, crossfade dissolves, caption emphasis (yellow + 1.25x for nouns/numbers), hook overlay, pre-reveal gap in the chunk timeline, per-beat voice rate (0.82–0.9), sidechain-style music ducking, lowpass dip, payoff hit, RMS-based loudness normalisation toward -14 LUFS.
- `store.ts`: a `qa` score and breakdown per video. `videos.tsx` shows the badge and warning.
- New tests: validator rules, reveal-position math, caption emphasis picker.
