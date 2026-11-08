# Cartoon Engine v2: from working prototype to production-house quality

## Honest assessment

The current engine works end to end (voice, alignment, review, 10-machine render, QA, delivery), but it is a minimal first version, not the ceiling. The test video shows the gap: one sailor standing on a deck, barely moving, mouth closed while Atlas talks, same camera every shot. It does not yet "show what the narrator says".

What exists today (about 1,300 lines total):
- 5 worlds (ship, town, bridge, lab, landscape), mostly simple boxes and cones
- 1 character per shot, 3 outfits, 6 actions (idle, walk, point, lift, pour, react)
- Camera: one slow push-in per shot, always aimed at the same point
- Sound cues only on 4 words (pour, splash, crash, creak)
- No lip movement, no props matching the story, no captions in this mode, no transitions
- Scene direction is chosen by a short rule list, not by reading what each sentence means

## Biggest gaps (ranked by impact on viewers)

1. **Visuals don't illustrate the words.** "Pirate ship getting closer" shows no pirate ship. Needs a per-sentence visual director plus a library of story props and set pieces.
2. **Characters look frozen.** No talking mouth, few gestures, no body acting (anticipation, follow-through, weight).
3. **Only one actor.** "His captain grabs his shoulder" needs two characters interacting.
4. **Flat camera.** No close-ups, reaction shots, over-the-shoulder, whip pans, shake on impact or reveal zoom.
5. **Thin worlds.** No weather, waves, storms, fire, smoke or crowds, and the sets are blocky.
6. **No captions or kinetic text** in cartoon mode (the approved style is white captions with a yellow key word).
7. **Sound design is sparse.** Needs ambience per world and many more cue types.
8. **No automatic quality check of what was drawn**, for example whether the subject is in frame or a shot is too dark or empty.

## Plan (built one stage at a time, each tested before the next)

### Stage 1: Visual Director (meaning to shots)
- New AI step after the script: for each sentence, pick the subject, any second actor, props, set piece, emotion, action, shot type, camera move and sound cues.
- Output stays inside the locked declarative format, extended to v2 (multiple actors, props, effects, shot types). It never contains generated code.
- A validator rejects anything the engine can't draw. The owner review sheet then shows it before any spend.

### Stage 2: Character performance
- Lip sync: mouth shapes driven by the existing word timings (open/closed/wide/round), so Atlas lines visibly come from the speaking character.
- Eye direction, eyebrows and blinks driven by emotion; 5 expressions become 8.
- 6 actions become about 20: run, grab, push, shout, look-back, cower, celebrate, climb, row, steer, read, write, carry, throw, fall, shrug and more. Each gets anticipation and settle poses.
- Two- and three-actor staging with simple interactions (hand on shoulder, hand-off, facing each other).

### Stage 3: Props and set pieces library
- About 40 reusable props drawn in the same toon style: ships (merchant, pirate), barrels, oil jar, lantern, map, coins, sword, cannon, wave, rock, tower, cart, books, flask, crown and more.
- Moving set pieces: an approaching ship, a rising wave, a falling object, opening doors.
- Each prop has a fixed attach point (hand, ground, background) so placement is always valid.

### Stage 4: Cinematography
- Shot vocabulary: wide, medium, close-up, extreme close-up, over-the-shoulder, low angle, top view, insert of a prop.
- Moves: push-in, pull-back, pan to reveal, whip pan, orbit, handheld wobble, impact shake.
- Automatic framing aims at the subject's real position, so actors never end up out of frame.
- Cuts land on word boundaries, with about 3-second average shots (matches the approved formula), plus match cuts and smash cuts at the reveal.

### Stage 5: Worlds and effects
- Richer versions of the 5 worlds, plus 4 new ones: storm sea, castle, market and night camp.
- Effects: rain, wind on cloth, foam and spray, smoke, fire, dust, sparkles on the reveal, lightning.
- Lighting moods per beat (calm, tense, reveal), changed smoothly.

### Stage 6: Captions, text and sound
- Burned-in captions: white with the yellow key word, timed to each word, safe-area placement for Shorts.
- Optional big kinetic word on the hook and the reveal.
- Ambience bed per world plus about 20 cue types placed by the Visual Director; music ducking already exists and is kept.

### Stage 7: Quality gates
- Per-shot checks before the full render: subject visible, framing inside the safe area, enough motion, not too dark.
- The owner review sheet adds one labelled frame per sentence, so you can see "sentence to picture" before approving.
- Existing audio QA (loudness, peaks, frozen or black frames) stays.

### Stage 8: Speed and cost (kept)
- The 10-machine Azure render with zero idle cost stays the same; new detail is budgeted so a 60-second Short still targets 3 minutes or less.

## Order and checkpoints

```text
1 Visual Director -> 2 Performance -> 3 Props -> 4 Camera -> 5 Worlds/FX -> 6 Captions/Sound -> 7 QA
```
After each stage: unit tests plus a short 3-10 second Azure test render, with a frame shared with you. Legacy videos and the other video engines (Own stills, Omni, Seedance) stay untouched.

## What this will not do
- It stays a stylised 3D cartoon, not photorealistic, because that is the approved sailor look.
- No AI video model calls inside this engine, so there's no extra per-clip cost.

## Technical details
- Manifest becomes `cartoon-v2` in `src/lib/cartoon.ts` and `validate-manifest.mjs`. v1 stays readable so old previews still finish.
- The Visual Director runs as an authenticated server function (Azure GPT-5) producing a strict JSON schema. `build-manifest.py` maps it onto acoustic word timings.
- Visemes come from word timings plus letter-to-mouth-shape rules, with no new heavy model. The hash-pinned alignment stays.
- Props and worlds live as data-driven modules under `hosted-renderer/cartoon/` (props.mjs, actors.mjs, camera.mjs, fx.mjs). They are deterministic per frame, which keeps parallel batches identical.
- Captions are drawn in the Three.js overlay pass, so frames stay self-contained.
- Every stage adds Python and JS tests next to the existing `test_*.py` files and `src/test/cartoon-job.test.ts`. The Docker image is rebuilt through Azure Container Registry after each stage.
- Research references: multi-agent director planning for animation ([AniME](https://arxiv.org/html/2508.18781v2)); per-word LLM choice of pose, gesture and zoom with lip sync ([synctoon](https://github.com/Automate-Animation/synctoon)).
