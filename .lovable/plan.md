# Own video engine — complete cartoon pipeline plan

## Goal and scope
Replace **new Own-model Shorts** with genuine code-driven cartoon acting in painted, inked 3D worlds—not camera movement over still images. Keep automatic Atlas narration, the four existing pages, owner-only access, permanent private cloud saving, and existing Omni/Seedance behavior.

This is a plan, not an implemented or tested upgrade. The uploaded **cartoon-audio-short** specification is the target; its ZIP is a prototype requiring repairs. Approval covers the explicit adaptations below, not an assertion that its current code works.

## Review completed
Read the entire SKILL.md and all 13 text files in the ZIP; inspected all 14 panels of the supplied stills sheet. Coverage: README; engine/index.html, main.js, motion.js, paint.js, roman.js; tools/setup.sh, timing.py, render.mjs, sheet.py, finish.sh; example/soldier/story.js and audio.py. Compared these against current generation, Story Engine v2, narration, renderer, hosted submission/callback, storage and tests.

### Blocking findings
- **Missing:** mix.py, vendored Three.js and toon.ts, pinned dependencies/licenses, example narration and timing artifacts. The sample animation cannot be reproduced exactly from this upload alone.
- Setup downloads an unpinned cast library, writes into the supposedly read-only kit, omits finish.sh, suppresses errors, and assumes a type-stripping API/global Playwright install without checking them.
- audio.py uses a fixed 592-frame duration, edits narration, ducks music, saturates the mix and exports no separate stems. It does not implement the specified 50% audio relationship.
- finish.sh uses dynamic loudnorm rather than one measured linear gain; QA only prints failures, and its sheet covers at most the first 20 seconds.
- Timing estimates words from syllables, ignores script discrepancies after transcription, can fail on silence/impossible alignment, and has broken option parsing. It cannot establish three-frame accuracy.
- The world is a hardcoded Roman bridge scene, not a general story engine; the example does not use mandatory idle motion for every actor.
- Camera helpers mislabel uniform splines as centripetal, lose metadata during interpolation and allow unbounded FOV creep. The ink shader has reversed smoothstep bounds; focus distance uses the wrong depth metric.
- Resume trusts filenames alone. Frame requests, local file serving, output paths and generated executable stories lack production-safe validation.
- Current Own generates stills and retimes Atlas in a shared real-time editor. Hosted assembly starts only after media generation and has a 20-minute Actor timeout/30-minute capability lifetime, unsuitable for the kit’s stated frame cost.

## Explicit adaptations and precedence
1. **Intake:** your selected choice is automatic Atlas, not mandatory voice upload. Topic selection remains on Create; Remix keeps using the transcript only as research. No narrator picker or new page.
2. **Voice:** keep Atlas/Charon and its approved secret-fact energy, targeting approximately 153 WPM at recording time. New Own never trims, time-stretches, tightens pauses or inserts silence after recording. Natural reveal pauses must be spoken into the take. Existing Omni/Seedance pacing stays unchanged. “Unchanged” permits necessary decoding, common final gain/limiter and AAC encoding—not editorial alteration or bit-identical MP4 audio.
3. **Script:** use Atlas’s word budget, not the kit’s 3.7 words/second. Keep factuality, simple English, one continuous story, escalation, analogy and final payoff. Version timing/shot rules so a short script is not forced through incompatible fixed time windows; retain the 85-point readiness threshold and fail required checks before media spending.
4. **Text:** new Own defaults to no captions and no opening overlay. Explicit opt-in captions remain available; diegetic signs are allowed and checked for correct orientation. Do not change caption preferences for other engines or penalize permitted caption absence in QA.
5. **Framing:** permit the kit’s immediate-action medium close-up when it makes the hook literal and clear; retain varied wide/action/insert/reaction views, early and final money shots, and bright readable lighting. No automatic hard cut every three seconds: continuous camera movement takes precedence; cuts/flash transitions serve place/time changes.
6. **Ideas:** the existing large sourced topic catalog remains. A kit-format set of exactly ten ideas, with title/hook/twist/visual moments/true-or-legend status, is produced on explicit request within Create—not ten new API calls on every visit. Ten hooks for one topic are not misreported as ten ideas.
7. **Long-form:** the supplied kit only establishes vertical shorts. Preserve the legacy Own long-form path until the same new engine passes horizontal framing, chapter continuity, resource and full-duration tests. This limitation stays visible; long-form migration is a separate gated deliverable below, not a silent fallback.

## End-to-end steps — none optional unless stated

### 1. Package and prove the engine
Preserve an untouched reference copy; build a clean, pinned runtime with Three.js r160, a verified compatible toon source commit, Playwright/Chromium, supported Node, Python/numpy/Pillow, FFmpeg and fonts. Include dependency hashes, lockfiles and MIT notices after license verification. No downloads, git clones or kit mutation during a video job.
Fix setup copying/version/path handling and use isolated temporary directories. Missing cast dependencies are a blocker, not a placeholder implementation. First render a small reference fixture proving shader compilation, colour space, cards, ink, shadows and DOF.

