# Advanced Video AI — new engine built from the Pig War guide

Goal: add a third video engine, shown as **"Advanced Video AI"** next to Own images and Own cartoon on Create, Remix and Script Writer, for both Shorts (9:16) and long-form (16:9). It reproduces the guide's look: flat ink-outlined painted character cards standing in a real 3D set, painted textures, ink lines on the world, depth of field, warm grade, Montserrat pop captions, beat-locked music. Then make one 12-second test video and compare it to the sample clip.

Name note: you wrote "Adcanec Video Ai" — I read it as "Advanced Video AI". Tell me if you want the exact spelling instead.

## What you will get
- New engine option everywhere a video can be created.
- Shorts of about 1 minute finished in 2–3 minutes after you press Create (script and pictures included), using the Azure render machines that cost nothing while idle.
- The same reliability as today: survives closing the browser, resume from saved work, watchdog restarts.
- A quality report on every video (shadow level, near-black, flat-pixel %, motion, loop seam, loudness) using the guide's measurements, compared with the sample clip.

## Pipeline (follows guide sections 4–15)
1. **Topic + facts** — existing fact-check/research, plus the guide's topic rules (hook ≤12 words, ≤3 character types, ≤4 locations, only verified facts, numbers rounded not invented).
2. **Script** — guide's 5-line structure for 12 s loops; for 60 s Shorts the same rules stretched to ~12–15 lines with a loop line that runs into line 1. Captions show digits, the voice says words.
3. **Voice** — keeps your chosen Shorts voice (Casual/Puck) and Atlas for long-form, synthesized one sentence at a time and placed at exact offsets. Word timing uses our existing exact speech alignment (better than the guide's estimate); captions follow the guide's merge rule (<0.12 s tokens merged).
4. **Shot plan** — Director AI writes shots.json: one set per location, one camera move per shot, cuts 0.1 s before a sentence, roll <3°, timed events (gunshot, smoke, stars, pop-ups).
5. **Characters as cards** — each character drawn once by our image model on a plain background, background removed, normalized to 900×1500 feet-bottom, 9 px code ink outline so all share one line; pose/expression = texture swap. Crowds reuse one card with height/phase variation. Cards are cached per story and reused across shots.
6. **3D world** — seeded painted Canvas textures (grass, wood, cloth, sea, foliage), primitive props plus our existing model library, sets 40 units apart, guide lighting/fog/sky, flag wave, idle oscillators periodic in the video length.
7. **Post chain** — normal/depth pass, ink outline pass (3 px at 1920), 40-tap depth of field with focus racks, grade (highlight shoulder, saturation lift, violet shadow lift, no crushed blacks).
8. **Captions** — Montserrat 800/900, white with dark outline, pop-in over 0.1 s, chaining rules from section 12.
9. **Sound** — beat-locked music (length = whole bars), ducking under voice (−55%), SFX on events, −14 LUFS / −1 dBTP.
10. **QA** — frame count/size checks, loop seam check, guide metrics, automatic listed fix or one re-render; never silently ships a failing video.

## Speed plan (1-minute Short in 2–3 minutes)
- Script, character cards and voice run in parallel once the script is approved by the judges (no long repair loops for this engine: at most 1 repair).
- Scene page exposes `renderFrame(i)` and is deterministic, so frames split evenly over the 23 Azure machines (about 80 frames each for 60 s); no preview/review gate for this engine.
- Pixel sizes scale with height, so cheap 540×960 checks and full 1080×1920 finals share code.
- Pictures encoded once, audio-only loudness passes (existing approach).
- Measured per-stage timings saved on each video so we can see where time goes.
- Honest risk: Azure start-up (~35 s) and software graphics speed are the limits. If the test shows over 3 minutes, I will report the measured times per stage and the remaining gap rather than lower quality.

## Test
- Make one 12-second Short (Pig War style topic) end-to-end through the app, confirm it finishes, measure it with the guide's script next to the sample clip, report time taken and scores, and save it in My videos.

## Technical details
- New isolated worker sources under `hosted-renderer/advanced/` (scene page with three.js 0.170, card system, textures, post passes, captions, mix, QA metrics), packaged into the existing Azure render image and job pair; existing Own cartoon files untouched.
- New engine id `advanced` in the engine type, Zod schemas, create/remix/script-writer selectors, server-side engine validation before any paid work, and cartoon-submit routing.
- Versioned declarative manifest `advanced-v1` (story, script tokens, words, shots, cards, events) validated by the worker; no generated code executed. Shared vocabulary file for allowed set kinds, props, events.
- Character cards: Azure gpt-image-1-mini with a fixed style prompt, background removal, checkpointed under `<user>/<video>/media/` so Resume never repays.
- Reuses render_jobs claims, rotated callbacks, watchdog/recovery, private storage outputs.
- Tests: manifest validation, caption timing/merge rule, loop-line rule, engine validation, music length = whole bars, frame split.
- AGENTS.md rule for the new engine; memory updated with the engine name.
