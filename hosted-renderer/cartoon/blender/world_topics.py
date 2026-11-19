"""Topic -> world router for the cartoon-v2 pipeline (pure Python, no Blender needed).

A short topic such as "war at night" or "high street with cars" is matched to one of the
61 zones exported from the Everything World (worlds/everything/manifest.json). The result
is a complete shot dictionary that render_shot.py accepts, so no manual scene commands are needed.

Coordinates: the manifest uses three.js space (x, y up, z). Blender uses (x, -z, y), so every
camera position and look-at point is converted here once.
"""
import json
import math
import os
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
PIPE = HERE.parent                      # hosted-renderer/cartoon-v2
WORLD_REL = 'worlds/everything'
# 'full' = the whole Everything World in one GLB (default); 'zones' = one GLB per zone.
# Set WORLD_SOURCE=zones in the environment to use the per-zone files.
WORLD_SOURCE = os.environ.get('WORLD_SOURCE', 'zone')
FULL_FILE = PIPE / WORLD_REL / 'EverythingWorld_full.glb'
MANIFEST = json.loads((PIPE / WORLD_REL / 'manifest.json').read_text(encoding='utf-8'))
ZONES = {z['name']: z for z in MANIFEST}

# Extra words a viewer might use for each zone. Matched as whole phrases, longest first.
SYNONYMS = {
    'Battlefield': ['war', 'battle', 'battlefield', 'warzone', 'war zone', 'front line', 'frontline', 'trench', 'trenches', 'combat', 'soldiers'],
    'Highway (Elevated)': ['road', 'roads', 'highway', 'motorway', 'freeway', 'expressway', 'traffic', 'cars on road'],
    'Suburb (Private Street)': ['house', 'houses', 'home', 'homes', 'street', 'residential', 'neighbourhood', 'neighborhood', 'suburb', 'suburbs', 'terraced'],
    'Interior (Modern House)': ['interior', 'inside house', 'living room', 'house interior', 'home interior', 'kitchen', 'indoor home', 'flat interior'],
    'Downtown (City Centre)': ['town', 'towns', 'town centre', 'town center', 'city', 'city centre', 'city center', 'downtown', 'skyscraper', 'sky tower', 'skyscrapers', 'sky towers'],
    'High Street': ['high street', 'main street', 'shopping street', 'shops street'],
    'Village': ['village', 'countryside village', 'hamlet'],
    'Supermarket': ['market', 'markets', 'food market', 'grocery', 'supermarket', 'bazaar'],
    'Mall': ['mall', 'shopping mall', 'shopping centre', 'shopping center'],
    'Playground & Park': ['grassland', 'grass land', 'grass', 'meadow', 'field', 'fields', 'park', 'playground', 'lawn'],
    'Farm': ['farm', 'farmland', 'countryside'],
    'Offices & Business Park': ['office', 'offices', 'business park', 'corporate', 'office block'],
    'Warehouse & Logistics': ['warehouse', 'warehouses', 'logistics', 'depot', 'storage'],
    'Hospital & Fire Station': ['hospital', 'hospitals', 'clinic', 'fire station', 'ward'],
    'School': ['school', 'schools', 'classroom', 'college', 'university'],
    'Police Station & Jail': ['police', 'police station', 'jail', 'county jail'],
    'Prison': ['prison cell', 'prison yard'],
    'Military Base & Cantonment': ['military', 'army base', 'base camp', 'army', 'cantonment'],
    'Railway Station': ['station', 'railway', 'train station', 'railroad', 'train'],
    'Airport': ['airport', 'runway', 'plane', 'aeroplane', 'airplane'],
    'Forest & Campsite': ['forest', 'woods', 'camping', 'campsite', 'camp'],
    'Beach': ['beach', 'seaside', 'sand beach'],
    'Desert': ['desert', 'sand dunes', 'dunes'],
    'Mountain': ['mountain', 'mountains', 'hill', 'peak'],
    'Jungle': ['jungle', 'rainforest'],
    'Castle': ['castle', 'fortress', 'medieval'],
    'Ruins': ['ruins', 'ancient ruins'],
    'Temple': ['temple', 'shrine'],
    'Cemetery': ['cemetery', 'graveyard', 'graves'],
    'Spaceship Landing Site': ['spaceship', 'space ship', 'alien', 'sci fi', 'sci-fi', 'landing site'],
    'Wasteland': ['wasteland', 'post apocalypse', 'apocalypse'],
    'Stadium': ['stadium', 'football', 'sports ground'],
    'Harbour (Port & Docks)': ['harbour', 'harbor', 'port', 'docks', 'dock', 'ship yard'],
    'Bridge (Suspension)': ['bridge', 'suspension bridge'],
    'Tunnel': ['tunnel'],
    'Cinema': ['cinema', 'movie theatre', 'movie theater'],
    'Restaurant Street': ['restaurant street', 'food street', 'restaurants'],
    'Restaurant': ['restaurant', 'cafe', 'diner'],
    'Museum': ['museum', 'gallery'],
    'Bank': ['bank'],
    'Hotel': ['hotel', 'inn'],
    'Gym': ['gym', 'fitness'],
    'Bus & Metro Hub': ['bus station', 'metro', 'subway', 'bus hub'],
    'Garage (Car Park & Mechanic)': ['garage', 'car park', 'parking', 'mechanic'],
    'Apartment Block': ['apartment', 'apartments', 'flats', 'apartment block'],
    'Mansion': ['mansion', 'luxury house', 'villa'],
    'Slum': ['slum', 'slums', 'favela', 'shanty'],
    'Alleyway': ['alley', 'alleyway', 'back street', 'lane'],
    'Factory': ['factory', 'plant floor', 'manufacturing'],
    'Power Plant': ['power plant', 'power station', 'nuclear', 'reactor'],
    'Bunker': ['bunker', 'underground base'],
    'Mine': ['mine', 'mining', 'quarry'],
    'Laboratory Campus': ['laboratory', 'lab', 'science', 'research lab'],
    'Cave': ['cave', 'caves', 'cavern'],
    'Swamp': ['swamp', 'marsh', 'bog'],
    'Arctic': ['arctic', 'snow', 'ice', 'winter', 'polar'],
    'Island': ['island', 'tropical island'],
    'Underwater': ['underwater', 'ocean floor', 'sea floor', 'under water'],
    'Library': ['library', 'public library'],
    'Play Place & Fun Fair': ['fun fair', 'funfair', 'amusement', 'play place', 'theme park'],
    'Arcade': ['arcade', 'games arcade'],
}

