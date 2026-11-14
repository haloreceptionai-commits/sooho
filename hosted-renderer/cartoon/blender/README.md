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
