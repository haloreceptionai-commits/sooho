# Own video engine — full cartoon pipeline plan

## Goal and audit status
Replace new **Own-model Shorts** with real cartoon acting in painted, inked 3D worlds—not camera movement over stills. Keep automatic Atlas, four pages, owner-only access, permanent private cloud videos, and unchanged Omni/Seedance.

Read all SKILL.md and all 13 ZIP text files: README; engine/index.html, main.js, motion.js, paint.js, roman.js; tools/setup.sh, timing.py, render.mjs, sheet.py, finish.sh; example/soldier/story.js and audio.py. Inspected all 14 sample panels. Compared with current generation, Story Engine v2, narration, renderer, hosted callbacks/storage and tests. **Static audit only:** no kit execution, dependency installation or generated test video.

## Blocking gaps to repair—not skip
| Supplied code | Required correction |
|---|---|
| Missing mix.py, vendored Three.js/toon.ts, locks/licenses and example voice/timings | Supply verified dependencies/mixer and reproducible fixtures; missing source remains a blocker |
| setup downloads unpinned cast code, mutates kit, omits finish.sh, hides errors | Immutable offline package, checked runtime APIs, explicit copies, safe path arguments and isolated scratch directories |
| audio.py hardcodes 592 frames, edits voice, ducks/saturates mix; no stems | Voice-derived clock, stem-only synthesis, measured ratio mixer |
| finish.sh uses dynamic loudnorm, prints rather than enforces QA; sheet stops at 20s | Linear mastering, structured enforceable QA and full-duration sheets |
| timing.py guesses words; broken CLI/silence/number/impossible-DP behavior | Script-aware forced alignment and confidence/error gates |
| Roman world hardcoded; actors do not all idle | General worlds/cast/props and required motion |
| Uniform spline mislabeled centripetal, camera loses fields/FOV unbounded; shader/focus defects | Correct interpolation, validated tracks, portable shader and camera-space focus |
| Resume trusts filenames; unsafe asset server/path handling and executable story input | Declarative validated scenes, isolated worker, allowlisted loopback assets and atomic checked checkpoints |
| Current Own retimes Atlas, renders stills; hosted 20min timeout/30min lifetime | Own-only offline adapter; benchmark-aware durable jobs/leases |

## Explicit adaptations for approval
- **Your choice: automatic Atlas**, not mandatory voice upload. Keep approved voice/direction and ~153 WPM at recording time; not the kit’s 3.7 words/s.
- New Own never trims, stretches, tightens pauses or inserts silence into accepted narration. Reveal pause is recorded. Necessary decoding/common final gain/limiter/AAC remain permitted; “unchanged” is editorial preservation, not bit-identical MP4 audio. Other engines keep their pacing.
- Own defaults to **no captions or hook overlay**; explicit opt-in captions remain available on existing pages. Diegetic signs must read correctly. No penalty for permitted caption absence; other-engine settings unchanged.
- Keep sourced catalog, original simple continuous stories, escalation/analogy/payoff and 85 readiness threshold. Version editorial timing/shot rules: allow a literal hook MCU, phrase-driven shots and continuous moves instead of rigid cuts. Required failures stop before paid media.
- On explicit request within Create, offer exactly ten kit-format ideas: 5–8-word title, hook, twist, visual moments and documented/disputed/legend status. Ten hooks for one topic are not ten ideas; never spend on page load.
- ZIP establishes vertical Shorts only. Preserve legacy Own long-form until the separate horizontal/chapter release gate passes; never label legacy output the new cartoon engine.

## Pipeline stages and acceptance gates

### 1. Package and prove
Preserve reference sources. Pin Three.js r160, verified compatible toon commit, Node/Playwright/Chromium, Python/numpy/Pillow, FFmpeg and fonts; verify hashes/licenses and ship offline. Repair setup’s missing copies, API checks, read-only violation and path injection. Missing cast code blocks release. Render a small fixture proving cards, shadows, ink, colour space and DOF before integration.

### 2. Intake and durable reservation
Validate owner/input/length/settings/cloud topic history; save immutable versions and one logical job before paid calls. Duplicate clicks return that job. Browser observes, durable services execute.
States: queued → research → script/validation → voice → alignment → shot plan → look check → frames → stems/mix → encode → QA → save → done; explicit review/paused/unknown/failed/cancelled states carry reasons.

### 3. Research and original script
Keep Azure gpt-5/provider selection. Retrieve source evidence—AI-generated links alone are not verification. Save claim excerpts/URLs/confidence; corroborate core facts and label legends/disputes. Soldier example is not historical proof.
Ten scored hooks → one chronological hook/setting/escalation/pivot/mechanism/ironic-payoff script. Plain English/contractions/spoken numbers; no graphic/political stories, named living characters or mascots/logos. Remix uses research, not copied wording/shots.
Required validators and blind judges run before media; maximum two targeted repairs. Unavailable required judging or unresolved failures stop, not null-pass. Revalidate transformed plans; save reports.

### 4. Record and lock Atlas
One coherent Short take with approved Atlas energy and pace-sized script. Save original/checksum and decoded sample metadata immediately. Verify audible complete narration matches script. Mismatched length enters review or explicit new recording, never hidden retiming. Long-form uses complete chapter takes with recorded natural boundaries.

### 5. Alignment and clock
Script-aware forced alignment with pinned local weights; fix parser, silence/numbers, subprocess errors and impossible alignment. Save word/phrase timings/confidence; guessed phrase allocation cannot certify word precision. Uncertain action words need review.
30 FPS; N = round(decoded duration × 30); frames exactly 0…N−1. Preserve all narration samples; document ≤half-frame grid difference and codec delay instead of promising identical arbitrary durations.

