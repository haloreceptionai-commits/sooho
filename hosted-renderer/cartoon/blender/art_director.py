"""Deterministic Advanced art director: turns a locked manifest into benchmark-paced Blender segments.

Pure Python (no Blender). It reads each manifest shot plus the words actually spoken during it and
decides, with fixed rules only:
  * which 3D location (set + zone) the line happens in, so the story travels between places;
  * how long shots are split into 2-3 camera setups (benchmark median shot ~2-3 s);
  * a camera grammar (establish, wide, medium, close, extreme close, low, high, over-the-shoulder,
    tracking, orbit, insert) that never repeats back-to-back;
  * literal character performance from the spoken verbs (walk/run across frame, aim, carry, panic ...);
  * crowds, herds of painted animal cards that run, whitelisted 3D props and word-timed effects.
Everything compiles to shot_schema-validated JSON; nothing the language model wrote is executed.
"""
import math, re
from shot_schema import validate_shot
from shot_director import ZONES as BASE_ZONES, OBJ_CAMS
from object_specs import OBJECTS

FPS = 30
SIZE = (810, 1440)
# ---------------------------------------------------------------- locations
_RING = {'center': ((0, -1), 90), 'left': ((-1.6, 1.8), 125), 'right': ((2.0, 1.4), 58), 'reverse': ((0, 2.5), 270)}
ZONES = {**BASE_ZONES, 'farm_field': _RING, 'outback': _RING, 'forest': _RING, 'market': _RING}
OUTDOOR = {'castle', 'village', 'battlefield', 'street', 'rail_yard', 'farm_field', 'outback', 'forest', 'market', 'ship_deck'}
SET_WORDS = {
    'mine_tunnel': 'mine mines miner miners tunnel tunnels underground cave caves shaft gold-rush dig digging dug ore',
    'ship_deck': 'ship ships sailor sailors sea seas ocean boat boats navy voyage deck sailed sail fleet harbour harbor port island crew',
    'rail_yard': 'train trains railway railways rail rails locomotive track tracks station railroad steam',
    'castle': 'castle castles king kings queen knight knights fortress siege palace throne kingdom empire emperor',
    'office': 'government minister ministers parliament office report reports letter letters newspaper newspapers officials official desk signed law laws politician politicians committee senate president meeting declared ordered permit announced press',
    'workshop': 'invented inventor invention lab laboratory experiment experiments factory engineer engineers built device workshop scientist scientists tested',
    'saloon': 'bar saloon pub tavern drink drinks whisky beer',
    'room': 'home bedroom family kitchen wife husband child children son daughter',
    'farm_field': 'farm farms farmer farmers crop crops wheat field fields harvest barn fence fences plough grain ranch cattle sheep land settlers soldier-settlers corn hay tractor',
    'outback': 'desert outback drought dry dust sand australia australian plains bush wilderness west western scrub nowhere dam waterhole rabbits emus emu kangaroo',
    'forest': 'forest forests woods jungle trees hunting hunter hunters wild wolves',
    'market': 'market markets merchant merchants trade traders shop shops sold sell buy bought price prices store',
    'battlefield': 'army armies troops war battle battles battlefield camp camps tents military artillery cannon enemy campaign platoon front trenches siege',
    'street': 'city cities street streets crowd crowds public citizens people town-hall downtown',
    'village': 'village villages villagers town towns locals neighbours neighbors',
}
WORLD_SET = {'ship': 'ship_deck', 'storm_sea': 'ship_deck', 'town': 'village', 'market': 'market', 'bridge': 'street', 'modern_street': 'street',
             'lab': 'workshop', 'device_cutaway': 'workshop', 'landscape': 'outback', 'night_camp': 'battlefield', 'castle': 'castle',
             'mine': 'mine_tunnel', 'map': 'outback'}
SET_INDEX = {k: set(v.split()) for k, v in SET_WORDS.items()}

# ---------------------------------------------------------------- performance
VERB_ACTION = [  # first match wins; literal verbs in the spoken line drive the body
    (r'\b(ran|run|runs|running|raced|race|sprint\w*|fled|flee\w*|charg\w*|stampede\w*|chas\w*|escap\w*|scatter\w*|bolt\w*)\b', 'run'),
    (r'\b(fir(e|ed|es|ing)|shot|shoot\w*|aim\w*|gun\w*|rifle\w*|machine)\b', 'aim'),
    (r'\b(load\w*|reload\w*|ammunition)\b', 'load'),
    (r'\b(walk\w*|march\w*|travel\w*|arriv\w*|went|go|goes|head\w*|wander\w*|approach\w*|return\w*|crossed|journey\w*)\b', 'walk'),
    (r'\b(carr\w*|haul\w*|deliver\w*|lift\w*|brought|bring\w*)\b', 'carry'),
    (r'\b(dug|dig\w*|smash\w*|hit|hits|hammer\w*|chop\w*|struck|strike\w*|built|build\w*)\b', 'swing'),
    (r'\b(pour\w*|spill\w*|fill\w*)\b', 'pour'),
    (r'\b(kill\w*|hunt\w*|cull\w*)\b', 'aim'),
    (r'\b(fell|fall\w*|died|die|dies|collaps\w*|crash\w*)\b', 'fall'),
    (r'\b(won|win|wins|celebrat\w*|cheer\w*|victory|triumph\w*|success\w*)\b', 'cheer'),
    (r'\b(panic\w*|terrif\w*|chaos|disaster|destroy\w*|ruin\w*|lost|failed|fail\w*|humiliat\w*)\b', 'panic'),
    (r'\b(point\w*|show\w*|explain\w*|discover\w*|found|notic\w*|look\w*|spott\w*|announc\w*|declar\w*|order\w*)\b', 'point'),
    (r'\b(hid|hide\w*|crouch\w*|duck\w*|wait\w*|search\w*|inspect\w*|examin\w*)\b', 'crouch'),
]
LEGACY_ACTION = {'idle': 'stand', 'walk': 'walk', 'run': 'run', 'point': 'point', 'lift': 'carry', 'carry': 'carry', 'hold': 'carry', 'grab': 'carry',
                 'place': 'carry', 'pour': 'pour', 'react': 'panic', 'shout': 'panic', 'cower': 'crouch', 'worried': 'panic', 'wave': 'cheer',
                 'cheer': 'cheer', 'thumbs_up': 'cheer', 'aim': 'aim', 'fire': 'aim', 'load': 'load', 'strike': 'swing', 'throw': 'swing',
                 'inspect': 'crouch', 'tap': 'point', 'think': 'stand', 'shrug': 'stand', 'cross_arms': 'stand', 'look_back': 'walk'}
