# Advanced Video AI — benchmark-led movement, visuals and sound upgrade

## Goal and scope
Make each spoken action visibly happen with the right actor and object, in a believable story location, with clear Short-form narration and purposeful sound. Improve **Advanced Video AI only**; protect Own images, Own cartoon, long-form narration, saved work, and safe render recovery.

The reference's strength is not a photorealistic human: it uses simple flat characters with articulated limbs inside detailed 3D scenery. Match its **clarity, physical interactions, object detail, staging and editing**, rather than spend on more detailed stationary portraits. “10/10” is an ambition, not a result that a prompt or an automated score can guarantee.

## What was actually inspected

- Uploaded **How Mine Salting Worked** video and separate audio: 1080×1920, 30 fps, **61.115 seconds**. Audio transcribed after converting the M4A because the document reader rejected that container.
- Latest completed Advanced video in the cloud: **How Your Phone Finds You From Space**, **40.44 seconds**, requested 40 seconds. Downloaded privately for inspection; not confused with an earlier test.
- Earlier **Emu War** revision checked as a second regression example.
- Full-story frame sheets, plus 4 frames/second action sequences from the benchmark opening and arrival sequence, and our latest video's 10–13 second sequence; renderer, direction, camera, speech and sound code inspected.
- Approximate transcript pace: reference **231 words / 227 wpm**; latest **119 words / 177 wpm**. Transcription can mishear a word, so these are approximate, not word-exact alignment measurements.
- Final-mix loudness: reference **−14.55 LUFS**, latest **−14.43 LUFS**, Emu **−14.47 LUFS**. True peaks: **−2.16**, **−2.77**, **−2.40 dBTP** respectively. Loudness range: **2.3**, **1.5**, **2.6 LU**. Our sound is not simply too quiet.
- No isolated reference voice/music stems were supplied. These measurements do **not** establish its voice identity, music-to-voice ratio, exact EQ or perceived voice quality. Those require listening comparisons; no invented claims about those properties.

## Verified weaknesses, large and small

| Priority | Benchmark evidence | Our evidence and cause |
|---|---|---|
| Critical: action is replaced by posing | 0–3 s: gun changes orientation, loading is shown in close-up, gold travels toward the wall. Later: pan, inspection, payment, dynamite and discovery are distinct physical events. | At 10–13 s our phone story shows three waving/standing figures, then a microphone portrait. Cards have stand/reach/shock/happy images, whole-body squash and bounce; no hand-object contact or changing object state. Many different verbs map to the same reach picture. |
| Critical: spoken object is not the visual subject | The mine, gun, gold, pan, magnifier and money drive the shots. | Phone, satellite timing and location solving are largely replaced by generic people and a smiling chip mascot. Object cards are placed on the ground with motion `none`; asset objects cannot be held. |
| Critical: camera hides information | Opening inserts show the mechanism; group views establish the mine and arriving car. | Latest sampled shots around 14–20 s show shoes, blank floor and partial bodies. Emu also has clipped faces and a large white model. Camera insert targets are assumed offsets, not the actual rendered bounds; moving cast is not included in the full camera path fit. |
| Major: locations are generic | Mine timbers, rails, rough rock, tools, lamps and exterior approach establish one coherent place. | A phone explainer switches between castle/town, generic field and classroom. Current world vocabulary cannot represent a modern street, a mine interior or a technical cutaway accurately. |
| Major: script sounds constructed | Reference opens with a concrete action; motivations, dialogue, inspection and a physical final surprise carry the explanation. | Latest contains “four space clocks,” “weak sky,” “lonely GPS,” “one cross shouts” and repeated “from space.” Short words alone have not made the sentences clear. An invented “Threat” character and mandatory story slots encourage irrelevant people/metaphors in an explainer. |
| Major: delivery cannot follow beats | Benchmark is substantially faster by transcript pace. | Shorts already use the owner's Puck voice, same as Own cartoon, but have one global instruction: fast, nearly nonstop, relaxed. No measured per-beat pace or pause plan. Faster alone will not fix unnatural writing. |
| Major: sound describes keywords, not contact | Benchmark depicts loading, firing, driving, panning and detonation—distinct events needing different sounds. | Current sounds are synthesized tones/noise; automatic triggers include `gold → coin` and generic impacts. Music is a sustained synthetic pad with one reveal change. Constant music gain targets half the voice RMS; no speech ducking. |
| Smaller: arbitrary reactions/effects | Reactions follow the action and preserve recognizable characters. | Repeated shock/reach/cheer, narration-driven bouncing even when a character is not speaking, sparkle bursts across several “reveal” beats, and automatic camera alternation create movement without meaning. |

