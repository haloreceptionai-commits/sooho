# cartoon-v2 status

## Works
- Topic router (`blender/world_topics.py`): all 61 zones route to themselves. 22 unit tests pass.
- World builder (`blender/world_env.py`), shot CLI (`blender/make_world_shot.py --render`), schema and render hook.
- Per-zone GLBs in `worlds/everything/` (61 files plus manifest; git-ignored). Use `WORLD_SOURCE=zone`.
- Topic renders checked in `out/contact_sheet_topics.png`:
  - Suburb (house), Hospital, Offices and Village (sunset): look right, people in frame.
  - Battlefield (war): sandbag lines and craters added; still stylized, with sparse tanks and ruins.
  - Highway (road): the grey block is fixed. The camera was inside a central barrier. Barrier meshes that contain the camera are now hidden.

## Zip test (EverythingWorld_zones.zip)
- Extracted to `worlds/incoming-zones/zone/` (62 files). Not applied.
- Zone content is present, but the materials are wrong: most surfaces are near-black (e.g. Material_2 base colour 0.01, 0.01, 0.01), so ground and roads render black, and buildings are not visible in the renders.
- Renders with the zip set: 5 of 6 topics were black or empty. The current per-zone set stays the default. Restored from `worlds/everything-before-zip/`.
- Near-black materials: the full GLB has 105 of 1292; the zip Suburb zone has 11 of 91; the current per-zone set has 0 of 61.
- Tried lifting near-black base colours on import (`_lift_black_materials`). The renders did not change, so the black comes from something other than those base colours. Not resolved.
- Re-exported from the source world with `worlds/source/export_zones.html` (in the browser pane). The new files are the same size as the current set (61 files, 6 differ by bytes). Six topic renders match the current set, with no black ground.
- So the zip is the outlier. Its export differs from ours in material colours. The current per-zone set is kept.
- `export_zones.html` was fixed: the exporter runs as a script in the frame, and the scene is read inside the frame.

## Known problems
- **Highway**: fixed. The deck was not in the first export; the re-export (`export_zones.html`, cap per zone) includes it. The highway camera stands on the deck (12.6 m).
- **Full-world GLB**: about 3 minutes per import. The High Street overhead structure and bus are not investigated. Per-zone GLBs are the default.
- **Seeded export** (`worlds/everything-seeded/`): not completed.
- Nothing committed, pushed or deployed.

## Next
2. Decide per-zone vs full world as the default.

## Fine-tune zip (EverythingWorld_zones fine tune.zip, 10:33)
- Extracted to `worlds/incoming-finetune/zone/` (62 files). Not applied.
- Near-black base colours: 0 in the sampled zones. Textures are not black.
- Renders: the same black ground under the sky as the earlier zip. An A/B render of the house shot with the re-exported set (same code) is fine, so the zip's content causes it. The exact cause is not found.
- Kept the re-exported set as the default. Backup of the earlier set: `worlds/everything-before-finetune/`.
