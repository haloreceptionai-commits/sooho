# Reviewed cartoon Shorts worker

The separate private `chronicle-cartoon-renderer` Actor is deployed from this
folder using `node deploy.mjs`. Legacy Own, Omni and Seedance are unchanged.
Worker source is never imported by the app server or browser.

`reference/` contains the uploaded source, intentionally unchanged. `vendor/`
pins Three.js r160 and the MIT toon library at the commit in manifest.json, with
SHA-256 checks and license notices. Dependencies are not fetched at render time.

`node prepare.mjs /tmp/cartoon-proof` prepares a scratch reference fixture and
repairs the reversed GLSL smoothstep. This is a reference world, not the general
scene generator. The Python mixer exports floating-point samples and measured
gains. `finish.py` encodes validated frames using common linear mastering,
an allowed limiter and a blocking structured QA report. A synthetic one-second
fixture passed at -13.95 LUFS. A complete two-second sailor animation also
passed frame/black/freeze/codec QA at -13.99 LUFS; this is not production delivery.

`prepare-scene.mjs` builds declarative ship/town/bridge/lab/landscape primitives
while preserving the original ink and 48-tap DOF shaders. Sailor, worker and
scholar designs support idle/walk/point/react plus hand-anchored pot lift/pour.
The corrected pour frame was visually inspected with the pot fully inside
the card. Additional prop types, captions and complete secondary effects
remain unsupported, not silently replaced.

`acoustic.py` loads hash-pinned wav2vec2 weights offline. It successfully aligned
the actual 33.67-second Atlas sample to 86 script words. Uncalibrated CTC scores
always require review; no syllable fallback or voice retiming occurs.
`stems.py` creates deterministic music/SFX on the narration clock. In the Advanced pipeline it plays
`sound_lib.py`: about 30 synthesized effects (whoosh, pop, boing, door, engine, punch, clash, heartbeat, gasp, bass drop,
record scratch, sad trombone, shutter, cash, sparkle, typing, applause, ...), eight ambient beds chosen from each shot's
place (rain, wind, traffic, chatter, crickets, birds, fire, water) and five music beds picked from the script's own
words (the original quirky score, lo-fi, epic, suspense, sad). Everything is numpy arithmetic on a seeded generator, so
there is nothing to download or license and the same manifest always gives the same bytes. `sound_words.py` maps spoken
whole words to effects (pure python, used by `build-manifest.py`); ambience goes in the music stem so it ducks under speech.
`blender/ui_overlays.py` draws the caption templates (bold, pop, box, neon, karaoke; `caption_style` in the manifest) and the
on-screen UI (emoji reaction stickers, subscribe/like button, message bubbles, health bar, level up, achievement, XP, and
circle/arrow/box highlights projected onto the real camera) on the final frames in `blender_bridge.py`; set `UI_OVERLAYS=0` to turn the elements off.
`capture.py` writes checked frames atomically; `contact-sheet.py` covers all shots
and the ending, with paginated sheets.

Checks: `python3 test_mix.py`, `test_alignment.py`, `test_stems.py`, `test_capture.py`;
app tests `cartoon-contract`, `cartoon-motion`, `cartoon-manifest`,
`cartoon-action`, `cartoon-worker-validation`. Worker preparation validates
all clocks, cast, camera tracks, worlds and events before creating scene files.
`test_sheet.py` verifies ending/action coverage; `test_workflow.py` rejects
changed immutable inputs before rendering. `workflow.py` provides a local
preflight/review/frames/sound/encode flow and rejects unreviewed long rendering.
`actor.js` performs preflight with locked automatic Atlas, offline acoustic
alignment, full-story contact sheets and cloud review. Owner approval rotates
the job capability and submits a distinct finishing stage with the same locked
inputs. Captured frame batches and hashes persist in a private Actor store.
MP4/audio/frame QA must pass before output is uploaded and completed atomically.

Captions, arbitrary props and physical actions outside the declared supported
set remain unsupported; the director must reject unsupported stories rather
than substitute slideshow images. Acoustic timing always requires owner review.
Automatic resubmission of failed/ambiguous jobs is prohibited. Full-length cloud
completion/playback remains a release-verification gate until the real test
finishes; new cartoon submissions remain disabled until then. The full 1,010-frame
33.67s local MP4 passed QA after oversampled limiting corrected AAC true-peak
overshoot; this is not proof of hosted completion. No speed promise is made.
A local steady-state ten-frame test took
7.26 seconds excluding startup; hosted timings differ materially.
## Activities: the characters do what the script says (Nov 2026)

