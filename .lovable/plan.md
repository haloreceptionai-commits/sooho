# Own video engine — complete cartoon pipeline plan

## Goal
New **Own-model Shorts** will use real cartoon acting inside painted, inked 3D worlds, not camera movement over stills. Keep automatic Atlas, the four pages, private owner-only access, permanent cloud videos, and unchanged Omni/Seedance behavior.

This is a static audit and implementation plan: no uploaded code was executed and no video was generated. The **cartoon-audio-short** specification is the target; the ZIP is a prototype requiring repairs, not a complete production engine.

## Complete review and findings
Read the entire SKILL.md and every ZIP text file: README; engine/index.html, main.js, motion.js, paint.js, roman.js; tools/setup.sh, timing.py, render.mjs, sheet.py, finish.sh; example/soldier/story.js and audio.py. Inspected all 14 sample-image panels. Compared against current generation, Story Engine v2, Atlas, rendering, hosted submission/callback, cloud saving and tests.

| Finding | Required repair |
|---|---|
| Missing mix.py, vendored Three.js/toon.ts, locks/licenses and example narration/timing | Supply verified pinned dependencies, licenses, mixer and reproducible fixtures; missing dependencies block release |
| setup.sh downloads unpinned cast code, mutates the kit, omits finish.sh, suppresses failures | Immutable offline worker image; checked API/runtime versions, explicit copying, safe argument passing and unique temporary directories |
| audio.py hardcodes 592 frames, edits voice, ducks/saturates audio, exports no stems | Voice-derived clock, stem-only synthesis, prescribed measured mixer |
| finish.sh dynamically normalizes and only prints QA; sheet covers first 20 seconds | Linear mastering, enforceable structured QA and full-duration sheets |
| timing.py guesses word positions; broken arguments, silence/DP/number handling | Script-aware forced alignment, checked failures and confidence gate |
| Hardcoded Roman world; actors do not all idle | General scene/cast/prop interfaces and required motion tracks |
| Mislabeled spline, disappearing camera metadata, unbounded FOV; reversed shader smoothstep and wrong focus metric | Validated centripetal paths, bounded camera state, portable shader and camera-space focus |
| Resume trusts filenames; unsafe asset server/path handling; arbitrary story code | Validated declarative data, isolated worker, allowlisted loopback assets and checksummed atomic checkpoints |
| Current Own retimes Atlas and animates stills in shared editor | Separate Own-only offline animation adapter; preserve other engines |
| Current Actor timeout 20 minutes and job lifetime 30 minutes | Benchmark and implement appropriate leases/resource budgets; never hide timeout risk |

## Explicit adaptations — approval includes these
- **Your choice: automatic Atlas**, not the kit’s mandatory narration upload. Keep its identity/secret-fact energy and aim for ~153 WPM while recording, not the kit’s 3.7 words/second.
- Once accepted, new Own narration is never trimmed, stretched, pause-tightened or given inserted silence. Record natural reveal pauses. Necessary decoding, common final gain/limiter and AAC encoding remain allowed; “unchanged” does not mean bit-identical MP4 audio. Other engines keep existing pacing.
- New Own defaults to **no captions and no hook overlay**; explicit caption opt-in remains on existing pages. Correctly oriented diegetic signs are allowed. No QA penalty for permitted caption absence; other-engine preferences stay unchanged.
- Preserve factuality, simple English, continuous original story, escalation/analogy/payoff and 85-point readiness. Version timing/shot rules for the new profile: permit a literal hook medium close-up, phrase-driven shots and continuous camera moves instead of rigid cuts. Required failures stop before paid media; do not silently generate an unready story.
- Keep the sourced topic catalog. On explicit request within Create, provide exactly ten kit-format ideas: 5–8-word title, spoken hook, twist, visual moments and documented/disputed/legend status. Ten hooks for one topic are not ten ideas; no automatic idea-generation spending on page load.
- The upload establishes **vertical Shorts**, not long-form. Keep legacy Own long-form until the separately gated horizontal/chapter migration below succeeds; never silently call legacy output the new cartoon engine.

## Pipeline: every stage has a saved result and acceptance gate

### 1. Package and prove the kit
Preserve the supplied reference. Build a pinned, offline runtime: Three.js r160, verified toon source commit, compatible Node/Playwright/Chromium, Python/numpy/Pillow, FFmpeg and fonts. Verify dependency hashes and licenses; never clone/download during a render. Repair setup prerequisites/copying/path injection/read-only violations. Render a small fixture proving cards, shadows, ink, colour conversion and DOF before integrating story generation.