FACE = {'grin': 'happy', 'smile': 'happy', 'laugh': 'happy', 'relief': 'happy', 'whistle': 'smug', 'stern': 'determined',
        'nervous': 'worried', 'shock': 'shock', 'dazed': 'sad', 'pained': 'sad', 'neutral': 'neutral'}
ACTION_FACE = {'run': 'shock', 'panic': 'shock', 'aim': 'determined', 'load': 'determined', 'swing': 'determined', 'cheer': 'happy', 'fall': 'shock'}
OUTFIT = {'soldier': ('soldier', 'helmet'), 'veteran': ('soldier', 'helmet'), 'knight': ('soldier', 'helmet'), 'captain': ('sailor', 'tricorne'),
          'pirate': ('sailor', 'tricorne'), 'sailor': ('sailor', 'beanie'), 'fisherman': ('sailor', 'beanie'), 'merchant': ('merchant', 'top'),
          'noble': ('merchant', 'top'), 'king': ('merchant', 'top'), 'queen': ('merchant', 'top'), 'scholar': ('merchant', 'none'), 'doctor': ('merchant', 'none'),
          'inventor': ('worker', 'none'), 'spy': ('merchant', 'top'), 'explorer': ('worker', 'beanie'), 'cowboy': ('worker', 'none'),
          'worker': ('worker', 'beanie'), 'blacksmith': ('worker', 'none'), 'farmer': ('worker', 'none'), 'peasant': ('worker', 'none'), 'villager': ('worker', 'beanie')}
SHIRTS = [[0.72, 0.42, 0.22], [0.2, 0.32, 0.6], [0.55, 0.2, 0.2], [0.3, 0.5, 0.3]]
HAT_COLORS = [[0.32, 0.19, 0.06], [0.22, 0.27, 0.16], [0.1, 0.1, 0.12], [0.5, 0.12, 0.08]]
ANIMAL = re.compile(r'(emu|bird|dog|cat|horse|cow|pig|sheep|goat|rat|mouse|wolf|bear|lion|tiger|fox|camel|elephant|monkey|ape|whale|fish|shark|duck|goose|chicken|hen|parrot|owl|eagle|crow|pigeon|rabbit|deer|seal|snake|frog|insect|bee|animal|creature|beast)')

# ---------------------------------------------------------------- props (whitelisted offline models only)
PROP_MODEL = {'barrel': ('pirate-kit/barrel', .9), 'oil_jar': ('pirate-kit/barrel', .8), 'pot': ('pirate-kit/barrel', .6), 'chest': ('pirate-kit/chest', .7),
              'coins': ('pirate-kit/chest', .6), 'gold_piece': ('pirate-kit/chest', .6), 'cannon': ('pirate-kit/cannon', 1.0), 'cart': ('q-medievalvillage/Cart', 1.6),
              'lantern': ('fantasy-town-kit/lantern', .7), 'books': ('furniture-kit/books', .35), 'bottle': ('pirate-kit/bottle', .4), 'flask': ('pirate-kit/bottle', .4),
              'pickaxe': ('pirate-kit/tool-shovel', 1.1), 'tree': ('q-stylizednaturemegakit/CommonTree_3', 5), 'house': ('q-medievalvillage/House_1', 5),
              'rock': ('nature-kit/rock_largeA', 1.4), 'pirate_ship': ('pirate-kit/ship-large', 7), 'merchant_ship': ('pirate-kit/ship-large', 7),
              'rowboat': ('pirate-kit/crate', .7), 'bread': ('pirate-kit/crate-bottles', .6), 'tower': ('castle-kit/tower-square-base', 5),
              'flag': ('castle-kit/flag-banner-long', 2.2), 'clock': ('furniture-kit/sideTable', .8)}
