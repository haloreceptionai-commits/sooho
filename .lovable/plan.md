# Cartoon Engine Speed x10 + Quality Pass

Goal: a 60s cartoon Short goes from "start" to finished MP4 about 10x faster than today, with the same or better reliability, then prove it with a full 6-second test video made end-to-end.

## Where the time goes today (from the code)

- Every frame is drawn by a software graphics card (SwiftShader on CPU). This is the single biggest cost.
- 10 browsers run on each 4-CPU machine, so they fight for the same CPU.
- Each 60-frame batch opens a new browser and reloads the whole scene and 3D objects.
- Each frame is turned into a high-quality JPEG inside the browser, sent as text, then uploaded one by one to storage.
- The preview step runs on 1 machine only; machines also pay a cold start (pulling a large image with the 239 MB object library).
- After drawing, the joining machine downloads every frame again before encoding.

## Plan

### Stage 0 - Measure first
Add timing to each step (machine start, scene load, per-frame draw, upload, join, encode, sound check) and record it in the QA report. Run the current 6s test once to get the real "before" number. All speed claims are judged against this.

### Stage 1 - Real graphics card on Azure (biggest win, 5-20x on drawing)
- Add an Azure Container Apps serverless GPU workload profile (NVIDIA T4, scale to zero, pay per second) to a new GPU render job; keep the current CPU jobs as automatic fallback.
- Renderer launches Chrome with the GPU (EGL/Vulkan) when present, SwiftShader otherwise; a startup self-test confirms which one is used and logs it.
- Needs: GPU quota in an Azure region that offers serverless GPUs (e.g. West US 3 / Sweden Central). If quota is not granted, Stages 2-5 still give roughly 3-5x on CPU.

### Stage 2 - Stop wasting CPU
- One browser per machine, scene loaded once, then draw a long run of frames (no reload per batch).
- Read raw pixels and pipe them straight into the video encoder on that machine, so each machine outputs a finished video piece instead of thousands of JPEGs.
- Right-size machines: fewer, stronger replicas for CPU mode; frame ranges split evenly across replicas up front (keep the claim system only as a safety net for crashed replicas).

### Stage 3 - Fast joining
- Join the video pieces losslessly (no re-encode of pictures), then add sound and captions once. Sound mix runs in parallel with drawing, not after it.

### Stage 4 - Faster start and preview
- Slim the container image: object library moved to a cached storage mount, only used objects copied per job.
- Preview sheets drawn in parallel across machines; voice alignment runs while machines start.
- Keep one machine "warm" only while a job is active, then zero.

### Stage 5 - Reliability guards
- Per-piece checksums and automatic redo of only a failed piece (never the whole video, never repaying AI work).
- Hard time limits per step with a clear error naming the step.
- GPU failure falls back to CPU automatically for that piece.
- Existing owner review, QA gate, loudness fix and callbacks stay unchanged.

### Stage 6 - Quality items from your notes
- Stylized 3D cinematic: stronger key/rim lighting, contrast grade, faster camera moves (push-in, whip, orbit) per shot.
- Explainer shots: clean "how it works" cutaway mode for mechanisms, close-up hero objects.
- Rigged characters: use library rigged models for movement (walk, point, react) with exaggerated faces on the main cast.
- Props/environments: Director must pick a hero prop per scene from the library and a modular environment kit.
- Particle effects: GPU-friendly splashes, smoke, storm clouds, swirling liquid.
- These are only added when drawable, through the shared vocabulary file, as today.

### Stage 7 - Proof: full 6-second test
Create one full 6s cartoon Short through the real app (script, voice, review, render, finish, save to My videos). Report: before vs after times per step, GPU or CPU used, QA result, Azure cost, and screenshots of frames.

## Your decisions needed

1. Approve requesting Azure serverless GPU (T4) quota and adding a GPU job. Cost estimate: around $0.02-0.10 per 60s Short, zero when idle.
2. For the test I approve the preview step myself, as last time.

## Honest expectation

- With GPU: 10x on drawing is realistic; whole job (including AI script and voice, which do not speed up) likely 4-8x. A 60s Short target: about 1-2 minutes after approval.
- CPU only: about 3-5x.

## Technical details

- Files: hosted-renderer/cartoon/capture.py (persistent page, GPU flags, raw RGBA via readPixels -> ffmpeg stdin, segment output), actor.js (static range split, segment parts, concat demuxer join, parallel mix), workflow.py/finish.py (concat + mux, timing in QA report), platform.mjs (segment upload), Dockerfile (GPU base, slim image), src/lib/azure-render.ts (choose GPU job, fallback to CPU job), new Azure job definitions via ARM.
- Deterministic frames per index keep segments reproducible; segment hash recorded in checkpoint.
- New tests: range split, segment concat contract, GPU/CPU fallback selection, timing report fields.