### 6. Shot plan before scene construction
Persist each shot’s frames/words/set/light/camera path/FOV/roll/focus/cast/poses/expressions/props/attachments/effects/SFX. Usually one phrase per shot; merge tiny phrases. Frame zero is hook; reaction starts 0–3 frames before aligned word; physical payoff on final word. Use bounded typed declarative data—not AI-generated executable story code.

### 7. Worlds and cast
Separate renderer/scene builders/cast/materials/tracks/registry; remove bridge/temple/helmet/DECK dependencies. Provide ship/sea, town/bridge, workshop/lab and landscape primitives, extensible original props; unsupported scenes/actions stop, never still fallback.
Preserve painted texel density, two-step toon shading, horizon fog, bright readable beat lighting. Generalize outfits/expressions beyond Romans; keep design/sole anchors, 2.25m scale, yaw-only cards, contact blobs, alpha-tested shadows and rounded redraw keys. Verify detached head/hand props; render every new cast’s test sheet.

### 8. Smooth, living animation and render contracts
Validated centripetal paths, 18–45-frame eased glides, bounded hold creep, purposeful rolls/shakes and safe framing. Every actor: idle/blink/stressed-word bob; actions: anticipation/overshoot/settle/planted gait; secondary water/cloth/dust/leaves/drips.
Fix reversed smoothstep, camera-space focus, alpha/depth/no-ink handling, state cleanup and disposal. Preserve linear half-float/output conversion, near-side depth-jump/crease ink, card exclusion/distance fade, depth-aware 48-tap DOF, action-centred sun shadows. Unsupported capabilities fail explicitly, not blank output.

### 9. Mandatory look check
Render shot midpoints/boundaries/transitions/key actions; save labelled full-story contact sheets privately and show within existing job view before full render. Check vertical framing, hidden hero/faces, camera collisions, mirrored text, attachments, ink/focus. Automated checks plus visual inspection gate release; uncertainty enters review. Fix/regenerate, never skip.

### 10. Hosted resumable frames
Chromium/WebGL/Python/FFmpeg run only in hosted worker. Offline frame capture, not real-time MediaRecorder. Save input-hashed range checkpoints, dimensions/checksums and decoded completeness; atomic writes prevent partial/stale files being skipped. Resume only missing valid ranges of same job. Persist heartbeat/actual progress; cancel promptly; always clean up.

### 11. Exact sound
Rewrite audio.py to export music.wav/sfx.wav only using locked clock/per-cue seeds. Remove voice loading/fixed duration/ducking/saturation/end fades. Stop march exactly at twist, then drone; cue sounds on actions.
Implement missing mix.py with documented gated-RMS method: music = 0.5× voice RMS (−6.0206dB, shown −6.0); SFX ≤0.5× RMS and peak ≤0.7× voice peak. If limits conflict, lower SFX/report achieved ratio. Handle silence; save measurements. No ducking/compression; one common measured mastering gain plus allowed limiter.

### 12. Encode, QA and save
Verify N valid frames/full audio coverage. H.264/yuv420p CRF17, 1080×1920/30FPS, AAC/faststart; no -shortest hiding gaps. Target ~−14LUFS/−1dBFS sample peak; measure AAC true peak and disclose mastering trade-offs.
Enforce decode/codec/frame-count/duration/loudness/black/freeze ≥0.4s checks; review intended flashes/holds rather than ignoring detectors. QA sheets cover full video including ending. Save MP4/sheets/reports privately, verify object/checksum, finalize atomically; fresh-session playback/download confirms delivery. Invalid output cannot be Ready.

## Technical boundaries and reliability
- Own-only versioned manifests/adapter; preserve old outputs/legacy assembly and Omni/Seedance. Worker packages never enter app bundle.
- Owner controls: authenticated server functions. Published raw callbacks: verified attempt/job capabilities. Never give Actor/scene code owner sessions or gateway/service keys; limit assets/egress/scratch/resources.
- Inspect live SQL claims/grants/locks/cancel/expiry before extension. Keep no-delete and stale-browser-write protection.
- Checkpoint paid results. Timeout is not rejection: reconcile unknown submissions; no automatic Actor/paid-job recreation. Eligible transient bounded backoff; existing terminal refusal/access/credit pause rules.
- Leases/attempt paths/idempotent callbacks reject stale completion. Uploaded file with lost callback finalizes without rerender; cancellation arbitrates atomically.
- **Unverified speed:** kit’s 3–10s/frame implies 90–300 minutes for a 60s Short. Benchmark time/memory/cost; size limits/leases/renewed grants accordingly. No two-minute/no-timeout promise; Apify costs can rise.

## Tests and release order
1. Offline dependency/license/hash fixture and missing-file failures.
2. Silent/mismatched audio, alignment confidence, concrete N-frame/0–3-frame events.
3. Every required story rule blocks spending; no-caption scoring; final plan validation.
4. Camera/gait/idle/attachment/shader; same-frame sequential/random/resume equality in pinned runtime.
5. 0.5 RMS/0.7 peak limits, no retiming/ducking, complete voice and full-file QA.
6. Cross-owner/forged/expired callbacks, duplicate clicks, ambiguous start, cancel/done race, corrupt checkpoint, upload/callback loss.
7. Original fixture then ~60s story: inspect motion/sheets/audio; close browser mid-execution, reopen library, play/download saved MP4; desktop/mobile and other-engine regressions.
8. Long-form gate: horizontal chapter then complete multi-chapter output; continuity/music/alignment/checkpoint recovery/full QA and measured costs before migration.

Order: repair/package → durable jobs → verified script/locked Atlas/alignment → scenes/motion → preflight → frames → mix/encode/QA → cloud end-to-end proof → Own Shorts rollout → gated long-form migration. No placeholder success, skipped required gate or silent slideshow fallback.
