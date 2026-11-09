# Long-form Cartoon History Pipeline + Thumbnails

Goal: make "Own cartoon" work for long-form 16:9 documentaries in the style of the reference (Ziro History / Kings and Generals): an animated 3D relief map with glowing red territory, borders that grow over time, marching units, and cartoon characters for key moments. Each video also gets a thumbnail in the style of your screenshots.

## What you will get

1. **Own cartoon for long-form.** The "Shorts only" block on long-form is removed. You choose a length (10, 20 or 40 minutes) and the video is 1920x1080 at 30 fps.
2. **Chapter-based story.** The script is split into 5-8 eras with a 60-second cinematic teaser up front. Every 15-30 seconds of narration is tagged with a place, a year, the people involved, troop or empire size, and a mood, so each block knows what to show.
3. **New "Map" world** (the core of the reference style):
   - A 3D relief map: desaturated earth-tone land with height shading, shiny blue sea and soft cloud layers.
   - Glowing red empire area with a white outline, which spreads or shrinks as the years advance (the border sweep).
   - City and castle markers that grow or shrink with zoom, plus faction flags.
   - Armies and fleets (soldiers, cavalry, cannons, galleys from our 3D library) marching along paths, clashing and retreating.
   - A date badge (for example "1299 - 1923") and the place name drawn on the map.
4. **Camera director.** Big-picture moments (empires, treaties) use a high orbiting map view. Battles and sieges use a low, dramatic dolly toward the front line. Moves are smoothly eased.
5. **Scene mix per chapter.** Map scenes are interleaved with the existing drawn-cartoon scenes (castle, market, ship, camp...) so key people act out decisive moments. Roughly 60% map, 40% characters.
6. **Look and sound.** One documentary colour grade (earth tones, strong red/gold vs blue faction colours, vignette, soft depth of field). Atlas long-form narration (calm, ~142 wpm, chapter cliffhangers). Ambient sounds (marching, cannons, wind) under the music, with the music kept well below the voice.
7. **Thumbnail generator.** It matches your screenshots: a bright relief map, the region glowing red, a stylised illustrated main figure on the right, a big white-on-black title label top-left and a smaller date badge. It produces two variants to pick from, saves them with the video, and the YouTube Publish button uploads the chosen one.
8. **Reliability for long renders.** Rendering runs chapter by chapter on Azure (40 machines). Each chapter is saved as soon as it finishes, so a failure only redoes that chapter. Resume never re-pays for a finished chapter. The preview approval step remains: you approve the teaser plus a contact sheet before the full render.

## Honest limits

- A 40-minute video is about 72,000 frames. At today's speed (on Azure CPU machines with 40 replicas) that means roughly 45-90 minutes of rendering per 40-minute video, at an estimated $3-8 of Azure credit. 10-minute videos are about a quarter of that. I will measure this, not promise it.
- Borders are simplified historical outlines: built-in country and region shapes, plus areas the AI picks per year from a fixed list. They are not survey-accurate maps.
- Thumbnails show figures as stylised illustrations. I'll avoid photoreal faces of living people (YouTube policy risk).

## Test at the end

Render a 5-second 16:9 long-form test on Azure: a map opening with the red territory sweep, a date badge, marching units and narration. I'll check the frames, the audio levels and QA, then run the full test suite. I'll also make one sample thumbnail.

---

## Technical details

**Vocabulary and validation** (`hosted-renderer/cartoon/vocabulary.json`, validator, app schemas): add world `map`, actions `march`/`clash`/`retreat`, map props (`city_marker`, `castle_marker`, `army`, `fleet`, `banner`), and a manifest v3 `map` block with `{ region_ids[], year_from, year_to, focus: [lon,lat,zoom], paths[], label }`. Each item is drawable before it is added.

**Map renderer** (new `hosted-renderer/cartoon/scene-map.mjs`):
- Equirectangular Natural Earth 1:50m land, country and admin-1 GeoJSON (public domain), plus a pre-baked relief heightmap texture bundled into assets.
- Extruded terrain plane with a toon/relief shader and a specular water mask.
- Territory as triangulated polygons with an animated reveal mask (the border-growth shader), an emissive edge and a pulse.
- Unit instancing via InstancedMesh along Catmull-Rom splines.
- Text labels via canvas textures.
- Everything is deterministic per frame (seekable), so batched parallel rendering stays exact.

**Region lookup** (`src/lib/map-regions.ts` + bundled `regions.json` id list): the Visual Director chooses only from the bundled ids, the same pattern as the object library. Historical empires are composed as unions of modern regions, with a curated preset table (Ottoman, Roman, Mongol, British, etc.).

**Script/plan** (`story-v2.ts`, `pipeline-operations.server.ts`):
- The long-form plan returns chapters, then beats with `{place, year, actors, scale, mood, visual:"map"|"scene"}`.
- The existing retention validators and bounded repairs are reused, and best-draft continue is kept.
- The Director prompt gets the map vocabulary, and `cinematic-pass.ts` adds macro/micro camera rules.

**Pipeline** (`pipeline.ts`, `cartoon-job.ts`, `azure-render.ts`, `actor.js`, `workflow.py`):
- Remove the long-form block and add a landscape 1920x1080 profile.
- Add chapter-level manifests and per-chapter frame batches with checksums, then concatenate the chapters and run the final loudness pass once.
- Preflight renders the teaser and a contact sheet for owner review.
- Alignment runs per chapter to bound memory.

**Thumbnails** (`src/lib/thumbnail.functions.ts`):
- Two gpt-image-1-mini renders from a template prompt built from title, region and figure, at 1536x1024 cropped to 1280x720.
- The label and date are drawn by an exact-text canvas overlay so spelling is guaranteed.
- Saved to `<user>/<video>/thumbs/`, and Publish calls `thumbnails.set` after upload.

**Tests**: validator accepts and rejects map manifests, region id whitelist, chapter batching math, thumbnail text overlay, long-form gating.