## Implementation plan

### 1. Repair framing first, without buying new assets

- Give every shot an explicit focus target: actor, held object, world object or mechanism. Use actual world-space bounds and anchors for that target.
- Fit start, middle and end camera positions against the vertical frame, including walking paths and all required participants; keep the contact point and object visible.
- Remove blind insertion of close-ups merely because three previous shots were wide. A close-up must reveal a useful detail. Avoid sparkle/reveal flashes unless there is a real visible change.
- Add rendered checks for foreground obstruction, offscreen targets, empty inserts and unusable crops. Repair the camera deterministically before rendering the full video.
- Re-render representative saved Phone/Emu scenes to isolate this improvement; reuse voice and art rather than repay for them.

### 2. Replace generic direction with a literal action contract

For each scene record **who does what, to which object, where, what changes, and on which spoken word**. Example: hand puts gold into open gun → gun closes → aim toward rock → recoil → gold hits rock. An “idle” actor plus a nearby gun is not a valid substitute.

- Build a capability check from the actual engine/library before media spend. Select only drawable interactions and real asset IDs.
- Resolve nouns by role and identity, not just a keyword. Do not turn a tool, threat, phone or satellite into an unrelated human mascot unless the story intentionally calls for it.
- Track prop ownership, attachment, scale, orientation and persistent state across cuts; attach a held object to a particular actor and hand.
- If a mechanism is not supported, use an explicit supported object-focused demonstration, or show the limitation before paid work. Do not silently substitute a generic setting or claim the missing action happened.

### 3. Add articulated performances, not more whole-body pose pictures

- Introduce a versioned Advanced performance manifest alongside existing manifests. Keep the older card path intact for historical jobs.
- Prototype one segmented character: head, torso, upper/lower arms, hands and legs with validated pivots, face/mouth layers and consistent proportions. Reuse painted identity/textures; animate joints deterministically.
- Add ground contact, walk/run cycles, gaze and deliberate anticipation → action → contact → reaction → settle. Disable random narrator-driven hops; mouth/face animation is tied to actual dialogue.
- Implement and render each action **before** adding it to shared vocabulary: hold/aim/recoil; load/transfer; pick up/place; inspect/pan; strike; light/throw; simple device tap and mechanism reveal. Add animal-specific locomotion rather than stretching a human walk onto an emu.
- Use attachment anchors and limited inverse kinematics for hands/tools, trajectories for thrown items, and visible object state changes. Reactions must target the event and face the correct subject.
- Approve this local prototype visually before generating a full cast. Do not presume AI-generated body layers have usable joints; validate alpha masks, missing parts and identity first.

### 4. Improve objects and environments with the library we already own

- Prefer real 3D assets for tools and objects that must rotate or be manipulated; retain painted cards for background or non-interacting detail.
- Validate imported model scale, materials, orientation, bounds and silhouette in a small rendered turntable. Fix the white/blocky appearance through that check, not a guessed tint.
- Add reusable story-appropriate modules starting with mine interior/exterior and modern street/device cutaway. Match real context, readable materials, contact shadows and depth; do not add random clutter to hide empty shots.
- Render objects, action anchors and scenery together in the same coordinate system. Lighting must unify painted actors and 3D props without darkening the thing being explained.

### 5. Make script and voice follow the same action beats

- Keep Puck for Shorts and Charon for long-form; no voice cloning, provider replacement or hidden narrator change.
- Separate narrative-history and mechanism-explainer outlines. Explainers do not need an invented hero, rival and two failed attempts; history Shorts keep motives and cause/effect without inventing events.
- Replace vague compressed metaphors with everyday complete sentences. Check comprehension, not merely a rare-word count. Preserve factual qualifiers and explicitly distinguish an illustrative story from documented events.
- Rewrite awkward hook/transition/repetition locally and preserve all necessary facts. Keep existing length repair; do not restore the “too long—video failed” rule or truncate paid voice.
- Start a speech-only comparison using a short, approved simple script: current delivery versus beat-aware curious delivery with brief contrast pauses, dialogue distinction and payoff emphasis. Treat roughly **200–225 wpm** as an audition range informed by this reference, not a required speed for every topic or age group.
- Measure realized voice duration, word accuracy, pauses and speech pace. Align the approved continuous take once and build picture/contact timing from it. Do not change a locked take during recovery.

