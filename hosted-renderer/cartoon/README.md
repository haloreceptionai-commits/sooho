# Reviewed cartoon Shorts worker

The separate private `chronicle-cartoon-renderer` Actor is deployed from this
folder using `node deploy.mjs`. Legacy Own, Omni and Seedance are unchanged.
Worker source is never imported by the app server or browser.

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
scholar designs support idle/walk/point/react plus hand-anchored pot lift/pour.
The corrected pour frame was visually inspected with the pot fully inside
the card. Additional prop types, captions and complete secondary effects
remain unsupported, not silently replaced.

`acoustic.py` loads hash-pinned wav2vec2 weights offline. It successfully aligned
the actual 33.67-second Atlas sample to 86 script words. Uncalibrated CTC scores
always require review; no syllable fallback or voice retiming occurs.
`stems.py` creates deterministic music/SFX on the narration clock.
`capture.py` writes checked frames atomically; `contact-sheet.py` covers all shots
and the ending, with paginated sheets.

Checks: `python3 test_mix.py`, `test_alignment.py`, `test_stems.py`, `test_capture.py`;
app tests `cartoon-contract`, `cartoon-motion`, `cartoon-manifest`,
`cartoon-action`, `cartoon-worker-validation`. Worker preparation validates
all clocks, cast, camera tracks, worlds and events before creating scene files.
`test_sheet.py` verifies ending/action coverage; `test_workflow.py` rejects
changed immutable inputs before rendering. `workflow.py` provides a local
preflight/review/frames/sound/encode flow and rejects unreviewed long rendering.
`actor.js` performs preflight with locked automatic Atlas, offline acoustic
alignment, full-story contact sheets and cloud review. Owner approval rotates
the job capability and submits a distinct finishing stage with the same locked
inputs. Captured frame batches and hashes persist in a private Actor store.
MP4/audio/frame QA must pass before output is uploaded and completed atomically.

Captions, arbitrary props and physical actions outside the declared supported
set remain unsupported; the director must reject unsupported stories rather
than substitute slideshow images. Acoustic timing always requires owner review.
Automatic resubmission of failed/ambiguous jobs is prohibited. Full-length cloud
completion/playback remains a release-verification gate until the real test
finishes; no speed promise is made. A local steady-state ten-frame test took
7.26 seconds excluding startup; hosted timings differ materially.