# Lighting words -> shot lighting value (validate_shot allows day, sunset, night, rain).
LIGHTING = [('night', 'night'), ('midnight', 'night'), ('dark', 'night'), ('sunset', 'sunset'),
            ('dusk', 'sunset'), ('evening', 'sunset'), ('golden', 'sunset'), ('rain', 'rain'),
            ('storm', 'rain'), ('wet', 'rain')]
DEFAULT_ZONE = 'Downtown (City Centre)'


def _norm(text):
    return ' ' + re.sub(r'[^a-z0-9& ]+', ' ', text.lower()).strip() + ' '


def _phrase_table():
    rows = []
    for zone, words in SYNONYMS.items():
        if zone not in ZONES:
            raise KeyError(f'synonym for unknown zone {zone!r}')
        for w in words:
            rows.append((w.lower(), zone))
        # the zone's own name is also a phrase, e.g. "high street" or "village"
        rows.append((re.sub(r'\(.*?\)', '', zone).strip().lower(), zone))
    # longest phrase first, so "high street" beats "street"
    rows.sort(key=lambda r: -len(r[0]))
    return rows


_PHRASES = _phrase_table()


def match_zone(topic):
    """Return (zone_name, matched_phrase) or (DEFAULT_ZONE, None) when nothing matches."""
    text = _norm(topic)
    for phrase, zone in _PHRASES:
        p = _norm(phrase)
        if p in text:
            return zone, phrase
    return DEFAULT_ZONE, None


def lighting_for(topic):
    text = _norm(topic)
    for word, value in LIGHTING:
        if f' {word} ' in text:
            return value
    return 'day'


def three_to_blender(p):
    x, y, z = p
    return [float(x), float(-z), float(y)]


def spawn_of(zone):
    """Camera spawn (x, z, yaw) in three space. Same default the Everything World uses."""
    sp = zone.get('cameraSpawn')
    if sp:
        return sp[0], sp[1], sp[2]
    cx, cz = zone['centre']
    d = zone['size'][1]
    return cx, cz - d * 0.42, math.pi


def local_blender(zone, p):
    """three.js point -> Blender point relative to the zone centre. world_env moves each imported
    zone so its centre sits at the origin, which keeps every shot coordinate small (validate_shot
    limits values to +-1000 m)."""
    cx, cz = zone['centre']
    x, y, z = p
    return [float(x - cx), float(-(z - cz)), float(y)]