`blender/activities.py` reads each line of narration and decides the activity (cook, eat, drink, drive, ride, type, write, read, phone, photo, dig, sweep, paint,
fish, throw, kick, punch, dance, hug, handshake, climb, sleep, bow, wave, think, cry, laugh... about 50). Each activity names its **motion**, the **items in the hands**,
the **furniture** it needs, a **vehicle** if any, and the **place** it belongs in. `art_director.py` applies the plan:

* `blender/activity_motion.py` holds the poses (pure maths): torso lean, head nod and turn, seated variants, hands that reach what they should. Gestures ease in and out;
  nothing shakes. `character_motion.pose(action, t, seat)` is the single entry point and `finish()` clamps reach and solves elbows and knees.
* `blender/hand_props.py` builds the held items (pan, spatula, knife, phone, book, pen, shovel, broom, camera, rod, guitar...) on the wrist anchors.
* `blender/rigs.py` builds the open cartoon car, the bicycle and the ladder; wheels turn with the distance driven and the rider travels with the vehicle (`cast.to`, `rigs[].to`).
* the shot schema gained `cast.holds`, `cast.seat`, `cast.to`, `rigs` and accepts any library model as a `props` entry.
* when the planner's place does not suit a clear activity (cooking on a beach), the director switches to the recipe that does (`kitchen`).
* tests: `test_activities.py` (lexicon + every pose reachable/finite/calm), `test_activity_director.py` (sentence -> staged shot). Visual check: `mk_acts.py` + `render_acts.sh` in the scratch folder.
* adding an activity: one entry in `ACTIVITIES` (words + motion + props), one pose function in `activity_motion.ACTIVITY_POSES`; the tests fail if a prop or model does not exist.

## Documentary renderer: long-form videos made of pictures (Nov 2026)

Long videos ("Own images") used to be recorded in real time in a browser. They are now drawn by `documentary/` on the same Azure fleet (`actor.js` hands any job whose
manifest `kind` is `documentary` to `documentary-worker.mjs`). Same callback protocol as the picture assembler (`progress` / `failed` / `done`), the MP4 goes to the signed upload URL.

* **Plan, not seconds.** `src/lib/documentary/` plans *beats* named by words (`scene, w0, w1`); the worker aligns each recorded take with the pinned CTC model (`doc_align.py`,
  speech-span fallback if the model cannot) and `doc_timeline.py` turns word ranges into exact times, splicing planned pauses into the narration. A beat starts on the word it illustrates.
* **Visuals.** `doc_camera.py`: Depth Anything V2 Small (Apache-2.0, ONNX, pinned by hash in the Dockerfile) gives every picture a depth map and the camera moves *through* it
  (push, pull, pan, tilt, orbit, punch, drift); no model = flatter camera, never a failure. `doc_cards.py` + `doc_geo.py` draw numbers that count up, timelines, maps with
  coastlines (Natural Earth 1:50m, public domain, `documentary/land.json` from `tools/build-land.py`) and animated routes, bar comparisons, quotes, documents, key facts, step chains,
  chapter and title cards, lower thirds, date stamps and source tags - all from exact data. `doc_fx.py`: colour grade by mood, vignette, grain, dust, light leaks, cross / dip / whip / flash.
* **Sound.** `doc_audio.py`: a music bed per chapter (sound_lib, deterministic), ducked under the voice, hush before reveals, risers / hits / whooshes from the plan, optional ambience,
  two-pass EBU R128 loudness (-15 LUFS). Directed narration: take boundaries follow chapters and each take is read in its chapter's mood (`narration-direction.ts`).
* **Speed.** Frames are independent: pieces of 150 frames are claimed through the job's blob store by every replica (3 lanes each); alignment (per take), depth (per picture) and the
  soundtrack are claimed the same way; one replica joins the pieces (stream copy) and uploads. A dead assembler is replaced after 12 minutes; the watchdog restarts a stopped job and the
  new machines reuse every saved piece.
* **Grounding.** A card shows only what the narrator says: `plan-visuals.ts` checks every number against `spoken-numbers.ts`, quotes/key facts/steps/documents against the narration,
  timeline years and compare values against spoken numbers, place names against the narration, coordinates by range. Anything else is dropped and the beat becomes a picture.
* **Tests.** `test_documentary.py` (26 tests incl. a tiny end-to-end encode), `src/test/documentary-*.test.ts`. Smoke on Azure: `tools/selfcheck.py` (step "documentary renderer") and a
  `DOC_TEST=1` job (see `documentary-worker.mjs`; test-only, never set on production jobs).
