"""Import CC0 Kenney packs into assets/library and write catalog.json (the Director's searchable object list).
Usage: python3 tools/build-library.py <unzipped-packs-dir>. Only CC0 packs are accepted."""
import json, re, shutil, struct, sys
from pathlib import Path
root = Path(__file__).resolve().parent.parent
src = Path(sys.argv[1]); out = root / 'assets/library'
# pack -> (topic tags, default height in metres for a normalised model)
PACKS = {
 'pirate-kit': ('pirate ship sea sailor ocean treasure island', 1.2), 'castle-kit': ('castle medieval king knight fortress', 3),
 'food-kit': ('food kitchen cooking meal eat', .35), 'furniture-kit': ('furniture house home room interior', 1),
 'nature-kit': ('nature forest tree plant rock outdoor', 2), 'city-kit-commercial': ('city building shop modern street', 8),
 'city-kit-suburban': ('city house suburb home street', 6), 'city-kit-roads': ('road street city traffic', 2),
 'space-kit': ('space planet rocket alien astronaut sci-fi', 2), 'space-station-kit': ('space station sci-fi interior', 2.5),
 'modular-space-kit': ('space station sci-fi corridor', 2.5), 'survival-kit': ('survival camp wilderness tools', 1),
 'graveyard-kit': ('graveyard halloween spooky death ghost church', 1.5), 'fantasy-town-kit': ('medieval town village fantasy', 3),
 'holiday-kit': ('christmas holiday winter festive', 1), 'car-kit': ('car vehicle road transport', 1.6),
 'racing-kit': ('race car track vehicle', 1.6), 'train-kit': ('train railway station transport', 2.5),
 'mini-characters': ('person character people crowd', 1.6), 'blocky-characters': ('person character people crowd', 1.6),
 'cube-pets': ('animal pet', .8), 'platformer-kit': ('game nature coin platform', 1), 'factory-kit': ('factory industry machine', 2),
 'tower-defense-kit': ('tower war defense battle', 2), 'mini-dungeon': ('dungeon medieval cave torch', 1.5),
 'building-kit': ('building construction house', 3), 'modular-buildings': ('building house city', 3),
 'blaster-kit': ('weapon gun sci-fi', .6), 'mini-skate': ('skate park sport', 1), 'holiday': ('holiday', 1),
}
SIZE = [(r'tree|pine|palm|tower|building|house|church|castle|wall|gate|windmill|lighthouse', 4), (r'ship|boat', 3),
        (r'car|truck|van|bus|train|wagon|cart', 1.8), (r'table|chair|bed|sofa|desk|shelf|cabinet|barrel|crate|chest|cannon', 1),
        (r'rock|stone|bush|flower|grass|mushroom', .8), (r'coin|cup|plate|bottle|apple|banana|bread|cheese|key|book|candle', .3)]
def size(pack, name):
  for pat, h in SIZE:
    if re.search(pat, name): return min(h, PACKS[pack][1] * 3) if pack != 'food-kit' else .35
  return PACKS[pack][1]
catalog = []
if out.exists(): shutil.rmtree(out)
for pack, (topic, _) in PACKS.items():
  base = src / pack
  if not base.exists(): continue
  lic = (base / 'License.txt').read_text(errors='ignore')
  if 'CC0' not in lic and 'Creative Commons Zero' not in lic: raise SystemExit(f'{pack} is not CC0')
  glbs = sorted(p for p in base.rglob('*.glb') if 'GLB' in str(p.parent) or 'GLTF' in str(p.parent))
  if not glbs: continue
  dest = out / pack; dest.mkdir(parents=True)
  shutil.copy(base / 'License.txt', dest / 'License.txt')
  tex = glbs[0].parent / 'Textures'
  if tex.exists(): shutil.copytree(tex, dest / 'Textures')
  for g in glbs:
    shutil.copy(g, dest / g.name)
    b = g.read_bytes(); n = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + n])
    for im in j.get('images', []):
      if 'uri' in im and not (dest / im['uri']).exists(): raise SystemExit(f'missing texture {pack}/{im["uri"]}')
    name = g.stem.lower()
    words = sorted(set(re.split(r'[-_ ]+', name) + topic.split()) - {'a', 'b', 'c', 'd', 'e', 'f', 'large', 'small', ''})
    catalog.append({'id': f'{pack}/{g.stem}', 'pack': pack, 'name': re.sub(r'[-_]+', ' ', name), 'tags': [w for w in words if not w.isdigit()], 'h': size(pack, name), 'type': 'model'})
# 2D painted animals/fish from CC0 sprite packs render as cards.
for pack, topic in [('animal-pack', 'animal wildlife zoo farm'), ('fish-pack', 'fish sea ocean underwater')]:
  base = src / pack
  if not base.exists(): continue
  dest = out / pack; dest.mkdir(parents=True); shutil.copy(base / 'License.txt', dest / 'License.txt')
  pngs = sorted(p for p in base.rglob('*.png') if 'Preview' not in p.name and ('Round' in str(p) or 'PNG/Default' in str(p) or pack == 'fish-pack'))
  seen = set()
  for p in pngs:
    if p.stem in seen or 'sample' in p.stem.lower(): continue
    seen.add(p.stem); shutil.copy(p, dest / p.name)
    name = p.stem.lower()
    catalog.append({'id': f'{pack}/{p.stem}', 'pack': pack, 'name': re.sub(r'[-_]+', ' ', name), 'tags': sorted(set(re.split(r'[-_ ]+', name) + topic.split()) - {''}), 'h': 1.5 if pack == 'animal-pack' else .7, 'type': 'sprite'})
(out / 'catalog.json').write_text(json.dumps(catalog, separators=(',', ':')))
print(len(catalog), 'objects from', len({c['pack'] for c in catalog}), 'packs')