WORD_PROPS = [  # concrete nouns heard in the line -> whitelisted props
    (r'\b(barrel\w*|oil)\b', 'pirate-kit/barrel', .9), (r'\b(crate\w*|suppl\w*|box\w*|ammunition|rounds)\b', 'pirate-kit/crate', .7),
    (r'\b(cart\w*|wagon\w*|truck\w*)\b', 'q-medievalvillage/Cart', 1.6), (r'\b(cannon\w*|artillery)\b', 'pirate-kit/cannon', 1.0),
    (r'\b(treasure|chest|gold|coins?|money|reward|bount\w*)\b', 'pirate-kit/chest', .65), (r'\b(hay|grain|wheat|harvest)\b', 'q-medievalvillage/Hay', 1.2),
    (r'\b(well|water)\b', 'q-medievalvillage/Well', 2.0), (r'\b(fence\w*)\b', 'fantasy-town-kit/fence', 1.0), (r'\b(books?|book|report|records?)\b', 'furniture-kit/books', .35),
    (r'\b(bottles?|drink\w*|whisky|beer)\b', 'pirate-kit/bottle', .4), (r'\b(lantern\w*|lamp\w*|night)\b', 'fantasy-town-kit/lantern', .7),
    (r'\b(logs?|wood|timber)\b', 'nature-kit/log_stack', .9), (r'\b(shovel\w*|dig\w*|dug)\b', 'pirate-kit/tool-shovel', 1.1),
]
STORY_OBJECT_WORDS = {'money_bag': r'\b(money|paid|pay|cost|coins?|reward|bount\w*|cash|dollars?|pounds?)\b', 'gold_pan': r'\b(pan|panning|panned)\b',
                      'dynamite': r'\b(dynamite|explosives?|blast\w*)\b', 'magnifier': r'\b(magnif\w*|clue\w*|evidence|investigat\w*)\b',
                      'covered_cart': r'\b(wagon|covered)\b', 'gold_shotgun': r'\b(shotgun\w*)\b', 'rail_joint': r'\b(rail|rails|track)\b',
                      'hand_drill': r'\b(drill\w*)\b', 'fuse_bundle': r'\b(fuse\w*)\b', 'rocket_arrow': r'\b(rocket\w*|arrow\w*)\b', 'gold_vein': r'\b(vein|ore|nugget\w*)\b'}
FX_WORDS = [(r'\b(explo\w*|blast\w*|bomb\w*|dynamite|boom)\b', 'explosion'), (r'\b(fir(e|ed|es|ing)|shot|shoot\w*|guns?|bullets?|rounds|machine)\b', 'sparks'),
            (r'\b(burn\w*|flames?|blaze)\b', 'fire'), (r'\b(smoke\w*|smok\w*)\b', 'smoke'), (r'\b(dust\w*|stampede\w*|charg\w*|scatter\w*|ran|run\w*|fled|drought)\b', 'dust'),
            (r'\b(rain\w*|storm\w*|flood\w*)\b', 'rain')]
IMPACT = re.compile(r'\b(boom|bang|crash\w*|explo\w*|smash\w*|hit|fir(e|ed|ing)|shot|slam\w*|destroy\w*|collaps\w*)\b')
SCALE_WORDS = re.compile(r'\b(\d[\d,]*|thousands?|hundreds?|millions?|army|armies|entire|whole|all|every|herds?|flocks?|mobs?|swarms?|hordes?|crowds?|nation|country)\b')
CROWD_WORDS = re.compile(r'\b(army|armies|soldiers|troops|crowds?|farmers|people|villagers|citizens|men|workers|miners|public|locals|settlers|residents)\b')
HERD_WORDS = re.compile(r'\b(\d[\d,]*|thousands?|hundreds?|herds?|flocks?|mobs?|swarms?|hordes?|groups?|packs?)\b')
NIGHT = re.compile(r'\b(night|midnight|dark|darkness|moon\w*)\b'); DUSK = re.compile(r'\b(sunset|dusk|evening)\b')

GRAMMAR = ['establish', 'wide', 'medium', 'close', 'xclose', 'low', 'high', 'ots', 'track', 'orbit', 'insert']
HINT = {'wide': 'wide', 'high': 'high', 'low': 'low', 'medium': 'medium', 'over_shoulder': 'ots', 'close': 'close', 'extreme_close': 'xclose', 'insert': 'insert'}


def r3(v): return [round(float(x), 3) for x in v]


def spoken(m, a, b):
    """Words whose onset is inside frames [a, b)."""
    out = []
    for k, w in enumerate(m.get('words') or []):
        f = round(w['start'] * FPS)
        if a <= f < b: out.append((k, w, (m.get('caption_words') or [])[k] if k < len(m.get('caption_words') or []) else w.get('word', '')))
    return out


def text_of(ws): return ' '.join(str(t) for _, _, t in ws).lower().replace('-', ' ')


def tokens(text): return set(re.findall(r"[a-z0-9]+(?:-[a-z]+)?", text.lower()))


# ---------------------------------------------------------------- story-level location planning
def score_sets(text):
    tk = tokens(text); joined = text.lower()
    out = {}
    for st, words in SET_INDEX.items():
        s = 0
        for w in words:
            if '-' in w: s += 2 * (w.replace('-', ' ') in joined)
            elif w in tk: s += 1
        if s: out[st] = s
    return out


