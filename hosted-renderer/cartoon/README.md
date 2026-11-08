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
gains; mastering, encoding and durable cloud orchestration are not wired yet.

Checks: `python3 test_mix.py`; app test `cartoon-contract.test.ts`.

Pending release gates: immutable container/browser/fonts/alignment weights,
declarative general scenes/cast/motion, durable generation/cancellation/recovery,
preflight review, cloud frame checkpoints, exact finishing/QA, owner callback
verification and real closed-browser library playback. Do not claim this is a
completed video engine or submit it as the production Actor.