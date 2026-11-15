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

`import_assets.py` imports Kenney and Quaternius models, their shared palette images,
five Poly Haven 1k surface sets and three HDR skies. `assets/manifest.json` pins
94 files with SHA-256 and CC0 provenance; publisher license files are included.
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

## Latest continuation: sets10

Azure execution `blender-shot-gpu-bg5vbd8` succeeded with all 15 stills; 17 tests pass.
Added supported gate parapets, fitted arch wedges, round towers and rear courtyard;
ship gained a curved sail, rigging, quarterdeck, cabin, stairs and hatch.
The separate siege-camp prototype regressed to 4/10 and exposes unsupported
wall-style lamp brackets; it is not ready. Ship scores 6 (richness 7), castle 5.
`set-audit.json` now holds current still-only evidence, replacing the obsolete
sets3 audit that incorrectly inferred motion. `set-run.json` identifies the run
and unresolved defects. No benchmark acceptance or production rollout.

## Current verification: sets11

Azure execution `blender-shot-gpu-qfnlp9b` succeeded; all 15 full-resolution
stills were retrieved and audited, and all 17 existing tests pass. Outdoor
lamps now have grounded support posts. Tangent normal maps are no longer
misinterpreted as world-space normals on BOX projection. Palette materials
retain their colours with added grain; cloth has seams, the castle has a
stone approach, and interiors have floor joints and wall detailing.

Mine render quality is 7, castle 6, battlefield 5, ship 6; village/street and
room/saloon remain 5. Mean render quality is 5.73 versus benchmark 7.17.
Closer village cameras made the foreground stall obstruct the buildings;
these shots need reframing, not further unverified detail additions.
Step 3 remains unaccepted. The owner subsequently requested proceeding to steps 4–5;
this does not approve step 3 or enable production rollout. `set-audit.json` is historical sets10;
the previously named `set-audit-sets11.json` was not persisted and is not evidence.

## Steps 4–5 continuation (Nov 15)

Character motion has straight resting legs, forward walk/run with planted stance feet,
distinct face parameters, moving costume details, and unscaled EMPTY wrist/ankle attachment
anchors. The cast4 portraits render separately, avoiding overlapping figures. Cast5's
5-second 150-frame swing/cheer clip renders successfully, but its close camera crops both
outer arms. This is not an accepted all-action contact review. Earlier cast4 clips expose
the attachment-scale defect and remain diagnostic only. Production is unchanged.

Ten reference-grounded props render on Azure: perforated cart (82 actual openings),
hand drill, paper rocket arrow, branching fuse, covered cart, gold shotgun, gold pan,
magnifier, dynamite and gold-vein rock. Earlier cast5/qa8 outputs remain diagnostic only.

## Four-object recognition verification (Nov 15)

Azure image `qa10`, execution `blender-shot-gpu-wxu9msz`, succeeded with eight 800x800 stills.
`SHOT=recognition` renders the four repaired objects from the original and an alternate camera.
The drill now has an eggbeater gear/crank and twist bit; the pan has recovery riffles,
black sediment and angular gold; the fuse bundle has sagging woven cords and a visible
ignition tip; the angular rock exposes a flat jagged quartz/gold seam rather than tubes.
Blind Azure review, with intended labels withheld and responses joined by opaque shot ID,
identified all four intended object families in both views. The fuse was identified as
a fused dynamite/charge bundle, not a standalone rope; its charge connections are intentional.
`object-audit.json` preserves the complete responses, image SHA-256 hashes and prior failures.
Recognition for these four passes; this is not motion, benchmark-quality or full step-5 acceptance.
All ten mechanism render checks remain pending. 32 existing tests pass; production unchanged.
