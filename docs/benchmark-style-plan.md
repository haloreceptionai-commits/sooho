# Benchmark style plan (Advanced Video AI)

Sources: the benchmark creator's "Claude 3D Animation Master Prompts" (13-page PDF) and the `animated-3d-story-video` skill, plus numbers measured from the four benchmark Shorts and from our own render (tools/style_scorecard.py). Nothing here is a guess: each phase has a measured gap and a check.

## What the creator's method says (summary)

1. Measure the style in numbers, never opinions: camera movement per frame (phase correlation), cuts, shot length, brightness / contrast / saturation, outline thickness and colour, shadow and highlight colours, character proportions, background blur and depth.
2. Match ONE frame first, side by side, before any video: room, then light, then character, then camera. Fix in rounds, judge by eye.
3. House style: a real 3D world made of detailed models with PAINTED FLAT-COLOUR textures (wear drawn on, no grain, no gloss, no reflections), a dark ink outline on every prop edge (thinner than the character's), soft 3-band cel shading, one warm key light from the upper left plus a cool hemisphere fill, a light vignette, fog per location.
4. Characters are 2D-looking people inside the 3D world: large round pale head, calm half-lidded eyes, tiny smile, hair fringe or hat, white collar, tie, small pear-shaped two-tone torso with a pocket patch, thin tapered stick limbs, dark disc hands, a hand-drawn ink band of slightly varying thickness. Variants only by palette, hat and glasses. Flat shading, idle bob and nod, grounded with a soft contact shadow, never edge-on.
5. The camera ALWAYS travels: about 10% of the frame width per second, push about half the shots, crane a third, sideways track a fifth, ease in and out, carried from one subject to the next, synced to the words, clear of characters. Every shot has a foreground (blurred, near the lens), a midground (sharp, the characters) and a background (slightly blurred).
6. Labels live inside the world (a painted sign, a banner, names on crates), never floating captions. Cuts between locations are a short (0.4 s) dip to cream.
7. Lighting follows the story: warm and bright during the setup, deeper blue at the pivot.
8. Characters are large: 40-60% of the frame height in medium shots, 70% or more in close shots.
9. Script formula: first word at t=0, a paradox in the first sentence, 9-12 shots, 140-150 words at about 3.35 words per second; beats: But (shot 4), Then (5), the conflict (6), a pivot ("You see") at 53-87% of the runtime, a consequence ("So...") at 80-93%, a closing line of 5-19 words; simple words, one idea per sentence, only verified facts.
10. Check stills before every render (camera inside geometry, objects blocking faces, characters cropped, black voids, floating props, wrong facts), review the render with a contact sheet every 2 seconds and keep a numbered mistakes list.

## Measured gap (benchmarks vs our latest Hannibal video)

| Metric | Benchmarks (4 videos) | Our video | Gap |
|---|---|---|---|
| Frames with camera movement | 30-48% | 11.6% | 3-4x less |
| Median camera speed (fraction of frame width per second) | 0.024-0.043 | 0.003 | about 10x less |
| 90th percentile camera speed | 0.11-0.34 | 0.06 | 2-5x less |
| Brightness | 0.50-0.57 | 0.39 | too dark |
| Contrast (std of luminance) | 0.18-0.20 | 0.13 | too flat |
| Saturation | 0.28-0.53 | 0.34 | in range |
| Centre sharpness (Laplacian variance, 270x480) | 2,090-4,200 | 224 | 10-20x softer |
| Edge-strip sharpness | 331-1,352 | 32 | 10-40x softer |
| Hard cuts per 10 s | 0.1-2.7 | 2.2 | in range |

So the biggest measured gaps are CAMERA MOVEMENT, DETAIL (sharpness / ink / painted texture) and BRIGHTNESS + CONTRAST. The cut rate is already fine.

## Phases (each ends with a measurement or a side-by-side still, then a commit)

- **P0 Rulebook (done).** Scorecard tool plus the table above; targets for every later phase.
- **P1 Toon world finish.** Flat painted colours with soft wear instead of photo textures, 3-band cel shading, a thin dark ink outline (colour #351f22) on every prop, warm upper-left key, cool fill, vignette, fog per location. Check: sharpness and contrast of stills against benchmark frames.
- **P2 Characters to the house spec.** Half-lidded eyes, tiny smile, fringe or hat, collar, tie, pear torso with a pocket patch, tapered limbs, disc hands, ink band with varying thickness; micro-animation (two blinks, breathing bob, head tilt, a gesture). Size 40-60% of frame height in medium shots.
- **P3 Camera.** Net travel in EVERY shot (about 10% of frame width per second), mix of push / crane / track, ease in and out keyed to word times, camera clear of characters and props. Check: camera audit on the plan, then scorecard on a clip.
- **P4 Depth.** A blurred foreground object near the lens in most shots, background slightly blurred, characters sharp.
- **P5 In-world labels, cream dips, story lighting.** Painted signs and banners carrying the key number or name, a 0.4 s dip to cream between locations, warm setup and deeper blue pivot.
- **P6 Script rules.** Add the creator's beat structure, word and pace targets and the paradox opening to the Shorts Writer prompts and critic.
- **P7 Stills audit tool.** Automatic checks for black voids, cropped characters, faces hidden behind props, objects inside the lens, plus a contact-sheet builder, run before any paid render.
- **P8 Docs and delivery.** AGENTS.md rules, this plan, rebuilt images, smoke tests.

Honest limits: our renderer is Blender Cycles on Azure GPUs, not Remotion + three.js, so the creator's code is not reused; we reproduce the same measurable rules. Audio, voice quality and a full-length render are not measured by these tools.