### 2. Accept input and reserve one durable job
Validate owner, topic, format, length, settings and duplicate-topic history. Save immutable input/profile/version snapshots and a logical job **before the first paid call**. Repeated clicks return the same accepted job. The browser observes progress; it does not own execution.
States: queued → research → script → validation → voice → alignment → shot plan → look check → frames → stems/mix → encode → QA → save → done. Include needs-review, paused, submission-unknown, failed and cancelled states with concrete reasons.

### 3. Verify the story, then write it
Keep Azure gpt-5 and existing request behavior/model selection; do not switch providers. Retrieve and inspect source evidence: an AI-generated list of links is not verification. Store claim excerpts, URLs, historical status and uncertainty. Require corroboration for core facts; label legend/disputed accounts plainly. Never use the soldier example as historical proof.
Use ten scored hooks, an original chronological script and the kit’s hook → setting → escalating beats → mechanism/pivot → ironic final payoff. Enforce no graphic/political stories, real named living characters, logos or mascots. Remix must not copy wording or recreate another creator’s shots.
Run deterministic validators and required blind judges; permit at most two targeted repairs. Stop on unresolved required failures or unavailable required judging—no null judge, approximate score or silent pass. Revalidate after all scene transformations. Save script, evidence and reports.

### 4. Record and lock Atlas
Generate one coherent take for a Short, preserving exact approved voice identity/direction and aiming for the selected duration through script length and delivery. Save the original recording, decoded sample metadata and checksum immediately. Check audibility, completeness, transcription/script match and missing/extra words before accepting it.
Once accepted, every later stage follows that take. A duration mismatch requires review or a deliberate new recording, never hidden retiming. Long-form uses complete chapter takes with recorded natural boundaries.

### 5. Align words and derive the clock
Implement script-aware forced alignment using pinned local model weights in the worker; no provider change to narration. Repair CLI parsing, silence detection, number handling, error propagation and impossible-alignment checks. Silence/phrase DP may diagnose alignment, but may not claim word-level precision.
Save confidence and word/phrase boundaries. Low-confidence action words require review, not guessed positions. Use 30 FPS and N = round(decoded duration × 30), rendering exactly frames 0 through N−1. Preserve all audio samples; document the resulting frame-grid difference (up to half a frame) and codec delay instead of promising mathematically identical arbitrary durations.

### 6. Build the shot plan before scene code
Persist a per-shot plan: frame interval, exact spoken words, set, light, camera path/FOV/roll/focus, actor identity/pose/expression/action, props/attachments, secondary effects, and SFX events. Use one phrase per shot where sensible; merge tiny phrases.
Frame zero already shows the hook. Schedule visual reaction onsets 0–3 frames before aligned action words and the final physical payoff on the final spoken word. Use typed, bounded declarative scene data—not executable code returned by the model.

### 7. Construct original worlds and cast
Separate renderer, scene builders, cast, materials, textures, tracks and asset registry. Replace every bridge/temple/helmet/DECK dependency with named scene objects and anchors. Provide reusable ship/sea, town/bridge, workshop/lab and landscape primitives plus extensible original props; unsupported actions/set types stop with a reason instead of reverting to stills.
Preserve painted textures with constant texel density, two-step toon shading, horizon fog and bright story-driven lighting. Generalize outfits/expressions/props beyond Romans; retain 600×1000 design coordinates, sole anchor, 2.25 m scale, yaw-only cards, contact blobs, alpha-tested shadows and rounded redraw keys. Test detachable parts against head/hand anchors. Render a cast test sheet for every new design.

### 8. Make every scene genuinely animate
Use validated centripetal camera paths, eased 18–45-frame glides, bounded creeping holds, intentional rolls/impact shakes and safe collision-free framing. Add anticipation, overshoot and settle to actions; idle, blinking and stressed-word bobs to every actor; planted-foot stance/swing gait; animated water, cloth, dust, leaves and droplets.
Repair shader bounds, camera-space focus, alpha/depth/no-ink contracts, render-state cleanup and resource disposal. Preserve linear half-float colour passes, output conversion, near-side depth-jump ink, crease outlines, card exclusion, distance fade, 48-tap depth-aware DOF and action-centred sun shadows. Unsupported graphics capabilities fail explicitly, not with blank output.

### 9. Look check before the expensive render
Render shot midpoints, boundaries, key actions and transition frames; generate labelled full-story contact sheets. Check faces/props fit 9:16, railings/pillars never hide the hero, cameras avoid geometry, text reads correctly, attachments align, ink is present and focus is correct. Save the sheet privately and show it in the existing job view before full rendering; no new page or required narrator upload.
Automated checks plus visual review gate the render. Low confidence enters needs-review; required failures are fixed and sheets regenerated. Preserve this preflight stage even when earlier stages run automatically.