def camera_for(zone):
    """Camera in zone-local Blender space, looking along the spawn yaw, 30 m ahead, 2.2 m high."""
    x, z, yaw = spawn_of(zone)
    fwd_x, fwd_z = -math.sin(yaw), -math.cos(yaw)       # three.js forward for rotation.y = yaw
    h = 12.6 if zone['name'].startswith('Highway') else 2.2   # the highway camera stands on the deck (about 11.2 m)
    eye = local_blender(zone, [x, h, z])
    aim = local_blender(zone, [x + 30 * fwd_x, h + 0.4, z + 30 * fwd_z])
    return eye, aim


def resolve(topic):
    """Topic text -> plan dict used by make_shot()."""
    zone_name, phrase = match_zone(topic)
    zone = ZONES[zone_name]
    eye, aim = camera_for(zone)
    lighting = lighting_for(topic)
    text = _norm(topic)
    road = (zone_name == 'High Street' and any(w in text for w in (' road ', ' traffic ', ' cars ', ' car ')))
    file_name = f"{zone['index']}_{re.sub(r'[^A-Za-z0-9]+', '_', zone_name).strip('_')}.glb"
    if WORLD_SOURCE == 'full' and FULL_FILE.is_file():
        file_name = FULL_FILE.name       # the whole world, same coordinates as the zone manifest
    return {
        'zone': zone_name,
        'matched': phrase is not None,
        'matched_phrase': phrase,
        'index': zone['index'],
        'category': zone['category'],
        'file': f'{WORLD_REL}/{file_name}',
        'road': road,
        'lighting': lighting,
        'eye': eye,
        'aim': aim,
    }


# Outfits for people in a zone. Anything not listed gets an everyday outfit.
ZONE_OUTFITS = {
    'Battlefield': ['soldier', 'armor'], 'Military Base & Cantonment': ['soldier', 'uniform'],
    'Police Station & Jail': ['police', 'uniform'], 'Hospital & Fire Station': ['labcoat', 'uniform'],
    'School': ['sweater', 'hoodie'], 'Village': ['worker', 'tunic'], 'Market': ['merchant', 'apron'],
}
EVERYDAY = ['hoodie', 'suit', 'sweater', 'worker', 'dress']


def people_for(plan, eye, aim, n):
    """n people standing on either side of the camera's path, in zone-local metres.
    Positions are ahead of the camera (14-22 m) and 4.5-6 m to the side, so they are not huge in frame."""
    fx, fy = aim[0] - eye[0], aim[1] - eye[1]
    length = math.hypot(fx, fy) or 1.0
    fx, fy = fx / length, fy / length
    lx, ly = -fy, fx                                    # left of the camera's view
    outfits = ZONE_OUTFITS.get(plan['zone'], EVERYDAY)
    cast = []
    for k in range(n):
        ahead = 14.0 + 4.0 * (k // 2)
        side = (4.5 + 1.0 * (k // 2)) * (1 if k % 2 == 0 else -1)
        x = eye[0] + fx * ahead + lx * side
        y = eye[1] + fy * ahead + ly * side
        cast.append({
            'pos': [round(x, 2), round(y, 2)],
            'action': 'walk' if k % 3 == 0 else 'stand',
            'outfit': outfits[k % len(outfits)],
            'expression': 'neutral',
        })
    return cast


def make_shot(topic, duration=0.4, fps=24, samples=64, size=(960, 540), people=4):
    """A complete shot dict for render_shot.py. Validate it with shot_schema.validate_shot.
    size is (W, H): 960x540 for tests, 1920x1080 for YouTube landscape.
    people: how many characters stand in the shot (0-12)."""
    plan = resolve(topic)
    return {
        'look': 'realistic',
        'set': 'open_day',
        'lighting': plan['lighting'],
        'duration': duration,
        'fps': fps,
        'size': [int(size[0]), int(size[1])],
        'engine': 'cycles',
        'samples': samples,
        'cast': people_for(plan, plan['eye'], plan['aim'], max(0, min(12, int(people)))),
        'camera': {'from': plan['eye'], 'look_at': plan['aim'], 'lens': 35},
        'world': {'zone': plan['zone'], 'file': plan['file'], 'road': plan['road'],
                  'lighting': plan['lighting'], 'topic': topic[:120]},
    }


def list_zones():
    return [(z['index'], z['name'], z['category']) for z in MANIFEST]
