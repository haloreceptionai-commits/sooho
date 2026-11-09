"""Builds assets/map/regions.json from Natural Earth 1:50m countries (public domain).
Usage: python3 tools/build-map.py ne_50m_admin_0_countries.geojson"""
import json, sys, math
from pathlib import Path
src = json.load(open(sys.argv[1]))
def simplify(ring, tol=0.08):
    out = [ring[0]]
    for p in ring[1:]:
        if math.hypot(p[0]-out[-1][0], p[1]-out[-1][1]) >= tol: out.append(p)
    return [[round(x, 2), round(y, 2)] for x, y in out] if len(out) >= 4 else []
regions = {}
for f in src['features']:
    p = f['properties']; rid = p['ADM0_A3'].lower(); g = f['geometry']
    polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
    rings = [r for r in (simplify(poly[0]) for poly in polys) if r]
    if rings: regions[rid] = {'name': p['NAME'], 'rings': rings}
# Historical presets are unions of modern regions (simplified outlines, not survey-accurate).
PRESETS = {
  'ottoman_empire': ['tur','grc','bgr','mkd','alb','srb','bih','mne','kos','rou','syr','lbn','isr','psx','jor','irq','egy','lby','tun','cyp','sau'],
  'roman_empire': ['ita','fra','esp','prt','grc','tur','egy','tun','lby','dza','mar','syr','lbn','isr','jor','alb','hrv','svn','bih','srb','mne','mkd','bgr','cyp','che','aut','bel','lux','gbr'],
  'mongol_empire': ['mng','chn','kaz','kgz','uzb','tkm','tjk','irn','afg','rus','prk','kor','irq'],
  'british_empire': ['gbr','irl','ind','pak','bgd','mmr','can','aus','nzl','zaf','egy','ken','nga','gha','uga','tza','zwe','zmb','mys','sgp','jam'],
  'alexander_empire': ['mkd','grc','tur','egy','syr','lbn','isr','jor','irq','irn','afg','pak','tkm','uzb'],
  'persian_empire': ['irn','irq','tur','syr','egy','afg','pak','tkm','uzb','arm','aze','geo','jor','isr','lbn'],
  'spanish_empire': ['esp','mex','per','col','ven','arg','chl','bol','ecu','cub','phl','gtm','hnd','nic','pan'],
  'holy_roman_empire': ['deu','aut','cze','che','nld','bel','lux','svn'],
  'byzantine_empire': ['grc','tur','bgr','mkd','alb','cyp'],
  'soviet_union': ['rus','ukr','blr','kaz','uzb','tkm','kgz','tjk','arm','aze','geo','mda','ltu','lva','est'],
  'ancient_egypt': ['egy','sdn'],
}
for k, ids in PRESETS.items():
    missing = [i for i in ids if i not in regions]
    if missing: raise SystemExit(f'{k}: unknown {missing}')
out = Path(__file__).resolve().parent.parent / 'assets/map/regions.json'
out.write_text(json.dumps({'source': 'Natural Earth 1:50m admin-0 (public domain)', 'regions': regions, 'presets': PRESETS}, separators=(',', ':')))
ids = sorted(list(regions) + list(PRESETS))
(out.parent / 'region-ids.json').write_text(json.dumps(ids))
print(len(regions), 'regions', out.stat().st_size // 1024, 'KB')
