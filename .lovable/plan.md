# Own video engine — full cartoon pipeline plan

## Goal and audit status
Replace new **Own-model Shorts** with real cartoon acting in painted, inked 3D worlds—not camera movement over stills. Keep automatic Atlas, four pages, owner-only access, permanent private cloud videos, and unchanged Omni/Seedance.

Read all SKILL.md and 13 ZIP text files: README; engine/index.html/main.js/motion.js/paint.js/roman.js; tools/setup.sh/timing.py/render.mjs/sheet.py/finish.sh; example/soldier/story.js/audio.py. Inspected all 14 sample panels and compared current pipeline/security/storage/tests. **Static audit only; nothing executed or generated.**

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
- No trimming/stretching/pause edits after Atlas acceptance; record reveal pauses. Decoding/common mastering/AAC are permitted, not bit-identical audio. Other engines keep pacing.
- Own defaults to **no captions or hook overlay**; explicit opt-in captions remain available on existing pages. Diegetic signs must read correctly. No penalty for permitted caption absence; other-engine settings unchanged.
- Keep sourced topics/simple original stories/escalation/analogy/payoff/85 threshold. Version editorial rules: literal hook MCU, phrase-driven shots/continuous moves. Required failures stop paid media.
- On explicit request within Create, offer exactly ten kit-format ideas: 5–8-word title, hook, twist, visual moments and documented/disputed/legend status. Ten hooks for one topic are not ten ideas; never spend on page load.
- ZIP establishes vertical Shorts only. Preserve legacy Own long-form until the separate horizontal/chapter release gate passes; never label legacy output the new cartoon engine.

## Pipeline stages and acceptance gates

### 1. Package and prove
Pin Three.js r160, compatible verified toon commit, Node/Playwright/Chromium, Python/numpy/Pillow, FFmpeg/fonts; verify hashes/licenses and ship offline. Repair setup/copy/API/path/read-only failures. Missing cast code blocks release. Prove cards/shadows/ink/colour/DOF with a small fixture.

### 2. Intake and durable reservation
Validate owner/input/length/settings/cloud topic history; save immutable versions and one logical job before paid calls. Duplicate clicks return that job. Browser observes, durable services execute.
States: queued → research → script/validation → voice → alignment → shot plan → look check → frames → stems/mix → encode → QA → save → done; explicit review/paused/unknown/failed/cancelled states carry reasons.

### 3. Research and original script
Keep Azure gpt-5. Retrieve evidence, not just AI-suggested links; save excerpts/URLs/confidence, corroborate facts, label legends/disputes. Soldier example is not historical proof.
Ten scored hooks → chronological hook/setting/escalation/pivot/mechanism/payoff. Plain English/contractions/spoken numbers; no graphic/political stories, named living people or mascots/logos. Remix never copies wording/shots.
Required validators/judges before media; at most two repairs. Missing judges/unresolved failures stop. Revalidate transformed plans; save reports.

### 4. Record and lock Atlas
One coherent Short take, approved Atlas energy and pace-sized script. Save original/checksum/sample metadata. Check audibility/completeness/script match. Length mismatch needs review or explicit new take, not retiming. Long-form uses naturally bounded chapter takes.

### 5. Alignment and clock
Script-aware forced alignment/pinned local weights; fix CLI/silence/numbers/subprocess/DP failures. Save word/phrase timing/confidence; guesses cannot certify accuracy. Uncertain action words need review.
30 FPS; N = round(audio duration × 30); frames 0…N−1. Preserve all audio; disclose ≤half-frame quantization/codec delay.

### 6. Shot plan before scene construction
Save frames/words/set/light/camera/FOV/roll/focus/cast/poses/props/attachments/effects/SFX. Phrase-driven shots; merge tiny phrases. Hook at frame zero; reactions 0–3 frames early; payoff on final word. Bounded declarative data, never generated executable code.

### 7. Worlds and cast
Separate renderer/world/cast/materials/tracks; remove Roman-world assumptions. Provide ship/sea/town/bridge/lab/landscape primitives and props; unsupported actions stop, never still fallback.
Preserve painted texel density/two-step toon/horizon fog/bright lighting. Generalize cast; keep design/sole anchors, 2.25m scale, yaw-only cards/contact blobs/alpha shadows/rounded keys. Test detached props and each new cast sheet.

### 8. Smooth, living animation and render contracts
Validated centripetal paths, 18–45-frame eased glides, bounded hold creep, purposeful rolls/shakes and safe framing. Every actor: idle/blink/stressed-word bob; actions: anticipation/overshoot/settle/planted gait; secondary water/cloth/dust/leaves/drips.
Fix reversed smoothstep, camera-space focus, alpha/depth/no-ink handling, state cleanup and disposal. Preserve linear half-float/output conversion, near-side depth-jump/crease ink, card exclusion/distance fade, depth-aware 48-tap DOF, action-centred sun shadows. Unsupported capabilities fail explicitly, not blank output.

### 9. Mandatory look check
Render midpoints/boundaries/transitions/actions; show private labelled full-story sheet before full render in existing job view. Check framing/occlusion/collisions/text/attachments/ink/focus. Automated and visual gates; uncertainty needs review. Fix/regenerate, never skip.

### 10. Hosted resumable frames
Hosted-only Chromium/WebGL/Python/FFmpeg; offline frames, not MediaRecorder. Input-hashed ranges, dimensions/checksums/decoded validation and atomic writes. Resume missing valid ranges of same job; heartbeat/progress/cancel/cleanup required.

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
