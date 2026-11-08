# Cartoon Engine v3: reach the reference video's level

## What the reference does that we don't (from frames of your video)
- **Full, dense sets.** Every frame is filled edge to edge: deck planks, railings, ropes, portholes, cannons, crates, lanterns, kitchen cabinets. Ours shows a lot of empty floor and sky.
- **Ink outlines + cel shading.** Thick dark outlines on everything, 2-3 flat shade bands, warm rim light. Ours is soft, plain 3D with no outlines.
- **Close, busy camera.** Most shots are close or over-the-shoulder with a foreground object (pot, rail, wheel) framing the character. Wide shots are saved for the big moments (ship in storm, giant wave).
- **Hero objects = the narration.** "the oil" shows a big glowing pot pouring; "the storm" shows lightning and towering waves; "the oily" shows a golden coin close-up. Every key word gets its own picture.
- **Rich characters.** Big round heads, small bodies, many hats and costumes (chef, admiral, pirate captain, bandana), parrots, moustaches, eye reactions.
- **Lighting moods.** Sunny warm day, then deep blue stormy night with rain, god rays, glowing lanterns.
- **One-word captions** that pop in the centre, white with a dark outline.
- **Voice:** clear, balanced pace and energy. Atlas stays the same voice; I'll only tune pacing to match this reference (measured, not guessed).

## Plan (each stage ends with tests + a short Azure test render compared side by side with your video)

1. **Look: toon shader pass.** Ink outlines on every object/character, 3-band cel shading, rim light, light colour grading per mood, bloom on glowing things, soft depth-of-field on the background. Biggest single jump in quality.
2. **Dense set dressing.** Every world gets auto-filled foreground, middle and background layers (ropes, rails, crates, barrels, lanterns, shelves, clutter) so no frame shows empty space. Add the indoor sets the reference uses: ship galley/kitchen, captain's cabin, below-deck.
3. **Worldwide asset library.** Move from hand-drawn shapes to a large library of free, commercial-use low-poly 3D models (Kenney, Quaternius, Poly Pizza CC0 packs — thousands of items: ships, buildings, furniture, food, weapons, animals, vehicles, nature, sci-fi, ancient, medieval, modern). All restyled with the toon shader so they match. Categories tagged so the Visual Director can pick them for any topic (history, science, war, food, space, etc.). Only models that render correctly are added to the vocabulary list.
4. **Characters v3.** Reference-style big-head cast with ~30 outfits/hats (chef, admiral, pirate, soldier, king, monk, scientist, worker, Roman, samurai, astronaut…), facial hair, eye/brow reactions, animals (parrot, dog, horse, cat), smoother eased animation and secondary motion (bounce, hat wobble, blink).
5. **Hero-object shots.** Visual Director must give each sentence's key word a dedicated close-up of that object with an effect (glow, pour, splash, sparkle, spin). Close and over-the-shoulder shots with a foreground object become the default; wides only for scale moments.
6. **Effects and weather v2.** Proper particle rain, splash and foam, volumetric god rays, lightning flashes, giant curling wave set piece, fire/smoke, glowing liquids, sea that reacts to storms.
7. **Captions and sound match.** Switch to the reference's one-word centred pop captions (yellow key word kept). Measure the reference voice pace and pauses and match them; more sound cues per scene.
8. **Quality gate vs reference.** Automatic checks per shot: frame fill (no big empty areas), subject size, brightness/colour, and an AI vision score comparing our frames to the reference style. Shots below the bar are re-planned before full rendering.
9. **Speed.** Spread the preview step across machines too, so the larger library doesn't slow rendering; target stays ~3 minutes for a 60s Short on 10 machines.

I'll keep iterating on the Storm Oil test until the side-by-side frames are close to your video, then test one non-sailor topic to prove the library works for any subject.

## Technical details
- Toon look: Three.js post pipeline (OutlinePass/Sobel on depth+normals, MeshToonMaterial with gradient maps, UnrealBloom, Bokeh) in the existing headless renderer, still SwiftShader CPU.
- Assets: CC0 GLB packs vendored into the Docker image under hosted-renderer/cartoon/assets with a manifest (id, tags, scale, anchor, license); vocabulary.json generated from that manifest so the Director, app schemas and validator stay in sync. Manifest remains declarative; no generated code.
- Characters stay procedural (Toon kit) extended with outfit/hat GLBs attached to anchors.
- New manifest version v3, v1/v2 jobs keep rendering unchanged; legacy Own, Omni, Seedance untouched.
- Python/TS tests extended per stage; Docker image rebuilt via ACR after each stage.
