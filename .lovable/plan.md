# Advanced Video AI: reaching the benchmark look (10 steps)

## What the comparison shows
Benchmarks: "How One Cart Stopped an Entire Army" (66.9s) and "How Mine Salting Worked" (61.1s). Both were made by AI-written code that builds and renders real 3D scenes. Our two latest videos: "Why Rail Tracks Have Gaps" (67.8s) and "Why Oil Calms Ripples" (12.0s).

| Area | Benchmark | Ours today |
|---|---|---|
| Sets | A new, fully built 3D place for each story beat: castle gate, rainy night yard, battlefield, mine tunnel, assay office, street | One classroom set (chalkboard and shelves) for all 67 seconds. Rails are never shown |
| Lighting | Sun and sky lighting, soft shadows, lamps, fog, night rain, sunset, a little background blur | Flat, even light with no depth |
| Characters | Simple 3D egg-head figures with real bodies, clothes and hats, posed with the action. Same faces all video, with expressions | Flat painted cards with the same three people in a row, waving or pointing |
| Objects | Story objects shown big and moving: cart with holes, arrows, gunpowder tube, shotgun, gold pan, dynamite, money | Small, generic or missing. Pictures of the idea on a board, not the real thing |
| Shots | Cut every 2–3s between wide, close-up, object insert, crowd and explosion. Camera follows the action | The same front-on group shot, again and again |
| Effects | Arrow swarm, smoke, explosion, rain, sparks, dust | Almost none |
| Sound | Sound effects on each action, music under the voice, about -14 loudness | Loudness matches, but effects aren't tied to things you can see |
| Words | Tight, concrete story with a strong start ("He loaded the shotgun with gold") | Better than before, but the pictures don't show what the words say |

The real gap is not one setting. The benchmark is a 3D film with a new set and real objects for every beat. We render painted cut-outs in a reused room. No small fix closes that gap, so the plan rebuilds what Advanced draws, while keeping voice, scripts, captions, saving, recovery and Azure.

Not used: Sora or any text-to-video. Each frame is rendered from 3D scenes, like the benchmark.

## The 10 steps
Each step ends with a test video or measured check, and I only call a step done when its check passes.

1. **Benchmark measurement kit.** Turn both benchmarks into a written shot list: every shot's length, type, set, objects, effect, sound and spoken words. Build an automatic scorecard (cut rhythm, how often sets change, whether the object matches the words, sharpness, sound sync, loudness) and score our 2 videos and the benchmarks with it. Check: benchmark scores are recorded and become the target for every later step.

2. **New high-quality 3D renderer.** Replace the current software-drawn renderer for Advanced with headless Blender (Eevee, real sun and sky light, soft shadows, light fog, background blur, color grading). It runs on scale-to-zero Azure render machines (graphics-card machines if your Azure quota allows, otherwise spread across more ordinary machines). Check: one 3-second test shot that matches the benchmark's lighting and depth, side by side.

3. **Free asset library for real sets.** Import free (CC0) skies, ground textures (grass, stone, wood, dirt), trees and rocks, plus building, prop and vehicle models. Build ready-made set kits: castle and walls, village, battlefield, mine tunnel, saloon or office, ship deck, rail yard, workshop, street, room, plus day, sunset, night and rain lighting. Check: every set kit renders a still that looks like benchmark quality.

4. **Benchmark-style characters.** 3D egg-head figures with thin limbs, swappable outfits, hats and helmets, and drawn faces with 8+ expressions and mouth shapes. Poses: walk, run, carry, point, swing, aim, load, pour, crouch, fall, cheer and panic, with hands that hold real props. Same cast, same look, all video. Check: a cast sheet plus a 5-second action clip with no broken limbs.

5. **Story-specific objects.** When the library lacks an object (for example the cart with holes), build it from safe shapes and materials described by AI (box, tube, holes, wheels, handles), then render-check it. Each object gets its moving parts: fire, open, pour, swing, explode. Check: 10 unusual objects from past topics are built and recognisable.

6. **Shot director rewrite.** Each sentence of the script becomes 1–2 shots chosen from the benchmark mix: opening shot of the setting, character close-up, object close-up, action, crowd, reveal or effect. The set changes when the story's place changes. The object or action spoken about must be on screen, big. Codex (gpt-5.1-codex, already set up on your Azure) writes these shot plans as a strict checked list, never as free code. Check: on the rail and mine stories, 100% of shots show what is said, with set changes matching the benchmark rate.

7. **Effects and camera.** Smoke, fire, sparks, explosions, rain, dust, flying objects and crowds of 200+ figures. Camera pushes, follows, fast swings to a new subject, and a slight shake on hits. Effects are timed to the spoken word. Check: an explosion shot and a crowd shot at benchmark quality.

8. **Sound matched to picture.** Every on-screen action gets a free (CC0) sound effect at the exact frame, plus room sound for each set and music that drops under the voice. Voice stays the chosen sample 03. Check: an automatic sync test shows every hit and sound lined up, and loudness lands at -14 ±1.

9. **Script and picture together.** The script writer can only use places and objects the renderer can draw. Opening line names the subject and the action ("He loaded the shotgun with gold"). Story written as concrete events, not explanations. A check confirms every sentence has a clear picture. Check: the blind judges rate the scripts as clear as the benchmark.

10. **Full test, speed and launch.** Make 3 full 60-second Shorts (a rail story, a history battle, a mine-style trick), score each against the benchmark, fix gaps, then turn it on for every Advanced video. Saving and recovery keep working, and one video should finish in 5–15 minutes. Check: all 3 score at benchmark level on the scorecard. You review them before launch.

## Technical details
- The renderer runs from a declarative per-shot scene list (sets, cast, props, poses, camera, effects, lights), checked against a shared vocabulary file. No AI-written code runs on the render machines.
- Blender 4.x Eevee runs headless in an Azure Container Apps Job image. Shots render in parallel, one shot per machine. Captions, audio mixing and the final file reuse the existing assembly and its saved checkpoints.
- Kept unchanged: hash-pinned speech alignment, the watchdog, render job records, private storage paths, Own images and Own cartoon engines.
- Speed budget: script 1–2 min, voice 0.5 min, scene build 1 min, parallel render 3–8 min, assembly 1–2 min.
- Possible blocker: Azure graphics-card quota. If it isn't available, Step 2 measures the ordinary-machine speed and adds more machines.
