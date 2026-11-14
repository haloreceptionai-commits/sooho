# Advanced Video AI — benchmark-led movement, visuals and sound upgrade

## Goal and scope
Improve **Advanced Video AI only**: literal actions, accurate actors/objects, believable places, clear speech and purposeful sound. Protect other engines, long-form and saved/recoverable work.

The reference uses simple articulated flat characters in detailed 3D scenery—not realistic human models. Match physical clarity and staging. “10/10” remains an ambition, not a guaranteed score.

## What was actually inspected

- Uploaded **How Mine Salting Worked** video and separate audio: 1080×1920, 30 fps, **61.115 seconds**. Audio transcribed after converting the M4A because the document reader rejected that container.
- Latest completed Advanced video in the cloud: **How Your Phone Finds You From Space**, **40.44 seconds**, requested 40 seconds. Downloaded privately for inspection; not confused with an earlier test.
- Also checked the saved Emu revision.
- Inspected full-story sheets, 4 fps action sequences and movement/camera/speech/sound code.
- Approximate transcript pace: reference **231 words / 227 wpm**; latest **119 words / 177 wpm**. Transcription can mishear a word, so these are approximate, not word-exact alignment measurements.
- Final-mix loudness: reference **−14.55 LUFS**, latest **−14.43 LUFS**, Emu **−14.47 LUFS**. True peaks: **−2.16**, **−2.77**, **−2.40 dBTP** respectively. Loudness range: **2.3**, **1.5**, **2.6 LU**. Our sound is not simply too quiet.
- No isolated reference voice/music stems were supplied. These measurements do **not** establish its voice identity, music-to-voice ratio, exact EQ or perceived voice quality. Those require listening comparisons; no invented claims about those properties.

## Verified weaknesses

- **Action, not image sharpness:** benchmark 0–3 s shows loading, aiming and gold entering rock. Our 10–13 s shows stationary/waving figures then a microphone portrait. Four card poses and whole-body bounce cannot perform hand/object interactions; different verbs map to the same reach picture.
- **Wrong visual subject:** reference gun, gold, pan and magnifier drive the shots. Our phone/satellite explanation becomes people and a chip mascot. Object cards are placed on the ground with motion `none`; library assets cannot be held.
- **Broken framing:** our 14–20 s includes shoes, floor and partial bodies; Emu includes clipped faces and a large white model. Inserts use assumed offsets, not rendered target bounds; moving performers are not fitted throughout the camera path.
- **Generic places:** benchmark has coherent mine timbers, rails, lamps and exterior. Our phone story switches between town/castle, field and classroom. Current vocabulary lacks modern streets, mines and mechanism cutaways.
- **Unclear language:** “four space clocks,” “weak sky,” “lonely GPS,” “one cross shouts” and repeated “from space” are short words but confusing sentences. Mandatory hero/rival slots produce irrelevant personas in explainers.
- **Delivery:** our measured pace is slower; one global fast/relaxed instruction cannot express each beat. No claim about exact reference voice identity or subjective sound quality is verified by transcription alone.
- **Placeholder sound:** synthesized pad/tone/noise, keyword triggers such as `gold → coin`, constant half-voice-RMS music gain and no speech ducking. No connection to hand/object contact.
- **Smaller distractions:** repeated shock/cheer, narration-driven bouncing, automatic shot alternation and repeated sparkle/reveal bursts convey no physical consequence.

## Implementation plan

### 1. Repair framing first, without buying new assets

- Give every shot an explicit actor/object/mechanism target using actual world-space bounds and anchors.
- Fit camera start/middle/end, walking paths and required participants; keep objects/contact visible.
- Remove automatic close-ups and flashes without a useful detail or real visible change.
- Check rendered obstruction, offscreen targets and empty/cropped inserts; repair framing before full rendering.
- Re-render saved Phone/Emu scenes using existing voice/art.

### 2. Replace generic direction with a literal action contract

For each scene record **who does what, to which object, where, what changes, and on which spoken word**. Example: hand puts gold into open gun → gun closes → aim toward rock → recoil → gold hits rock. An “idle” actor plus a nearby gun is not a valid substitute.

- Check actual drawable interactions and library IDs before media spend.
- Resolve nouns by identity/role; do not invent human mascots for tools, threats or satellites.
- Track prop ownership, hand attachment, scale, orientation and state across cuts.
- Unsupported mechanisms need an honest supported demonstration or a limitation shown before spend—not a silent generic substitute.

### 3. Add articulated performances, not more whole-body pose pictures