### 10. Render durable frame ranges
Run Chromium/WebGL and Python/FFmpeg only in the hosted worker, never in app server functions. Capture deterministic frames offline, not through wall-clock MediaRecorder. Pin runtime/seed and test random-access rendering.
Persist input-hashed frame-range checkpoints, dimensions/checksums and verified completion metadata to private storage. Atomic writes and decoded-image checks prevent corrupt/stale files being skipped. Resume only missing valid ranges under the same job; record heartbeat, actual completed frames and resource usage. Stop promptly on cancellation or runtime errors; clean up in finally.

### 11. Synthesize and mix sound exactly
Rewrite audio.py as reusable cue-driven stem generation; remove fixed duration, voice loading, ducking, saturation and end-fade. Generate music.wav and sfx.wav from the locked frame clock and independent cue seeds. Stop the march precisely at the twist, then add the low drone; align whooshes, impacts, creaks, pours and splashes to events.
Implement the missing mix.py with a documented shared gated-RMS measurement. Normalize music to 0.5× voice RMS (−6.0206 dB, displayed as −6.0). SFX targets at most that ratio and peaks at most 0.7× voice peak; lower SFX if both limits cannot be met. Handle silent stems/voice safely. No ducking or compression; store measured gains/ratios. Apply only one common measured linear finishing gain and permitted peak limiter.

### 12. Encode, enforce QA, then save
Validate all N frames and full narration sample coverage before FFmpeg. Encode H.264/yuv420p CRF 17 at 1080×1920/30 FPS, AAC, faststart; no -shortest hiding missing frames. Target approximately −14 LUFS with a −1 dBFS sample-peak ceiling and also measure AAC true peaks; report any unavoidable limiter/loudness trade-off.
Run full-file duration/codec/frame-count/decode, loudness/peak, black-frame and ≥0.4-second freeze checks. Review intentional flashes/holds rather than ignoring detectors. Generate labelled QA sheets across the entire video, including the ending. Save structured results and never mark invalid output Ready. Upload MP4, sheets and reports privately; verify final object metadata/checksum and complete the library record atomically. Playback/download must read the saved cloud file after a fresh browser session.

## Technical delivery and reliability
- Add an Own-only versioned manifest/adapter; preserve legacy assembly manifests, old saved videos and Omni/Seedance code paths. Do not import worker packages into the app bundle.
- Authenticated app controls remain server functions; scoped raw worker callbacks use published public endpoints with in-handler authorization. Worker stage requests use restricted job capabilities, never owner sessions or gateway/service secrets.
- Verify live SQL claims, grants, row locks and cancellation/completion functions before extending them. Retain no-delete rules and protection against stale browser writes.
- Persist each paid operation’s identity/result. A timeout is not proof a call failed: mark ambiguous submissions unknown and reconcile; never automatically recreate Actors or paid AI jobs. Retry only eligible transient failures with bounded backoff; terminal refusals/access/credit problems stop or pause the chain under existing gateway rules.
- Use leases, attempt-scoped paths, bounded resource budgets, cancel checks and idempotent finalization. Output uploaded but callback lost must finalize without rerendering; stale attempts cannot publish.
- Benchmark first: the skill estimates 3–10 seconds/frame, implying **90–300 minutes for a 60-second Short**, before finishing. This is not measured here and cannot support a two-minute promise. Size Actor runtime, leases and renewed signed asset grants to measured budgets; longer sessions increase Apify charges. Present duration/cost expectations before rollout.
- Migrate long-form only after a representative horizontal chapter and a complete multi-chapter video pass framing, alignment, music continuity, chapter checkpoints, full-duration QA and cost limits; do not offer an unverified cartoon long-form path.

## Release gates and tests
1. Missing dependency/setup failure, pinned license/hash checks and clean offline worker startup.
2. Invalid/silent audio, script mismatch, low-confidence alignment, exact N-frame coverage and concrete 0–3-frame event timing.
3. Every required story rule; failed validators/judges stop before voice/media spending; permitted no-caption output does not lose points.
4. Camera/spline bounds, actor idle/gait/attachments, shader/depth/focus and random-order/resumed-frame equality in the pinned runtime.
5. Measured 0.5 RMS ratios, 0.7 SFX peak cap, no retiming/ducking, full narration coverage, codec/duration/black/freeze/loudness QA.
6. Cross-owner/forged/expired callbacks, duplicate clicks, ambiguous submit, cancel-versus-done, corrupt checkpoints, interrupted upload and callback-loss reconciliation.
7. End-to-end original short fixture, then a full approximately 60-second story: inspect motion and sheets, verify audio timing/mix, close the browser during execution, reopen My videos, play and download the persisted MP4.
8. Desktop/mobile progress, preflight sheet, review/error/recovery controls; regression checks for all four pages, Omni/Seedance and old video playback.

**Order:** repair/package reference → durable Own job control → verified script/locked Atlas/alignment → declarative scenes/motion → preflight → resumable frames → exact stems/mix/encode/QA → real cloud-library test → Own Shorts rollout → separately gated long-form migration. No placeholder success states, skipped required checks or silent still-image fallback.
