# Phase 1 — Advanced Video AI: real 3D places, open vocabulary

Scope: Advanced engine only. Own images, Own cartoon, long-form, saved videos, checkpoints/resume/watchdog, voice and Shorts Writer are untouched. No Azure image rebuild, no paid render, durable coordinator stays off.

## What I confirmed in the code
- `art_director.py` `match_location()` only picks a kit when a `PLACE_WORDS` word appears in the location; otherwise `NEUTRAL`. `plan_locations()` also forces `NEUTRAL` whenever a painted backdrop exists or `kit_fits_era()` fails.
- `director-vocabulary.json` has 11 sets (mine_tunnel, rail_yard, castle, battlefield, village, ship_deck, office, saloon, workshop, street, room) and 12 objects, all from the mine/cart benchmark.
- The existing CC0 library (5,341 models, Kenney + Quaternius, already imported) already contains most of what the Hannibal story needs: `q-farmanimal/Cow`, `q-survival/Torch`, `mini-characters/weapon-spear`, shields, `castle-kit/flag-banner-*`, `nature-kit/tent_*`, `nature-kit/campfire_*`, 58 `nature-kit/cliff_*`, 28 `nature-kit/ground_river*`, `nature-kit/statue_column`, pirate-kit docks/boats, rocks, trees, grass. No dedicated ox, horn or mountain model.

## 1. Files to change and why
New (Blender side, `hosted-renderer/cartoon/blender/`):
- `place_spec.py` — schema + validator for the per-beat place spec (enums only), and the compiler that turns a spec into a set build.
- `place_modules.py` — deterministic builders for the 7 new place modules (terrain, dressing layout, fog, lighting presets), using only whitelisted library ids.
- `terrain.py` — engine-owned terrain: displaced ground mesh with noise ridges, valley floor, river channel with water material, road strip, distant ridge silhouettes as real low-poly geometry (replaces the 2D card for Advanced).
- `registry_check.py` — local render gate: renders a candidate vocabulary entry once (CPU still, NO_COMPOSITE) and records pass/fail (mesh present, in frame, bbox height, not detached) in `registry-audit.json`.
- `test_place_spec.py`, `test_place_modules.py`, `test_registry.py`.

Changed:
- `art_director.py` — Advanced path reads `place_spec` per shot instead of `match_location`; keyword matching stays only for v1/v2 manifests (old jobs).
- `world_pack.py` — for spec-driven shots, painted backdrops are no longer placed as the place; `KIT_ERA` becomes per-element era tags (a tent or cliff has no era; a saloon facade does), so ancient stories lose only truly modern pieces.
- `render_shot.py` — call `place_modules.build()` when the shot has a spec; reuse existing `apply_mood`, floor colour logic stays for legacy.
- `director-vocabulary.json` + `hosted-renderer/cartoon/vocabulary.json` — add `places` (7 modules), new objects and actions, each entry carrying `audit: <hash>` from `registry_check`.
- `object_specs.py`, `story_objects.py` — Hannibal entries: ox (library cow + engine horns), horn, torch, fire-on-horns (torch flame effect parented to horn tips), spear, shield, tent, banner, campfire.
- `shot_director.py` — `validate_plan` accepts concepts from the extended registry; replaces the silent card fallback with a hard blocker for Advanced.
- `shot_schema.py` — manifest **v3** adds optional `place_spec` per shot; v1/v2 unchanged and still accepted.
- App side: `src/lib/world-pack.ts`, `src/lib/object-resolution.ts`, a new `src/lib/place-spec.ts` (zod mirror of the Python schema) and the Advanced staging call that asks the model for specs; worker validator updated in the same change so all three stay in sync.

## 2. How the place-spec step works
```text
sentence + fact sheet + era/year
   -> AI (Azure, strict JSON, one call per story covering all beats)
   -> { terrain: mountain_pass|valley|plain|river_crossing|camp|city_street|harbour|interior,
        time: dawn|day|dusk|night, weather: clear|fog|rain|snow|wind,
        dressing: [registry ids], era_year, notes }
   -> validator (enums + registry ids + era tags)
   -> deterministic builder (terrain + module layout + library models + fog + light)
```
- The model only picks from enums and registry ids listed in the prompt (per-story shortlist, as today).
- Undrawable proposal: one bounded repair call naming the rejected values and the allowed list. If still invalid, the closest allowed choice is used only when it is the same place family (e.g. "gorge" -> mountain_pass via a fixed synonym table, unit-tested). Otherwise the video stops before any paid render with a message like: "Scene 4 needs 'aqueduct', which the 3D engine cannot draw yet." No NEUTRAL, no painted-card substitute.
- Required props: a spoken concrete noun that is the subject of a beat must resolve to a registry object; if not, same stop-before-paid-render rule. Minor background nouns may be dropped and listed in the checks.

## 3. New place modules and assets
Modules (all built from already-imported CC0 models + engine terrain):
1. Mountain pass / night mountain road — terrain ridges both sides, cliff_* walls, rocks, path strip, snow/fog option.
2. Valley — low ridges on horizon, grass, trees, stream optional.
3. Army camp — tents, campfires, banners, spear racks, fence, crates.
4. Open plain / steppe — wide flat-with-noise terrain, grass tufts, sparse rocks, far ridge line.
5. River crossing — river channel, banks (ground_river*), rocks, rowboats, bridge optional.
6. Ancient city street — stone walls, columns, market stalls (q-medievalvillage pieces era-tagged), banners.
7. Harbour — docks, boats, q-ships, crates, sea plane.

New CC0 assets: none required for Phase 1. Optional, only if the cow-plus-horns ox fails the render check: Quaternius "Ultimate Animated Animals" bull/ox if present in the already-imported pack (CC0); otherwise I will list a candidate and its licence and ask before importing. No downloads without your approval.

## 4. Verification
Local, no spend:
- Unit tests: spec validator (bad enums, invented ids, era conflicts), synonym table, builder determinism (same spec -> same object list/transforms), v1/v2 manifests still compile identically to today (golden comparison against saved Hannibal/Molasses manifests), "fail before paid render" path, registry gate rejects entries without a passing audit.
- Existing renderer tests all re-run.
- Local CPU Blender stills of 4 Hannibal places: mountain pass at night, Roman camp, valley, river crossing — each with the uploaded man/woman, plus ox with burning horns and torch in the pass shot. I will check: no white void, no painted card, terrain fills the frame edge to edge, key object >=15% height in wide shots, night brightness above the finish QA threshold. Stills saved to Files for you.
Not verified locally: GPU Cycles look/timing on Azure T4, full animated shots and motion, the real AI spec quality across many topics (only Hannibal plus 2 offline sample stories), full-video blind judges, end-to-end paid run.

## 5. Risks and recommended cuts
- Terrain/fog adds render time per frame on the T4; I will measure CPU still time and estimate GPU impact, not guess.
- Kenney/Quaternius styles differ; mixing packs in one place may look uneven — modules will prefer one pack per place.
- Ox from cow + horns may read as a cow; fallback is the bull check above.
- Hard-fail on undrawable nouns will stop more videos at first; that is the intended trade.
- Recommend cutting from Phase 1: harbour and ancient city street (not needed for Hannibal) — keep them for Phase 1b. Also defer weather snow/rain particles; fog + lighting only.

Cost: local only, no paid AI or render spend except one small Azure text call per test story for the spec step (well under $0.10 total). I will report actual spend.
