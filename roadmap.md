# Roadmap — Cartoon Engine v2

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
