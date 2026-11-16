"""World Pack (mirror of src/lib/world-pack.ts): topic-independent place + era for every story.
Kits are only dressing: a kit is used only when the location names it AND its look fits the story's era.
A place with painted backdrop layers is shown as those layers behind a neutral ground; otherwise neutral."""
import re
from collections import Counter

LAYERS = ('far', 'mid')
STOP = {'a', 'an', 'the', 'of', 'in', 'on', 'at', 'and', 'with', 'near', 'by', 'to'}
YEAR = re.compile(r'\b(1[0-9]{3}|20[0-9]{2})\b')
# Years each kit's look truthfully represents (its models are low-poly medieval/old-west/generic).
KIT_ERA = {'village': (0, 1850), 'castle': (0, 1700), 'market': (0, 1850), 'street': (0, 1850), 'saloon': (1840, 1920),
           'mine_tunnel': (1800, 1960), 'rail_yard': (1830, 1950), 'ship_deck': (0, 1900)}


BC = re.compile(r'\b(\d{1,4})\s*(bce|bc|b\.c\.)(?![a-z])', re.I)
AD = re.compile(r'\b(?:ad|a\.d\.)\s*(\d{1,4})\b', re.I)


def place_slug(location):
    t = AD.sub(' ', BC.sub(' ', str(location or '').lower()))
    t = YEAR.sub(' ', t)
    t = re.sub(r'\b(1[0-9]{3}|20[0-9]{2})s\b', ' ', t)
    words = [w for w in re.findall(r'[a-z0-9]+', t) if w not in STOP][:4]
    kept = []
    for w in words:
        if len('_'.join(kept + [w])) > 20: break
        kept.append(w)
    return '_'.join(kept)


def story_year(text):
    text = str(text or '')
    years = [-int(y) for y, _ in BC.findall(text)] + [int(y) for y in AD.findall(text)]
    years += [int(y) for y in YEAR.findall(AD.sub(' ', BC.sub(' ', text)))]
    c = Counter(years)
    if not c: return None
    return sorted(c.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]


def kit_fits_era(kit, year):
    if year is None or kit not in KIT_ERA: return True
    a, b = KIT_ERA[kit]; return a <= year <= b


def backdrop_for(location, cards):
    """Painted layers available for this location (card files 'bg-<slug>-<layer>.png'), far first."""
    slug = place_slug(location) if location else ''
    return [{'image': f'bg-{slug}-{l}.png', 'layer': l} for l in LAYERS if slug and f'bg-{slug}-{l}.png' in cards]