### 2. Intake and durable reservation
Validate owner, input, selected length/settings and cloud topic history. Save immutable inputs, versions and a logical job before the first paid call. Duplicate clicks return that job. Browser observes; durable services own execution.
States: queued → research → script/validation → voice → alignment → shot plan → look check → frames → stems/mix → encode → QA → save → done. Also persist needs-review, paused, submission-unknown, failed and cancelled with real reasons.

### 3. Research, original script and checks
Keep Azure gpt-5 and existing provider/model selection. Retrieve source evidence: model-generated links alone do not prove facts. Save excerpts, sources, confidence and historical status; corroborate core claims and label disputed accounts/legends. The soldier example is not historical evidence.
Write ten scored hooks and one original chronological story: hook → setting → escalating physical beats → pivot/mechanism → ironic final payoff. Plain English, contractions, spoken number words; no graphic/political stories, named living characters or mascots/logos. Remix uses transcript research, never copied lines or shot-for-shot recreation.
Run deterministic validators and required blind judges; at most two targeted repairs. Unavailable judging or unresolved required failures stop, never null-pass. Revalidate every transformed plan before media spending; save reports.

### 4. Record and lock Atlas
Create one coherent Short take with approved Atlas direction and a script budget fitting its pace. Save original audio/checksum and decoded sample metadata immediately. Validate complete, audible narration against exact script. Duration mismatch enters review or requires an explicit new take—no hidden retiming. Long-form uses complete chapter takes with recorded natural boundaries.

### 5. Alignment and master clock
Use script-aware forced alignment with pinned local weights; repair argument parsing, silence/number handling, subprocess checks and impossible alignment. Save word/phrase timings and confidence. Phrase/syllable estimates may diagnose but cannot certify word accuracy; uncertain action words require review.
FPS = 30; N = round(decoded audio duration × 30); render exactly 0…N−1. Preserve every narration sample. Document frame-grid difference (up to half a frame) and encoding delay instead of promising identical arbitrary audio/video durations.

### 6. Shot plan before scene construction
Save rows containing frame interval, exact words, set/light, camera path/FOV/roll/focus, cast/poses/expressions, prop/attachment actions, secondary effects and SFX. Usually one phrase per shot; merge tiny phrases. Frame zero shows the hook; reaction onsets land 0–3 frames before aligned words; final physical payoff lands on the final spoken word. Use bounded typed declarative data, never model-produced executable story code.

### 7. Original world and cast
Separate renderer, scene builders, cast, materials, tracks and asset registry; remove all bridge/temple/helmet/DECK assumptions. Reusable ship/sea, town/bridge, workshop/lab and landscape primitives support original scenes; unsupported sets/actions stop rather than fall back to stills.
Preserve painted textures, constant texel density, two-step toon shading, horizon fog and readable bright lighting. Generalize outfits/expressions/props beyond Romans; retain design coordinates, sole anchor, 2.25 m scale, yaw-only billboards, contact blobs, alpha-tested shadows and rounded redraw keys. Test hand/head attachments and detached props; render a sheet for every new cast design.

### 8. Animation and look contracts
Validate centripetal paths, eased 18–45-frame glides, bounded hold creep, purposeful rolls/impact shakes and collision-free vertical framing. Every character gets breathing/sway, blinks and stressed-word bobs; actions use anticipation/overshoot/settle, planted-foot gait and secondary water/cloth/dust/leaves/drips.
Repair reversed shader smoothstep, camera-space focus, alpha/depth/no-ink contracts, state restoration and disposal. Preserve linear half-float passes/output conversion, near-side depth-jump ink/creases, card exclusion/distance fade, depth-aware 48-tap DOF and action-centred sun shadows. Missing graphics capabilities fail visibly, not with blank frames.

### 9. Mandatory preflight look check
Render shot midpoints, boundaries, transitions and key actions; save labelled full-story contact sheets privately and show them in the existing job view before expensive rendering. Check 9:16 framing, hero/face occlusion, camera collisions, mirrored text, attachments, ink and focus. Automated checks plus visual inspection gate release; uncertain jobs enter needs-review. Fix failures and regenerate sheets—never skip this stage.