- Version the Advanced performance manifest; preserve historical card jobs.
- Prototype segmented head/torso/arms/hands/legs with validated pivots and face/mouth layers; reuse identity textures and deterministic joints.
- Add ground contact, walk/run, gaze and anticipation → contact → reaction → settle. Remove narrator hops; mouth animation follows dialogue.
- Implement and render each action **before** adding it to shared vocabulary: hold/aim/recoil; load/transfer; pick up/place; inspect/pan; strike; light/throw; simple device tap and mechanism reveal. Add animal-specific locomotion rather than stretching a human walk onto an emu.
- Use hand/tool anchors, limited inverse kinematics, throw trajectories and visible state changes; direct reactions toward the event.
- Inspect the prototype before full cast generation; validate masks, joints, missing parts and identity.

### 4. Improve objects and environments with the library we already own

- Use real 3D assets for manipulated/rotating objects; cards for non-interacting detail.
- Render model turntables to check scale/materials/orientation/bounds; diagnose white/blocky models rather than guess a tint.
- Add mine interior/exterior and modern street/device cutaway modules with appropriate context, materials, shadows and depth—not random clutter.
- Share coordinates and lighting for actors, objects and contact anchors; keep the mechanism readable.

### 5. Make script and voice follow the same action beats

- Keep Puck Shorts and Charon long-form; no cloning or provider change.
- Separate history and explainer outlines; explainers need no invented rival/failures. Preserve motives, cause/effect and facts.
- Check complete everyday sentences and comprehension, not only rare words; preserve factual qualifiers and label illustrative fiction.
- Repair hook/transitions/repetition and length without restoring length-only failures or truncating paid voice.
- Audition current versus beat-aware curious delivery with contrast pauses, dialogue and payoff emphasis. Try **200–225 wpm**, not a mandatory speed for every topic/age.
- Measure duration, words, pauses and pace; align the continuous take once; preserve it during recovery.

### 6. Replace the placeholder sound bed with event-based sound design

- Add licensed/CC0 Foley/music with provenance: surface footsteps, handling, pan/metal, vehicles, rock and device taps. Do not copy the reference soundtrack.
- Separate ambience/music/contact/transitions. Sync Foley to visible contact and aligned speech where appropriate; remove noun-only triggers such as gold → coin.
- Use tension/discovery/payoff/silence, speech ducking and event gain/pan envelopes—not louder global mixing.
- Preserve the speech clock and final loudness/peak QA. Compare matched-loudness mixes on speakers/headphones; reference stem balance is unknown.

### 7. Quality and speed must survive normal user runs

- Preserve checkpoints, paid-step idempotency, cancellation, recovery and old manifests. Automatic QA adds no manual preview stop.
- Cache rigs/sets/sounds; paint only used layers with bounded concurrency. Retain 23-way rendering; measure startup, slowest batch, assembly and encoding.
- Do not enable the unverified durable coordinator or replace the renderer.
- **60 s in 2–3 minutes remains unproven.** Measure cold/warm click-to-playable time; retain alignment/resolution and report failures honestly.

## Technical work

Version Advanced-only changes across direction/schema/vocabulary, rig preparation, action/camera/frame rendering and audio mixing. Keep worker validation and app schemas synchronized. Add concrete tests for attachments, action states, noun mapping, framing, cue timing, headroom, legacy manifests and recovery. Run app/worker tests before rebuilding Azure images.

## Verification and acceptance

1. **Local 8–12 s mechanism test:** segmented character + manipulation + close-up + consequence. Inspect beginning/contact/end frames and real motion, not a flattering poster frame.
2. **Controlled Phone regression:** show a phone, signal timing and location change instead of people on a lawn; compare the repaired shots to the saved original.
3. **Full 60 s benchmark-style historical Short:** coherent location, motivated action, inspection and payoff; fact-check the story and do not reuse the reference's script as our factual source.
4. **Different-topic repeat and interruption:** another normal Create run, resume after browser closure at supported stages, verify finished MP4 reads back through My videos. A single curated test is not reliability proof.
5. Publish and verify production before declaring deployment complete.

Report actor/object coverage, contact/cue timing, framing incidents, clarity, word accuracy/wpm, audio levels, duration, paid calls and stage timings. Proposed checks: targets visible at start/contact/end; no empty inserts or missing required props; synchronized contact cues within 3 frames where speech-linked; complete narration; 1080×1920 at 30 fps.

Compare side by side at matched loudness and obtain the owner's assessment. Automated scores cannot certify engagement or “10/10.”