### 6. Replace the placeholder sound bed with event-based sound design

- Add licensed/CC0 reusable Foley and music with attribution/provenance: footsteps by surface, handling/clicks, pan/metal, vehicle, rock, device taps and appropriate impacts. Do not copy the reference soundtrack or assume reuse rights.
- Separate ambience, music, physical contact and transition sounds. Trigger physical Foley at the same contact frame as the visual action, tied back to its aligned spoken cue where appropriate. Remove noun-only triggers such as gold automatically making a coin sound.
- Use tension, discovery, payoff and silence deliberately; a reveal is not always a loud sparkle. Add speech-aware ducking and per-event gain/pan envelopes rather than increasing the whole mix.
- Preserve the accepted speech sample clock and final measured loudness/peak checks. A/B the new mix at matched loudness; test on phone speakers and headphones. Exact reference stem balance remains unmeasured.

### 7. Quality and speed must survive normal user runs

- Keep private storage checkpoints, idempotent paid steps, cancellation, worker recovery, version compatibility and Advanced's no-manual-preview workflow. Internal QA is automatic; it is not a new owner approval stop.
- Cache reusable rigs, environments and licensed sounds. Paint only story-specific art and layers actually used, with bounded image concurrency. Preserve 23-way frame rendering and measure the slowest batch, startup, assembly and encoding separately.
- Do not switch on the still-unverified durable coordinator or replace the renderer as part of this quality change.
- The existing **2–3 minute 60-second** target remains open. Record cold/warm generation time from click to saved playable MP4; do not promise it until measured. Do not save time by skipping alignment, reducing resolution or disguising failures.

## Technical work areas

- Direction/contracts: `pipeline-operations.server.ts`, `story-v2.ts`, `cartoon-job.ts`, `cinematic-pass.ts`, shared `vocabulary.json` and worker validators.
- Art/identity: `advanced-cards.ts`, object-library retrieval, library normalization and new Advanced rig preparation.
- Frame rendering: `scene-story.mjs`, `scene-world.mjs`, `build-manifest.py`, camera/action helpers and frame QA.
- Sound: narration instructions, `stems.py`, `mix.py`, `workflow.py`, `finish.py`; version new behavior so saved manifests remain valid.
- Add focused tests for concrete action states, attachments, noun-to-asset mapping, framing bounds, cue timing, mix headroom, legacy manifests and recovery. Run both project and worker tests; rebuild Azure images only after local checks pass.

## Verification and acceptance

1. **Local 8–12 s mechanism test:** segmented character + manipulation + close-up + consequence. Inspect beginning/contact/end frames and real motion, not a flattering poster frame.
2. **Controlled Phone regression:** show a phone, signal timing and location change instead of people on a lawn; compare the repaired shots to the saved original.
3. **Full 60 s benchmark-style historical Short:** coherent location, motivated action, inspection and payoff; fact-check the story and do not reuse the reference's script as our factual source.
4. **Different-topic repeat and interruption:** another normal Create run, resume after browser closure at supported stages, verify finished MP4 reads back through My videos. A single curated test is not reliability proof.
5. Publish and validate the production workflow before calling deployment complete.

Report per test: named actor/object coverage, rendered action/contact timestamps, offscreen/obstructed target incidents, sentence clarity notes, word accuracy and wpm, audio levels/peaks, duration, paid calls and wall-clock stage timings. Proposed engineering checks: required action targets visible at start/contact/end, no empty mechanism inserts, contact/cue synchronization within 3 frames where tied to an aligned word, no missing required props, full narration retained, 1080×1920 at 30 fps.

Finally compare side by side at matched sound levels and ask for the owner's assessment of action clarity, visual accuracy and voice. Automated script scores cannot certify viewer engagement or a “10/10” outcome.