### 10. Hosted resumable frames
Run Chromium/WebGL, Python and FFmpeg in the hosted worker only. Capture offline deterministic frames, not real-time MediaRecorder. Save input-hashed frame-range checkpoints, dimensions/checksums and decoded completion checks privately. Atomic writes prevent partial frames being skipped; changed inputs cannot reuse stale frames. Resume only missing valid ranges under the same job. Persist actual progress/heartbeat, honor cancellation and clean up on every failure.

### 11. Exact stems and mixing
Rewrite audio.py to export music.wav/sfx.wav only, using the locked clock and independent cue seeds. Remove fixed length, voice loading, ducking, saturation and whole-mix fades. Stop march at the twist precisely, then introduce drone; sounds follow actions.
Implement missing mix.py with a documented common gated-RMS definition. Music = 0.5× voice RMS (−6.0206 dB, displayed −6.0); SFX ≤0.5× voice RMS and peak ≤0.7× voice peak. If targets conflict, lower SFX and report achieved levels. Handle silent input safely. No ducking/compression; store measurements. Master with one common measured linear gain plus the allowed peak limiter.

### 12. Encode, enforce QA and cloud delivery
Verify all N frames and full audio coverage. Encode 1080×1920/30 FPS H.264/yuv420p CRF17 + AAC/faststart; never use -shortest to conceal missing frames. Target ~−14 LUFS/−1 dBFS sample-peak ceiling; measure AAC true peaks and report unavoidable mastering trade-offs.
Check decode, codec, frame count, duration, loudness/peaks, black frames and frozen spans ≥0.4s. Review intentional flashes/holds rather than ignoring detections. QA sheets span the entire video, including payoff. Save MP4/sheets/structured QA privately; verify saved object/checksum, finalize atomically, then confirm fresh-session playback/download. Invalid output cannot be Ready.

## Technical boundaries, recovery and capacity
- New Own-only versioned adapter/manifests; preserve shared legacy renderer, old outputs, Omni and Seedance. Keep worker-only packages out of app server/browser bundles.
- Owner controls use authenticated server functions; worker callbacks use published endpoints with restricted job/attempt capabilities. Never send owner sessions, gateway keys or service credentials to scene code/Actor. Restrict local asset paths, scratch space, egress and resources.
- Inspect live SQL claims, locks, grants, cancellation and expiry reconciliation before extending them. Preserve no-delete and stale-browser-write protection.
- Checkpoint each paid result. Timeouts do not prove rejection: reconcile ambiguous submissions, never automatically recreate Actors/paid jobs. Use bounded eligible transient backoff and existing terminal refusal/access/credit pause rules.
- Attempt-scoped paths, leases and idempotent callbacks reject stale completion. Uploaded output with lost callback must finalize without rerendering. Cancel must stop future batches and arbitrate atomically with completion.
- **Speed is unverified:** kit estimate 3–10 seconds/frame means 90–300 minutes for a 60s Short. Benchmark throughput/memory/cost before rollout; size budgets, leases and renewed grants accordingly. No two-minute/no-timeout guarantee; Apify charges can rise.

## Tests and delivery order
1. Dependency/license/offline startup and intentional missing-file failures.
2. Silence/script mismatch/alignment confidence; concrete N-frame and 0–3-frame event assertions.
3. Every required story gate blocks spending; permitted no-caption scoring; transformed-plan revalidation.
4. Camera/gait/idle/attachment/shader tests and same-frame sequential/random-order/resume equivalence in pinned runtime.
5. Concrete 0.5 RMS/0.7 SFX cap, no retiming/ducking, complete narration and full-file encoding/QA tests.
6. Forged/cross-owner/expired callbacks, duplicate clicks, ambiguous start, cancel-versus-done, corrupt checkpoints, interrupted upload and callback-loss recovery.
7. Real original fixture, then ~60s story: inspect animation/sheets/audio, close browser during execution, reopen library, play and download saved MP4; test desktop/mobile and other-engine regressions.
8. Long-form gate: horizontal chapter then complete multi-chapter render; continuity, alignment, music, checkpoint recovery, full-duration QA and measured costs must pass before migration.

Order: package/repair → durable Own jobs → verified script/locked Atlas/alignment → scenes/motion → preflight → frames → stems/mix/encode/QA → cloud end-to-end proof → Own Shorts rollout → gated long-form migration. No skipped required checks, placeholder success or silent still-image fallback.