def plan_locations(m):
    """One location per manifest shot: the spoken words win, the story's home location is the fallback,
    and a place is not held for more than ~9 s unless the words keep naming it (benchmark 12-22 changes/min)."""
    shots = m['shots']; all_text = text_of(spoken(m, 0, 10 ** 9))
    story = score_sets(all_text)
    home = max(story, key=story.get) if story else WORLD_SET.get(shots[0].get('world'), 'village')
    seconds = sorted(story, key=lambda k: -story[k])
    out = []; held = 0.0; prev = None
    for i, s in enumerate(shots):
        txt = text_of(spoken(m, s['start'], s['end'])); sc = score_sets(txt)
        for p in s.get('props') or []:
            for k, v in score_sets(re.sub(r'[^a-z]+', ' ', str(p.get('asset') or p.get('kind') or '').lower())).items(): sc[k] = sc.get(k, 0) + 0.3 * v
        world = WORLD_SET.get(s.get('world'))
        if world and world != 'outback': sc[world] = sc.get(world, 0) + 0.6  # Visual Director's place is a hint, not a cage
        if prev: sc[prev] = sc.get(prev, 0) + (0.9 if held < 9 else -0.4)
        for k in story: sc[k] = sc.get(k, 0) + 0.15 * story[k] / max(story.values())
        best = max(sc, key=lambda k: (sc[k], k == home)) if sc else home
        if best == prev and held >= 9 and not score_sets(txt).get(best):
            alt = [k for k in seconds if k != prev]
            if alt: best = alt[i % len(alt)]
        held = held + (s['end'] - s['start']) / FPS if best == prev else (s['end'] - s['start']) / FPS
        out.append(best); prev = best
    return out


# ---------------------------------------------------------------- geometry helpers
def basis(h):
    a = math.radians(h); return (math.cos(a), math.sin(a)), (math.sin(a), -math.cos(a))  # forward, right


def at(o, F, R, fwd=0.0, right=0.0, z=None):
    p = [o[0] + F[0] * fwd + R[0] * right, o[1] + F[1] * fwd + R[1] * right]
    return r3(p + ([z] if z is not None else []))


def yaw_facing(d):
    """Character yaw (deg) so its face (-y at yaw 0) points along d."""
    return round(math.degrees(math.atan2(d[0], -d[1])), 2)


def split_points(m, s, n_max=3, target=2.6):
    """Cut a long manifest shot into setups at word boundaries (benchmark median ~2-3 s per shot)."""
    a, b = s['start'], s['end']; dur = (b - a) / FPS
    n = max(1, min(n_max, round(dur / target)))
    if n == 1 or dur < 3.4: return [(a, b)]
    starts = [round(w['start'] * FPS) for _, w, _ in spoken(m, a, b)]
    cuts = []
    for j in range(1, n):
        ideal = a + (b - a) * j / n
        cand = [f for f in starts if a + 30 <= f <= b - 30] or [round(ideal)]
        cuts.append(min(cand, key=lambda f: abs(f - ideal)))
    edges = [a] + sorted(set(cuts)) + [b]
    return [(x, y) for x, y in zip(edges, edges[1:]) if y - x >= 12] or [(a, b)]


