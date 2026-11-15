# Blender shot renderer (Advanced Video AI, benchmark step 2)

Headless Blender 4.2 LTS renders one declarative shot (JSON, checked by `shot_schema.py`) to frames.
No AI-written code runs here. Production engine: Cycles on an Azure T4 (OptiX, GPU OpenImageDenoise),
with sun/sky or lamp light, soft shadows, depth of field, AgX grade, mist-pass haze, bloom and vignette.
Eevee is supported locally but the NVIDIA EGL path fails headless on Azure (EGL_BAD_PARAMETER).

- Build image: `node tools/azure-build.mjs <tag> blender blender-renderer`
- Test on Azure: `node tools/blender-job.mjs <tag> gpu-t4 run <blobPrefix> cycles [shotName|json]`
  (`PROBE_ONLY=1` renders 3 frames; `PARALLEL=n` runs n replicas; `NO_WAIT=1` returns at once).
  The `gpu-t4` Consumption GPU profile scales to zero; nothing runs between executions.
- Tests: `python3 blender/test_shot_schema.py`

Measured (Nov 14 2026, 1080x1920, 12 samples): ~2.8 s/frame after a ~9 s first frame; 3 s shot = 4.5 min
on one T4. Concurrency of about 4 T4 machines was observed; 10 requested replicas took ~9.5 min.

## Step 3 — offline sets (Nov 15, NOT quality-approved)

`import_assets.py` imports 50 Kenney model files, their shared palette images,
five Poly Haven 1k surface sets and three HDR skies. `assets/manifest.json` pins
74 files with SHA-256 and CC0 provenance; publisher license files are included.
Kenney web pages returned 403; licenses were verified from the original pack's
publisher-supplied License.txt instead. Assets are bundled in the worker image;
no render-time external downloads. Legacy library and production engine unchanged.

Eleven declarative kits: castle, village, battlefield, mine tunnel, office,
saloon, ship deck, rail yard, workshop, street, room. Lighting accepts day,
sunset, night, rain. Every kit has a 1080x1920 still test in `shots/set-*.json`.
`SHOT=suite` renders and uploads each still, failing if any render fails.

Verified on Azure T4 image `sets9`: all 11 kits and all 4 weather looks rendered.
The offline subset now pins 94 files including complete Quaternius medieval
buildings, leafy trees and a steam locomotive. Publisher CC0 pages verified at
import. Missing palette textures, blocked interior lights, incomplete facades,
incorrect locomotive/rail axis and outdoor light direction were repaired.
Seventeen schema/library tests pass. `audit_sets.py` reuses the benchmark judge
but explicitly labels repeated images as stills, preventing false motion claims;
it joins responses by shot ID rather than assuming response order.
Final still audit: castle/battlefield/ship 5, mine/office/rail/room/saloon/street/
village/workshop 6; night/rain 6. Benchmark mean render quality is 7.17.
**Step 3's benchmark-quality acceptance check has not passed.**
Remaining: richer castle/ship geometry, scene dressing and cinematic framing.
Do not activate in production or advance to step 4 as if step 3 were complete.

Run: `python3 blender/test_set_library.py`; build with the existing Azure build
tool; `node tools/blender-job.mjs sets9 gpu-t4 run <privatePrefix> cycles suite`.
