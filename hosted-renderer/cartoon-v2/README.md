# Cartoon v2 (realistic world pipeline)

A separate pipeline for the realistic YouTube style. It keeps the proven shot renderer
from `cartoon/` (Blender 4.2, Cycles, shot JSON schema, characters, props, audio hooks)
and adds a world layer: each shot's set is one of the 61 zones of the Everything World,
exported as GLB. A short topic such as "war at night" picks the zone, time of day and camera.

The original `cartoon/` pipeline is untouched.

## Layout

- `blender/` — renderer code (copied from `cartoon/blender`, plus the v2 additions below)
  - `world_topics.py` — topic → zone router, camera from the zone's spawn point, lighting words, shot builder
  - `world_env.py` — Blender side: imports a zone GLB, centres it on the origin, adds sky, sun and optional lane
  - `make_world_shot.py` — one command: topic → validated shot JSON → optional Blender render
  - `test_world_topics.py` — router and shot contract tests (pure Python)
  - `shot_schema.py`, `render_shot.py` — v2 changes: a `world` block; when present it replaces the procedural place
- `worlds/everything/` — 61 zone GLBs and `manifest.json`. These are git-ignored: regenerate them (below). The default is the per-zone set (`WORLD_SOURCE=zone`); `WORLD_SOURCE=full` uses the whole-world GLB, which takes about 3 minutes to import per shot.
- `worlds/source/` — the Everything World HTML (`Everything-World-3D.html`) and `export_zones.html`, the tool that exports the zones.
- `assets/` — fonts, map, sound copied; `assets/library` is a junction to `cartoon/assets/library` (315 MB, not copied)
- `out/` — rendered test shots (git-ignored)

## Use

```powershell
cd hosted-renderer\cartoon-v2\blender
python make_world_shot.py --list
python make_world_shot.py "war at night" --render --size 1920x1080 --duration 2
```

Without `--render` it writes `out/<topic>/shot.json` and prints the zone it chose.
`--render` runs Blender 4.2 in the background. Set `BLENDER_BIN` if it is installed elsewhere.

Quick test size: `--size 960x540 --samples 32 --duration 0.2`.

## Regenerate the zone GLBs (once per machine)

The world builds itself with random trees, cars and crowds. `export_zones.html` fixes the random
seed (20240601), so every export gives the same files.

```powershell
cd hosted-renderer\cartoon-v2\worlds\source
python -m http.server 8000
```

Open `http://localhost:8000/export_zones.html`, click **Export all zones**, allow multiple
downloads, then move the 61 GLBs and `manifest.json` into `worlds/everything/`.
The export runs the exporter as a script inside the world frame, so it sees the world's THREE and scene.
The export needs internet access for three.js (cdnjs/unpkg).

## Adding topics

Each zone has its own row in `SYNONYMS` (`world_topics.py`). Add words there and run
`python -m unittest test_world_topics`. Unmatched topics fall back to Downtown and the
output says `no keyword matched`.

## Clearing and props

- `world_env.py` removes what would block the lens: backdrop meshes wider than 2× the zone (sky, sea, distant terrain), meshes that contain the camera (a barrier or pier), and faces within 5 m of the camera.
- Battlefield zones get sandbag lines and craters in front of the camera (`add_battlefield_props`).
- Highway: the elevated deck is not built yet. The shot shows the bare road with lamp posts.

## Status and known problems

See `STATUS.md` for the current render checks, the zip tests and open items.

## Limits (be aware)

- The exported zones have no sky and no sea/ground planes larger than 900 m. Every world shot
  adds a flat ground plane (zone size plus 40 m, coloured by category), so no void shows.
  Large terrain features from the source (sea, mountains) are not in the GLBs.
- The High Street is a pedestrian street in the source. `"high street with cars"` adds an
  asphalt lane (a variant); plain `"high street"` stays pedestrian.
- Lighting uses one HDRI (partly cloudy) and a sun. Night dims the sky to 25%.
- People: `make_shot(..., people=4)` places 4 characters near the camera (0-12 allowed) with
  outfits by zone (soldiers on the Battlefield, labcoats at the hospital). Their poses are simple
  (`walk` or `stand`) and they are not tied to props.
- Nothing here is deployed to Azure or committed to git.