# ---------------------------------------------------------------- the director
class Director:
    def __init__(self, m, cards=()):
        self.m = m; self.cards = set(cards); self.locations = plan_locations(m)
        self.history = []; self.zone_use = {}; self.cast_look = {}
        for i, c in enumerate(m.get('cast') or []):
            outfit, hat = OUTFIT.get(c.get('outfit'), ('worker', 'none'))
            self.cast_look[c['id']] = {'outfit': outfit, 'hat': hat, 'shirt': SHIRTS[i % 4], 'hat_color': HAT_COLORS[i % 4]}
        self.last_zone = None

    # -- choose a zone that differs from the previous segment's backdrop
    def zone(self, st, keep=False):
        zones = list(ZONES.get(st, {'center': ((0, 0), 90)}))
        if keep and self.last_zone and self.last_zone[0] == st: return self.last_zone[1]
        k = self.zone_use.get(st, 0)
        for j in range(len(zones)):
            z = zones[(k + j) % len(zones)]
            if (st, z) != self.last_zone:
                self.zone_use[st] = k + j + 1; return z
        return zones[0]

    def camera_type(self, ctx):
        prev = self.history[-1] if self.history else None
        recent = self.history[-4:]
        prefs = []
        if ctx['first_of_video']: prefs += ['establish', 'low']
        if ctx['new_place'] and ctx['part'] == 0: prefs += ['establish', 'wide', 'high']
        if ctx['story_object'] and ctx['part'] >= 1: prefs += ['insert']
        if ctx['moving']: prefs += ['track', 'wide']
        if ctx['scale']: prefs += ['high', 'establish']
        if ctx['threat']: prefs += ['low']
        if ctx['n_people'] >= 2: prefs += ['ots', 'medium']
        if ctx['emotion']: prefs += ['close', 'xclose']
        if ctx['reveal']: prefs += ['orbit', 'xclose']
        if ctx['hint']: prefs.insert(1 if prefs else 0, ctx['hint'])
        prefs += ['medium', 'orbit', 'low', 'close', 'wide', 'high']
        for p in prefs:
            if p == prev or recent.count(p) >= 2: continue
            if p == 'establish' and 'establish' in self.history[-3:]: continue
            if p in ('ots',) and ctx['n_people'] < 2: continue
            if p in ('close', 'xclose', 'ots') and ctx['n_subjects'] == 0: continue
            if p == 'insert' and not (ctx['story_object'] or ctx['props']): continue
            if p == 'track' and not ctx['moving']: continue
            return p
        return 'wide' if prev != 'wide' else 'medium'

    def segment(self, i, part, a, b):
        m = self.m; s = m['shots'][i]; st = self.locations[i]
        ws = spoken(m, a, b); txt = text_of(ws); whole = text_of(spoken(m, s['start'], s['end']))
        new_place = part == 0 and (i == 0 or self.locations[i - 1] != st)
        zname = self.zone(st, keep=part > 0 and part % 2 == 1 and False)
        (origin, head) = ZONES[st][zname]; F, R = basis(head)
        dur = round((b - a) / FPS, 3)
        lighting = {'golden': 'sunset', 'night_bright': 'night'}.get(s.get('light'), 'day')
        if NIGHT.search(whole) or s.get('world') == 'night_camp': lighting = 'night'
        elif DUSK.search(whole): lighting = 'sunset'
        if 'rain' in (s.get('fx') or []) or re.search(r'\b(rain\w*|storm\w*)\b', whole) or s.get('world') == 'storm_sea': lighting = 'rain'
        if st in ('office', 'saloon', 'workshop', 'room') and lighting == 'rain': lighting = 'day'
        # --- who is on screen
        actors = [x for x in s.get('actors') or [] if not ANIMAL.search(x['id'].lower())][:3]
        beasts = [x for x in s.get('actors') or [] if ANIMAL.search(x['id'].lower()) and f"{x['id']}.png" in self.cards]
        if not actors and not beasts and s.get('actor') and not ANIMAL.search(str(s['actor']).lower()):
            actors = [{'id': s['actor'], 'action': s.get('action', 'idle'), 'expression': s.get('expression', 'neutral')}]
        if not beasts and s.get('actor') and f"{s['actor']}.png" in self.cards and ANIMAL.search(str(s['actor']).lower()):
            beasts = [{'id': s['actor'], 'action': s.get('action', 'idle')}]
        animal_cards = [c['id'] for c in (m.get('cast') or []) if ANIMAL.search(c['id'].lower()) and f"{c['id']}.png" in self.cards]
        named = bool(ANIMAL.search(txt or whole))
        if named and animal_cards and not beasts: beasts = [{'id': k, 'action': 'run'} for k in animal_cards]
        verb = next((act for pat, act in VERB_ACTION if re.search(pat, txt or whole)), None)
        beast_verb = verb if named and beasts else None
        if beast_verb in ('run', 'walk', 'panic', 'fall'):  # "the emus scattered": the animals move, people react
            verb = 'aim' if re.search(r'\b(gun\w*|fir\w*|shot|soldiers?|bullets?|kill\w*)\b', whole) and any(self.cast_look.get(x['id'], {}).get('outfit') == 'soldier' for x in actors) else 'point'
        herd = bool(HERD_WORDS.search(whole)) and bool(beasts)
        moving = (verb in ('run', 'walk') and bool(actors)) or (beast_verb in ('run', 'walk', 'panic') and bool(beasts))
        # --- story objects (only when the words name them) and whitelisted props
        story_obj = []
        for p in s.get('props') or []:
            k = {'coins': 'money_bag', 'gold_piece': 'money_bag', 'chest': 'money_bag', 'cart': 'covered_cart', 'pan': 'gold_pan', 'magnifier': 'magnifier'}.get(p.get('kind'))
            if k and re.search(STORY_OBJECT_WORDS[k], whole) and k not in story_obj: story_obj.append(k)
        for k, pat in STORY_OBJECT_WORDS.items():
            if k in ('rail_joint', 'covered_cart', 'gold_vein') and st not in ('rail_yard', 'mine_tunnel', 'village', 'outback'): continue
            if re.search(pat, txt) and k not in story_obj and k in OBJECTS: story_obj.append(k)
        story_obj = story_obj[:1]
        props = []
        for p in s.get('props') or []:
            hit = PROP_MODEL.get(p.get('kind'))
            if hit and all(q[0] != hit[0] for q in props): props.append(hit)
        for pat, mid, hgt in WORD_PROPS:
            if re.search(pat, whole) and all(q[0] != mid for q in props): props.append((mid, hgt))
        props = [p for p in props if not (p[0] == 'pirate-kit/ship-large' and st != 'ship_deck')][:3]
        ctx = {'first_of_video': i == 0 and part == 0, 'new_place': new_place, 'part': part, 'story_object': bool(story_obj), 'props': bool(props),
               'moving': bool(moving), 'scale': bool(SCALE_WORDS.search(txt)) or herd, 'threat': verb in ('aim', 'load') or s.get('mood') == 'tense',
               'n_people': len(actors), 'n_subjects': len(actors) + len(beasts), 'emotion': verb in ('panic', 'fall', 'cheer') or s.get('expression') in ('shock', 'laugh', 'nervous'),
               'reveal': s.get('mood') == 'reveal', 'hint': HINT.get(s.get('shot')) if part == 0 else None}
        kind = self.camera_type(ctx)
        S = at(origin, F, R, 2.0, 0)  # subject mark
        cast = []; cards = []; crowd = None; effects = []; objects = []
        # --- staging
        travel_dir = 1 if (i + part) % 2 == 0 else -1
        for j, x in enumerate(actors):
            look = self.cast_look.get(x['id'], {'outfit': 'worker', 'hat': 'none', 'shirt': SHIRTS[j % 4], 'hat_color': HAT_COLORS[j % 4]})
            base = LEGACY_ACTION.get(x.get('action'), 'stand')
            act = verb if verb and (j == 0 or verb in ('run', 'walk', 'panic', 'cheer', 'aim')) else base
            if act == 'stand' and j == 0 and (x['id'] == s.get('speaker') or base == 'stand'): act = 'point' if (i + j) % 3 == 0 else 'stand'
            expr = 'talk' if x['id'] == s.get('speaker') else FACE.get(x.get('expression'), ACTION_FACE.get(act, 'neutral'))
            if act in ACTION_FACE and expr == 'neutral': expr = ACTION_FACE[act]
            n = len(actors)
            if act in ('walk', 'run'):
                v = .7 if act == 'walk' else 1.3; span = v * dur
                start = at(S, F, R, 0.6 * j, -travel_dir * span / 2 + (-.7 * j * travel_dir))
                yaw = yaw_facing((R[0] * travel_dir, R[1] * travel_dir))
                if kind in ('low', 'xclose', 'close'):  # run toward the lens for the dramatic setups
                    start = at(S, F, R, 0.5 + span * .6, 0.6 * (j - (n - 1) / 2)); yaw = yaw_facing((-F[0], -F[1]))
                pos = start
            else:
                offs = [(0, 0)] if n == 1 else [(-.75, 0), (.75, 0)] if n == 2 else [(-.9, 0), (.9, 0), (0, .9)]
                pos = at(S, F, R, offs[j][1], offs[j][0])
                if n >= 2 and j < 2:  # partners turn toward each other (3/4 to camera)
                    other = at(S, F, R, offs[1 - j][1], offs[1 - j][0]); d = (other[0] - pos[0] - F[0] * .9, other[1] - pos[1] - F[1] * .9)
                    yaw = yaw_facing(d)
                else:
                    yaw = yaw_facing((-F[0] + R[0] * .25 * (1 if j % 2 else -1), -F[1] + R[1] * .25 * (1 if j % 2 else -1)))
            ch = {'id': x['id'], 'pos': pos, 'yaw': yaw, 'action': act, 'expression': expr, 'outfit': look['outfit'], 'hat': look['hat'],
                  'shirt': look['shirt'], 'hat_color': look['hat_color']}
            if act in ('aim', 'load') and st in ('office', 'saloon', 'workshop', 'room'): act = 'point'; ch['action'] = act
            if act in ('aim', 'load') and look['outfit'] == 'soldier': ch['held'] = 'rifle'
            elif act == 'carry': ch['held'] = 'crate'
            elif act == 'swing': ch['held'] = 'tool'
            cast.append(ch)
        if beasts:
            herd_n = 6 if herd else min(6, max(len(beasts), 1))
            ids = [b['id'] for b in beasts]
            for k in range(herd_n):
                bid = ids[k % len(ids)]; depth = (k // 2) * 1.3 + (0.6 if cast else 0); side = (k % 2) * 1.2 - 0.6 + (1.3 if cast else 0)
                h = 1.5 - 0.12 * (k // 2)
                p0 = at(S, F, R, depth, side)
                cd = {'image': f'{bid}.png', 'pos': p0, 'height': round(max(.8, h), 2)}
                if beast_verb in ('run', 'walk', 'panic') or (herd and not beast_verb == 'fall' and verb != 'aim'):
                    span = (2.6 if beast_verb in ('run', 'panic') else 1.2) * dur
                    cd['pos'] = at(S, F, R, depth, side - travel_dir * span / 2)
                    cd['to'] = at(S, F, R, depth + 0.2 * (k % 3), side + travel_dir * span / 2)
                    cd['hop'] = 0.18 if beast_verb in ('run', 'panic') else 0.08
                cards.append(cd)
        if CROWD_WORDS.search(whole) and st in OUTDOOR and kind in ('establish', 'wide', 'high', 'orbit', 'low'):
            cact = 'run' if verb in ('run', 'panic') else 'cheer' if verb == 'cheer' else 'stand'
            cc = at(S, F, R, 4.5, 0)
            crowd = {'count': 28 if kind in ('establish', 'high') else 16, 'center': cc, 'size': [7.0, 3.0], 'action': cact,
                     'yaw': yaw_facing((-F[0], -F[1])), 'seed': i * 11 + part}
        # story object goes beside the subject; props frame the subject without blocking it
        anchor = cast[0]['pos'] if cast else S
        for k in story_obj:
            act = 'hold'
            for cand in OBJECTS[k]['actions'] if isinstance(OBJECTS[k], dict) else []:
                if cand != 'hold' and re.search(cand[:4], txt): act = cand
            objects.append({'kind': k, 'action': act, 'pos': at(anchor, F, R, -0.7, 0.55) + [0], 'scale': .85, 'yaw': round(head - 90, 2)})
        prop_specs = []
        for j, (mid, hgt) in enumerate(props):
            big = hgt >= 4
            p = at(S, F, R, 4.0 + 2 * j, (-3.2 if j % 2 else 3.2)) if big else at(anchor, F, R, 0.3 + 0.5 * j, (1.25 if j % 2 == 0 else -1.3))
            prop_specs.append({'id': mid, 'pos': p, 'height': hgt, 'yaw': round((head + 35 * j) % 360, 1)})
        # effects timed to the words that trigger them
        for pat, fk in FX_WORDS:
            hits = [w for _, w, t in ws if re.search(pat, str(t).lower())]
            if not hits and fk in ('sparks', 'explosion', 'dust') : continue
            if not hits and not re.search(pat, txt): continue
            t0 = max(0.0, min(dur - .2, (hits[0]['start'] * FPS - a) / FPS)) if hits else 0.0
            if fk == 'sparks':
                shooters = [c for c in cast if c['action'] in ('aim', 'load')] or cast[:1]
                if not shooters: continue
                for c in shooters[:2]:
                    yv = math.radians(c['yaw']); fx = [c['pos'][0] + math.sin(yv) * .7, c['pos'][1] - math.cos(yv) * .7, 1.3]
                    effects.append({'kind': 'sparks', 'pos': r3(fx), 'start': round(t0, 3), 'scale': .6, 'seed': i * 7 + len(effects)})
                    effects.append({'kind': 'smoke', 'pos': r3(fx), 'start': round(min(dur - .2, t0 + .1), 3), 'scale': .5, 'seed': i * 7 + len(effects)})
            elif fk == 'rain':
                if st in OUTDOOR: effects.append({'kind': 'rain', 'pos': at(S, F, R, 0, 0, 0), 'start': 0, 'scale': 1, 'seed': i})
            elif fk == 'dust':
                if st in OUTDOOR and (moving or herd): effects.append({'kind': 'dust', 'pos': at(S, F, R, 0.8, 0, 0), 'start': round(t0, 3), 'scale': 1.2, 'seed': i * 7 + 3})
            else:
                effects.append({'kind': fk, 'pos': at(S, F, R, 2.6, 1.6 * (-1 if i % 2 else 1), 0), 'start': round(t0, 3), 'scale': 1.0, 'seed': i * 7 + len(effects)})
            if len(effects) >= 6: break
        for k in (s.get('fx') or []):
            kk = {'smoke': 'smoke', 'fire': 'fire', 'burst': 'explosion', 'sparkle': 'sparks'}.get(k)
            if kk and len(effects) < 6 and all(e['kind'] != kk for e in effects):
                effects.append({'kind': kk, 'pos': at(S, F, R, 2.4, -1.4, 0), 'start': 0, 'scale': .8, 'seed': i * 13 + len(effects)})
        effects = effects[:6]
        # --- camera
        subj = [c['pos'] for c in cast] + [c['pos'] for c in cards]
        if cards and 'to' in cards[0]: subj += [cards[0]['to']]
        C = [sum(p[0] for p in subj) / len(subj), sum(p[1] for p in subj) / len(subj)] if subj else S
        cam = self.make_camera(kind, s, st, origin, head, F, R, C, cast, cards, objects, dur, moving, verb, travel_dir, txt, part)
        if IMPACT.search(txt):
            hits = [w for _, w, t in ws if IMPACT.search(str(t).lower())]
            t = max(0.0, min(dur, (hits[0]['start'] * FPS - a) / FPS)) if hits else min(dur, .15)
            cam['shake'] = [{'t': round(t, 3), 'amp': 0.05}, {'t': round(min(dur, t + .35), 3), 'amp': 0.025}]
        shot = {'set': st, 'lighting': lighting, 'duration': max(0.2, min(12, dur)), 'camera': cam, 'cast': cast, 'objects': objects,
                'engine': 'eevee', 'samples': 16, 'size': list(SIZE), 'grade': 'Punchy', 'haze': 0.03 if st in OUTDOOR else 0.0}
        if st == 'outback': shot['haze_color'] = [0.35, 0.2, 0.1]
        if cards: shot['cards'] = cards
        if crowd: shot['crowd'] = crowd
        if effects: shot['effects'] = effects
        if prop_specs: shot['props'] = prop_specs
        self.history.append(kind); self.last_zone = (st, zname)
        return validate_shot(shot), {'camera_type': kind, 'set': st, 'zone': zname, 'verb': verb, 'words': txt}

    def make_camera(self, kind, s, st, origin, head, F, R, C, cast, cards, objects, dur, moving, verb, tdir, txt, part):
        side = 1 if (len(self.history) % 2 == 0) else -1
        face = 1.62
        def P(fwd, right, z, base=C): return at(base, F, R, fwd, right, z)
        tgt = P(0, 0, 1.0)
        if kind == 'establish':
            cam = {'from': P(-9.5, 2.2 * side, 4.6), 'to': P(-7.2, 1.2 * side, 2.6), 'look_at': P(0.5, 0, 1.0), 'lens': 24, 'fstop': 8}
        elif kind == 'wide':
            cam = {'from': P(-6.0, 1.4 * side, 1.9), 'look_at': P(0.3, 0, 1.0), 'lens': 28, 'fstop': 6}
        elif kind == 'medium':
            cam = {'from': P(-3.4, .8 * side, 1.5), 'look_at': P(0, 0, 1.05), 'lens': 35, 'fstop': 4}
        elif kind in ('close', 'xclose'):
            who = cast[0]['pos'] if cast else (cards[0]['pos'] if cards else C)
            hz = face if cast else (cards[0]['height'] * .75 if cards else 1.2)
            d = 1.7 if kind == 'close' else 1.05
            cam = {'from': at(who, F, R, -d, .35 * side, hz + .05), 'look_at': at(who, F, R, 0, 0, hz - (0.08 if kind == 'close' else 0)),
                   'lens': 50 if kind == 'close' else 75, 'fstop': 2.4 if kind == 'close' else 1.8}
        elif kind == 'low':
            cam = {'from': P(-2.5, .9 * side, 0.32), 'look_at': P(0, 0, 1.55), 'lens': 21, 'fstop': 5}
        elif kind == 'high':
            cam = {'from': P(-3.6, 1.2 * side, 7.5), 'look_at': P(0.4, 0, 0.2), 'lens': 26, 'fstop': 8}
        elif kind == 'ots':
            a_, b_ = cast[0]['pos'], cast[1]['pos']
            if len(self.history) % 2: a_, b_ = b_, a_
            d = [b_[0] - a_[0], b_[1] - a_[1]]; L = math.hypot(*d) or 1; u = [d[0] / L, d[1] / L]; perp = [-u[1], u[0]]
            sgn = side
            cam = {'from': r3([a_[0] - u[0] * 1.7 + perp[0] * .85 * sgn - F[0] * .4, a_[1] - u[1] * 1.7 + perp[1] * .85 * sgn - F[1] * .4, 1.95]),
                   'look_at': r3([b_[0], b_[1], 1.55]), 'lens': 38, 'fstop': 2.8}
        elif kind == 'track':
            mover = next((c for c in cast if c['action'] in ('walk', 'run')), None)
            if mover:
                v = .7 if mover['action'] == 'walk' else 1.3; yv = math.radians(mover['yaw'])
                dvec = [math.sin(yv), -math.cos(yv)]; p0 = mover['pos']; p1 = [p0[0] + dvec[0] * v * dur, p0[1] + dvec[1] * v * dur]
            else:
                c0 = next((c for c in cards if 'to' in c), cards[0] if cards else {'pos': C}); p0 = c0['pos']; p1 = c0.get('to', p0)
            mid0 = [p0[0], p0[1]]; mid1 = [p1[0], p1[1]]
            cam = {'from': at(mid0, F, R, -4.6, -0.6 * tdir, 1.4), 'to': at(mid1, F, R, -4.6, 0.3 * tdir, 1.4),
                   'look_at': at(mid0, F, R, 0, 0.5 * tdir, 1.0), 'look_to': at(mid1, F, R, 0, 0.5 * tdir, 1.0), 'lens': 30, 'fstop': 3.5}
        elif kind == 'orbit':
            r = 3.6; a0 = math.radians(-40 * side); a1 = math.radians(25 * side)
            def ring(aa): return P(-r * math.cos(aa), r * math.sin(aa), 1.4)
            cam = {'from': ring(a0), 'to': ring(a1), 'look_at': P(0, 0, 1.1), 'lens': 32, 'fstop': 3.2}
        else:  # insert
            if objects:
                o0 = objects[0]['pos']; act = objects[0]['action']
                c0 = OBJ_CAMS.get((objects[0]['kind'], 'hold' if act == 'pour' else act)) or OBJ_CAMS.get(objects[0]['kind'])
                if c0:
                    def rot(v):
                        aa = math.radians(head - 90); return [v[0] * math.cos(aa) - v[1] * math.sin(aa), v[0] * math.sin(aa) + v[1] * math.cos(aa)]
                    f_, l_ = rot(c0['from']), rot(c0['look_at'])
                    cam = {'from': r3([o0[0] + f_[0], o0[1] + f_[1], c0['from'][2]]), 'look_at': r3([o0[0] + l_[0], o0[1] + l_[1], c0['look_at'][2]]),
                           'lens': c0['lens'], 'fstop': c0['fstop']}
                else:
                    cam = {'from': at(o0, F, R, -1.2, .3, .9), 'look_at': at(o0, F, R, 0, 0, .35), 'lens': 60, 'fstop': 2.2}
            else:
                cam = {'from': P(-1.4, .5 * side, 1.2), 'look_at': P(0, 0, 0.9), 'lens': 60, 'fstop': 2.2}
        # editorial move on top of the setup (never on track/orbit/establish, which already move)
        if kind not in ('track', 'orbit', 'establish'):
            f, la = cam['from'], cam['look_at']; tw = [la[k] - f[k] for k in range(3)]
            mv = s.get('move') if part == 0 else ('push_in' if part % 2 else 'pan_right')
            if kind in ('close', 'xclose', 'insert') and mv in ('pan_left', 'pan_right', 'orbit'): mv = 'push_in'
            if mv == 'pull_back' or kind == 'high':
                cam['to'] = f; cam['from'] = r3([f[k] + tw[k] * 0.25 for k in range(3)])
            elif mv in ('pan_left', 'pan_right', 'orbit'):
                sg = -1 if mv == 'pan_left' else 1
                cam['to'] = r3([f[0] + R[0] * 1.0 * sg, f[1] + R[1] * 1.0 * sg, f[2]]); cam['look_to'] = r3([la[0] + R[0] * .6 * sg, la[1] + R[1] * .6 * sg, la[2]])
            elif mv == 'whip':
                cam['whip_from'] = r3([f[0] + R[0] * 1.6, f[1] + R[1] * 1.6, f[2]]); cam['to'] = r3([f[k] + tw[k] * 0.12 for k in range(3)])
            else:
                cam['to'] = r3([f[k] + tw[k] * (0.28 if kind in ('low', 'medium', 'wide') else 0.18) for k in range(3)])
        if st == 'mine_tunnel':
            for k in ('from', 'to', 'whip_from'):
                if k in cam: cam[k][0] = max(-0.9, min(0.9, cam[k][0]))
        if st in ('office', 'saloon', 'workshop', 'room'):  # keep the lens inside the walls
            for k in ('from', 'to', 'whip_from'):
                if k in cam: cam[k] = [max(-5.4, min(5.4, cam[k][0])), max(-4.5, min(8.4, cam[k][1])), max(0.25, min(4.1, cam[k][2]))]
        return cam


def plan(m, cards=()):
    """All segments of the video: [{'shot_index', 'start', 'end', 'shot', 'notes'}] covering every frame exactly once."""
    d = Director(m, cards); out = []
    for i, s in enumerate(m['shots']):
        for part, (a, b) in enumerate(split_points(m, s)):
            shot, notes = d.segment(i, part, a, b)
            out.append({'shot_index': i, 'start': a, 'end': b, 'shot': shot, 'notes': notes})
    return out
