# Stage 2 — preview first, three approval stops

No paid work has started for this request. Implement and preview **2a only** after approval of the plan. Stages 2b and 2c remain blocked by their preceding preview approvals. No full video render is authorized by this plan.

## Cost estimates and hard stops

These are provisional US-dollar estimates, not Azure bill readings. They cover incremental preview rendering and, where stated, image generation/checks; not Lovable chat/build credits. Reconfirm each later stage's estimate before starting it.

| Stage | Estimated preview spend | Maximum authorized spend (upper estimate +25%) | Reused | New |
|---|---:|---:|---|---|
| 2a | $0.25–$0.80 | $1.00 | Saved script, 44.2-second voice, checked object cards, staging and existing sets | Scenery clearance, framing corrections, one low-quality still per shot and narrated contact sheet; **no new paid art** |
| 2b, only after 2a approval | $0.40–$1.20 | $1.50 | Script, voice, cards, corrected staging, ground and people | Text-free Boston backdrop layers, lighting/grade, street/tank/wave stills |
| 2c, only after 2b approval | $0.25–$0.80 | $1.00 | Approved scene, cards, backgrounds, lighting and voice | Burst effects, slow-motion timing and sound cue list; burst-only preview |

Sizing assumptions: one T4, roughly 3–10 active replica-minutes per preview stage at the previously used provisional $2.10–$2.40 per replica-hour, plus bounded preparation/storage and applicable art/check costs. Cold starts and scene setup can dominate a still preview, so it will not be priced simply as 23/1,326 of a full video. Verify the configured rates and startup allowance before dispatch; ask before spending if those checks invalidate the cap.

**Full-render comparison:** the last 44-second render was estimated at $0.65–$2.30 from its measured machine time. That is historical evidence, not a fixed quote for the revised scene. A future full-render estimate will be supplied after the relevant preview approval, separately from these preview budgets.

Record active time for every replica, preparation, failures and retries; compute time × applicable rate and add image/check usage. Label this **estimated spend from measured usage**, not actual billed spend, while Azure billing access remains unavailable. Include uncertainty and actual billed dollars only if verified billing becomes accessible.

## Stage 2a — clear the view, no new art

1. Preserve saved narration, cards and cast timing. Resolve requested shot numbers against the Stage 1.5 list: it contains 23 rendered setups after splitting the climax, rather than the earlier 21. Keep a cross-reference so the specified shots and equivalent problem setups are all checked.
2. Check evaluated scenery geometry between the camera and the key object: barrels, stalls, houses, signs and other set dressing. Hide or reposition obstructing scenery, or move the camera. Check the camera path, not only its midpoint. Log the blocking object and the correction. Cover shots 4, 11, 14 and 21 explicitly.
3. Preserve intact → cracked → burst ordering. Make the saved wave clearly visible, with its visible bounds at least 25% of frame height at peak (consistent with the earlier frame-height rule). Check clipping and occlusion separately; do not count hidden area as visible wave.
4. Limit projected face height to 40% of frame unless the spoken line explicitly concerns that person's emotion. Reframe shots 2 and 16; the exception is not inferred merely from a shocked facial expression. Log any exception.
5. Add an isolated cheap still-preview path: low resolution/sample count, one representative still per rendered setup. Choose the burst peak for the wave setup. Use the same corrected scene as the future full render; no AI replacement pictures and no full-video assembly.
6. Produce a legible contact sheet with shot number and the complete narration line beneath every frame. Include the geometry/framing report and measured-time cost comparison. Inspect every frame before delivery; report unresolved failures honestly.
7. **Deliver the sheet and STOP.** Do not start 2b or full rendering.

## Stage 2b — correct Boston, after approval

Use one locked, text-free painted style for 1919 Boston brick tenements and harbor on a cold winter morning. Place 2–3 wide parallax layers behind the 3D ground plane, removing the medieval scenery rather than disguising it. Preserve people and object continuity.

Apply cold hazy key light, warm rim, long soft shadows, ambient occlusion, light mist, depth of field, subtle vignette/grain and a desaturated period grade. Molasses is the warmest, glossiest element.

Show three preview stills: street, tank, wave. Report art/check usage plus measured rendering time. **STOP for approval; no full render.**

## Stage 2c — burst effects, after approval

Add camera shake, a 1–2-second slow-motion burst, flying rivets/debris, a thick squash-and-stretch wave, dark brown spray and impact dust. Preserve the saved speech clock; explain any required shot-duration redistribution before applying it. Provide a timed sound cue list: metal groan, rivet pops, rumble and splash; do not silently buy sound assets.

Preview the burst shot only, with motion sufficient to judge the slow-motion/effects. Report measured usage and **STOP for approval**.

## Technical implementation and checks

- Keep the preview worker separate from automatic Advanced preview approval and finishing, so requesting stills cannot trigger a paid full render or overwrite the saved video.
- Reuse the per-video step lock and private checkpointed assets; reject duplicate dispatch and reconcile uncertain starts rather than retrying blindly.
- Bind the preview and any future approval to corrected scene/card hashes. Changed inputs invalidate approval.
- Use a single bounded replica with a wall-time cutoff derived from remaining budget, including preparation, build/start overhead and a shutdown reserve. Check spend before each paid call; no automatic retry that can exceed the cap. If a cost component cannot be bounded, stop before dispatch and ask.
- Add concrete tests for scenery clearance, visible wave >=25%, face <=40% with the narration-only exception, preview-only execution, duplicate-job prevention and the +25% ceiling. Run affected renderer tests.
- Stills establish composition only, not motion quality or all-frame release approval. Full-video validation stays pending until separately authorized.