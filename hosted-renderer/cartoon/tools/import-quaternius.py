"""Add CC0 Quaternius packs to assets/library (additive: other packs and their catalog entries are kept).
Usage: python3 tools/import-quaternius.py <raw-dir> <FBX2glTF-binary>
<raw-dir>/<pack>/... holds each pack's FBX files, textures and License.txt as downloaded from quaternius.com.
Every FBX is converted to a binary glTF with textures embedded; rigged models keep their animation clips."""
import json, re, shutil, struct, subprocess, sys, tempfile
from pathlib import Path
root = Path(__file__).resolve().parent.parent
src, conv = Path(sys.argv[1]), sys.argv[2]
out = root / 'assets/library'
# pack -> (topic tags, default height in metres)
TOPIC = {
 'animatedalien': ('alien space creature', 1.6), 'animateddinosaurs': ('dinosaur prehistoric jurassic animal', 3),
 'animatedfish': ('fish sea ocean underwater', .8), 'animatedman': ('person man character', 1.75), 'animatedmen': ('person man character', 1.75),
 'animatedwoman': ('person woman character', 1.65), 'animatedwomen': ('person woman character', 1.65), 'animatedzombie': ('zombie undead horror', 1.75),
 'animatedmonster': ('monster creature', 1.8), 'animatedrobot': ('robot machine sci-fi', 1.7), 'animatedmech': ('robot mech war machine', 3),
 'animatedtanks': ('tank war army military', 2.5), 'backgroundposedhumans': ('person people crowd character', 1.7),
 'buildings': ('building city house', 8), 'cars': ('car vehicle road', 1.6), 'cutefish': ('fish sea ocean', .6), 'cutemonsters': ('monster creature cute', 1.2),
 'cyberpunkgamekit': ('cyberpunk future city neon', 2), 'easyenemy': ('monster enemy creature', 1.2), 'farmanimal': ('farm animal', 1.2),
 'farmbuildings': ('farm barn village', 5), 'furniture': ('furniture house room interior', 1), 'junkfood': ('food fast junk meal', .35),
 'medievaldungeon': ('dungeon medieval castle', 1.5), 'medievalvillage': ('medieval village town', 4), 'medievalweapons': ('weapon medieval sword war', 1),
 'modulardungeon': ('dungeon medieval', 2), 'modularmedievalbuildings': ('medieval building town', 4), 'modularplatformer': ('platform game', 1),
 'modularstreets': ('street city road', 2), 'modulartrain': ('train railway', 3), 'piratekit': ('pirate ship sea treasure island', 1.5),
 'publictransport': ('bus train transport city vehicle', 3), 'rpg': ('fantasy medieval adventure', 1), 'rpgcharacters': ('fantasy character hero warrior wizard', 1.75),
 'scifimodularguns': ('weapon gun sci-fi', .6), 'ships': ('ship boat sea', 4), 'simplebuildings': ('building house city', 6),
 'simplenature': ('nature tree rock plant', 2), 'spaceships': ('spaceship space sci-fi', 4), 'stylizedtree': ('tree forest nature', 4),
 'survival': ('survival camp wilderness', 1), 'sushirestaurantkit': ('sushi restaurant japan food kitchen', 1), 'texturedfantasynature': ('nature fantasy tree', 3),
 'toonshootergamekit': ('war soldier military', 1.5), 'turretpack': ('turret weapon war', 2), 'ultimateanimatedanimals': ('animal wildlife', 1.3),
 'ultimatecrops': ('farm crop plant vegetable', .6), 'ultimatedanimatedcharacter': ('person character people', 1.75), 'ultimatefantasyrts': ('fantasy medieval army kingdom', 2),
 'ultimatefood': ('food meal kitchen', .35), 'ultimatefurniture': ('furniture house interior', 1), 'ultimategun': ('weapon gun', .6),
 'ultimatehomeinterior': ('house home interior room', 1), 'ultimatemodularcharacters': ('person character', 1.75), 'ultimatemodularruins': ('ruins ancient temple', 3),
 'ultimatemodularscifi': ('sci-fi space station', 2.5), 'ultimatemodularwomen': ('person woman character', 1.65), 'ultimatemonsters': ('monster creature', 1.6),
 'ultimatenature': ('nature tree forest rock plant', 2), 'ultimateplatformer': ('platform game', 1), 'ultimaterpg': ('fantasy medieval rpg', 1),
 'ultimatespacekit': ('space planet astronaut rocket', 2), 'ultimatespaceships': ('spaceship space', 6), 'ultimatestylizednature': ('nature tree forest', 3),
 'ultimatetexturedbuildings': ('building city house', 8), 'zombieapocalypsekit': ('zombie apocalypse ruin city', 1.5), 'cubeworldkit': ('cube block world game', 1),
}
SIZE = [(r'dino|t-?rex|trex|brachio|stego|elephant|giraffe', 3.5), (r'horse|cow|deer|bull|camel|stag', 1.6), (r'dog|wolf|fox|sheep|pig|alpaca|husky', .9),
        (r'cat|chicken|rabbit|bunny|duck|frog|bird|penguin', .45), (r'tree|pine|palm|tower|building|house|church|castle|windmill|lighthouse', 4),
        (r'ship|boat', 3), (r'car|truck|van|bus|train|wagon|cart|tank', 2), (r'table|chair|bed|sofa|desk|shelf|cabinet|barrel|crate|chest|cannon', 1),
        (r'rock|stone|bush|flower|grass|mushroom', .8), (r'coin|cup|plate|bottle|apple|banana|bread|cheese|key|book|candle|burger|pizza|sushi', .3)]
