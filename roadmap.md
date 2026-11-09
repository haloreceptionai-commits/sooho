# Roadmap — Cartoon Engine v2

- [ ] Fix Ink picture/narration matching using measured speech boundaries, literal contextual pictures, and energetic mystery delivery; verify with real audio.

- [x] Fix library ranking: normalized compound IDs, real/rigged models before sprites, exact narration nouns before pack tags, scene-balanced shortlist and conservative grounding before sanitization. Live director selected elephant, Velociraptor and YellowDragon; all loaded in local frame capture; 149 app and 32 Python tests passed. No new full video generated. Asset prominence/framing remains limited by existing cast-first cameras.

- [x] Deploy preflight optimizations: exact vectorized CTC (0.8s vs ~18.5s scalar estimate for 71s audio), two review capture lanes, all review frames checked on saved 67s story. Full Azure acoustic/cold-start speed still needs measurement; no overall speed multiplier claimed.
- [x] Resume failed approved Azure cartoons with the same locked store, rotated callback/output paths and per-attempt assembler. Signed-in Resume test completed an 8.64s output after browser closure, reused saved frames (draw-all 1s, final encode/QA 23.4s), and playback verified; 143 app tests and 32 Python tests passed.

- [x] Background foundation: owner-readable jobs/steps, atomic Start, fenced ownership/checkpoints, individually checkpointed judges, shared server operations, generation coordinator and Azure on-demand job; rollout disabled.
- [ ] Enable full background generation after real closed-browser completion and fault-injection checks. Published worker endpoint now responds correctly (unauthorized calls rejected); rollout remains disabled. Bounded recovery handler is implemented but not scheduled; isolated final-output paths, cancellation-aware callbacks and worker completion checkpoints added. Deploy updated assembly/cartoon workers, implement owner-authorized uncertain-step recovery, and verify real worker/paid-asset failures before rollout.

- [x] Correct false interrupted status across browsers: use cloud update freshness, preserve only actively orchestrated local jobs, no automatic restart; five regression tests and signed-in Dragon Jar display verified.

- [x] Fix Dragon Jar repair defects: eligible hooks only, full-plan repair context, latest-draft progression, blocker-aware selection and mandatory deterministic gates; 122 tests passed, authenticated script-only checks exercised.
- [ ] Confirm Dragon Jar produces a ready script: live script-only trials still failed quality checks; bounded AI rewrites do not yet reliably converge. No media generated and voice unchanged.

- [x] Stage 1: Visual Director (per-sentence props/actors/shot/camera/cues) + manifest v2
- [x] Stage 2: Performance (lip sync on dialogue, 11 expressions, 20 actions, up to 3 actors)
- [x] Stage 3: Props library (42 props, moving set pieces)
- [x] Stage 4: Cinematography (8 shot types, 8 moves, group framing, ~3 s second angles)
- [x] Stage 5: Worlds & effects (9 worlds, animated sea, rain/smoke/fire/sparkle/wind/lightning, moods)
- [x] Stage 6: Captions (white + yellow key word) & 12 sound cue types
- [x] Stage 7: Review sheets labelled with sentence + direction
- [x] Azure end-to-end test (34 s Storm Oil, real Visual Director)
- [ ] Follow-up: preview stage takes ~7 min on one machine; split review frames across machines
- [ ] Follow-up: a real-hand "grab shoulder" contact pose and side-view walking

## Cartoon Engine v3 (reference-level look)
- [x] Dense painted galleon deck (bulwarks, stern facade, striped sails, rigging, barrels, cannons, lanterns, foreground framing)
- [x] Deep-blue storm grade, towering swells, finer rain, open views for wide/sea shots
- [x] Real 3D story objects (ships, wave, barrel, cannon, lantern, chest, anchor, wheel)
- [x] Same density for town/market/castle/camp/lab/landscape
- [ ] Galley interior world
- [x] CC0 object library (~3,000 objects, 31 packs) searchable by the Visual Director
- [x] 30 cast outfits + director casts 2-3 distinct characters
- [x] Quaternius CC0 library: ~2,400 objects, ~230 animated (Poly Pizza skipped: needs account key)
- [ ] Re-try Quaternius packs still blocked by Google Drive limits (animatedguns, modulartrain etc.)
- [ ] One-word captions, reference-scored quality gate

- [x] Finish Kevlar cartoon
- [x] Long-form resume after page close (script + media saved as made)
- [x] Route all new narration through the owner's Azure OpenAI connection, without another-provider fallback (authenticated app call and 7 focused tests checked)
- [ ] Verify and save a test video using Azure narration — blocked: configured gpt-realtime rejects audio/speech; gpt-4o-mini-tts and gpt-audio are not deployed on this connection. Needs a compatible Azure narration deployment or separately verified realtime integration.
- [ ] Cut cartoon render time to 3-5 min (preview 8.5 min on 1 machine, full render 16 min on 10 measured Nov 8) — awaiting owner go-ahead
- [x] Apply Gemini review gaps: hook/analogy/dialogue/payoff rules + twist impact + hook riser; constant beep tone removed (Azure image rebuilt)

## Long-form cartoon + thumbnails (Nov 9)
- [x] 16:9 frame contract through validator, capture, encoder, captions
- [x] Map world: baked relief map, glowing territory sweep, armies, cities, title/years badges
- [x] Map director pass + long-form chunked direction, multi-take narration joined into one track
- [x] Thumbnail generator (2 options, exact-text badges) + YouTube thumbnail upload on publish
- [ ] 5-second Azure long-form test
- [ ] Chapter-level split for 30-45 min renders (single-manifest render tested only at short lengths)

## Ink explainer long-form (Nov 9)
- [x] Ink explainer style + recurring stick-figure hero, default for long-form
- [x] White idea cards with exact hand-lettered text (~1 in 4-5 scenes)
- [x] 6 pictures drawn at once (was 2); voice already records in parallel
- [x] Yellow-word Ink thumbnails in the publish dialog
- [x] Real test video made (3:35, 31 scenes, ~12 min end to end)
- [ ] Final assembly on parallel Azure machines (chapters) — current browser-recorder assembly stretched the video (narration ~1:53, file 3:35)
- [ ] Script length overshoot check for very short long-forms
- [x] Stuck cartoon Short: Azure start failure, auto-restart added
