# Cartoon worker foundation — not enabled in production

The approved plan is implemented incrementally here. The app continues using its
existing engines until all release gates pass. This folder is never imported by
the app server or browser.

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
scholar designs support idle/walk/point/react. Lift/pour attachments, captions
and complete secondary effects are explicitly unsupported, not silently replaced.

`acoustic.py` loads hash-pinned wav2vec2 weights offline. It successfully aligned
the actual 33.67-second Atlas sample to 86 script words. Uncalibrated CTC scores
always require review; no syllable fallback or voice retiming occurs.
`stems.py` creates deterministic music/SFX on the narration clock.
`capture.py` writes checked frames atomically; `contact-sheet.py` covers all shots
and the ending, with paginated sheets.

Checks: `python3 test_mix.py`, `test_alignment.py`, `test_stems.py`, `test_capture.py`;
app tests `cartoon-contract`, `cartoon-motion`, `cartoon-manifest`.
`test_sheet.py` verifies ending/action coverage; `test_workflow.py` rejects
changed immutable inputs before rendering. `workflow.py` provides a local
preflight/review/frames/sound/encode flow and rejects unreviewed long rendering.
It is not connected to paid production jobs and does not simulate cloud saves.

Pending release gates: immutable container/browser/fonts/model distribution,
alignment calibration, full actions/props/effects/cast QA,
durable generation/cancellation/recovery, owner preflight review,
cloud frame checkpoints, full-video finishing/QA, owner callback
verification and real closed-browser library playback. Do not claim this is a
completed video engine or submit it as the production Actor.