def height(pack, name):
  for pat, h in SIZE:
    if re.search(pat, name): return h
  return TOPIC[pack][1]
def info(glb):
  b = glb.read_bytes(); n = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + n])
  return j, len(b)
catalog = [c for c in json.loads((out / 'catalog.json').read_text()) if not c['pack'].startswith('q-')]
for d in out.glob('q-*'): shutil.rmtree(d)
added = skipped = 0
for pack, (topic, _) in TOPIC.items():
  base = src / pack
  if not base.exists(): continue
  lic = next(base.rglob('License.txt'), None)
  text = lic.read_text(errors='ignore') if lic else ''
  if 'CC0' not in text and 'Creative Commons Zero' not in text and 'publicdomain/zero' not in text: print('skip (licence not CC0):', pack); continue
  dest = out / f'q-{pack}'; dest.mkdir(parents=True); shutil.copy(lic, dest / 'License.txt')
  seen = set()
  for fbx in sorted(base.rglob('*.fbx')):
    stem = re.sub(r'[^A-Za-z0-9_-]+', '_', fbx.stem)[:60]
    if stem.lower() in seen: continue
    with tempfile.TemporaryDirectory() as t:
      r = subprocess.run([conv, '-b', '-i', str(fbx), '-o', f'{t}/m'], capture_output=True, text=True, cwd=fbx.parent, timeout=120)
      g = Path(t) / 'm.glb'
      if r.returncode or not g.exists(): skipped += 1; continue
      j, size = info(g)
      if size > 6_000_000 or not j.get('meshes') or any('uri' in im for im in j.get('images', [])): skipped += 1; continue
      shutil.copy(g, dest / f'{stem}.glb')
    seen.add(stem.lower())
    name = re.sub(r'[-_]+', ' ', stem).lower().strip()
    words = sorted(set(re.split(r'[-_ ]+', name) + topic.split()) - {'a', 'b', 'c', 'd', 'e', 'f', 'large', 'small', 'smooth', ''})
    entry = {'id': f'q-{pack}/{stem}', 'pack': f'q-{pack}', 'name': name, 'tags': [w for w in words if not w.isdigit()], 'h': height(pack, name), 'type': 'model'}
    clips = [a.get('name', '') for a in j.get('animations', [])]
    if clips: entry['clips'] = [c.split('|')[-1] for c in clips][:24]
    catalog.append(entry); added += 1
(out / 'catalog.json').write_text(json.dumps(catalog, separators=(',', ':')))
print(added, 'Quaternius objects added,', skipped, 'skipped;', len(catalog), 'total')
