import os
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
from world_pack import backdrop_for, kit_fits_era, story_year
from animals import ANIMAL
import math, re
import activities as ACT
from shot_schema import validate_shot
from shot_director import ZONES as BASE_ZONES, OBJ_CAMS
from object_specs import OBJECTS
from place_spec import height as terrain_height, compile_place, KITS as PLACE_KITS, LIGHTING as PLACE_LIGHT, smooth_story_time

FPS = 30
FG_KINDS = ('medium', 'close', 'ots', 'low', 'track', 'wide', 'orbit')
FG_OUTDOOR = ('nature-kit/plant_bush', 'nature-kit/rock_largeA', 'q-stylizednaturemegakit/Fern_1')
FG_INDOOR = ('furniture-kit/chair', 'furniture-kit/lampRoundFloor', 'pirate-kit/barrel')
LABEL_RE = re.compile(r"\b(\d{1,3}(?:,\d{3})+|\d{3,4}\s*(?:bc|bce|ad)?|\d{1,2}\s*(?:percent|%))\b")


UNITS = {'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13,
         'fourteen': 14, 'fifteen': 15, 'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60,
         'seventy': 70, 'eighty': 80, 'ninety': 90}
SCALES = {'hundred': 100, 'thousand': 1000, 'million': 1000000}


def spoken_number(text):
    """First number spelled out in the line ('two hundred seventeen BC', 'about two thousand oxen') -> sign text ('217 BC', '2,000 OXEN'), or None."""
    toks = re.findall(r"[a-z]+|\d+", (text or '').lower().replace('-', ' '))
    i = 0
    while i < len(toks):
        if toks[i] in UNITS or toks[i] in SCALES:
            total = cur = 0; j = i; seen = False
            while j < len(toks) and (toks[j] in UNITS or toks[j] in SCALES or toks[j] == 'and'):
                w = toks[j]
                if w in UNITS: cur += UNITS[w]; seen = True
                elif w in SCALES:
                    if w == 'hundred': cur = max(cur, 1) * 100
                    else: total += max(cur, 1) * SCALES[w]; cur = 0
                    seen = True
                j += 1
            value = total + cur
            nxt = toks[j] if j < len(toks) else ''
            if seen and value >= 10:
                if nxt in ('bc', 'bce', 'ad'): return f"{value} {nxt.upper()}"
                if value >= 100: return f"{value:,}" + (f" {nxt.upper()}" if nxt.isalpha() and 3 <= len(nxt) <= 9 and nxt not in ('and', 'the', 'of', 'in', 'for', 'were', 'was', 'that', 'with', 'from') else '')
            i = max(j, i + 1)
        else: i += 1
    return None


def travel_width_per_s(cam, dur):
    """Camera travel as a fraction of the frame width per second (push + sideways + turn), the benchmark rulebook's speed measure."""
    f = cam['from']; t = cam.get('to', f); la = cam['look_at']; lt = cam.get('look_to', la)
    th = math.tan(math.atan(18.0 / max(10.0, cam.get('lens', 35)))); d0 = math.dist(f, la) or 1.0; fw = 2 * d0 * th * 9 / 16
    d1 = math.dist(t, lt); v = [la[i] - f[i] for i in range(3)]; w = [lt[i] - t[i] for i in range(3)]
    cosang = sum(a * b for a, b in zip(v, w)) / ((math.hypot(*v) or 1) * (math.hypot(*w) or 1)); turn = math.acos(max(-1, min(1, cosang)))
    move = math.dist(f, t); lateral = math.sqrt(max(0.0, move ** 2 - (d0 - d1) ** 2))
    return (abs(d0 - d1) / fw * 0.5 + lateral / fw + turn / (2 * math.atan(th * 9 / 16))) / max(0.2, dur)


def normalize_travel(cam, dur, lo=0.26, hi=0.5):
    """Every shot travels at the benchmark's pace (it averages ~0.28 frame widths per second), never so fast it is hard to follow:
    scale the move into the 0.16-0.45 band. A shot with too little travel gets its own move stretched (up to 4x); one with none gets a push with a sideways arc."""
    ws = travel_width_per_s(cam, dur); f = cam['from']; la = cam['look_at']
    def scale(k):
        cam['to'] = [round(f[i] + (cam['to'][i] - f[i]) * k, 3) for i in range(3)]
        if 'look_to' in cam: cam['look_to'] = [round(la[i] + (cam['look_to'][i] - la[i]) * k, 3) for i in range(3)]
    if ws > hi and 'to' in cam: scale(hi / ws)
    elif ws < lo:
        if 'to' in cam and math.dist(f, cam['to']) > 0.05 and ws > 0.01: scale(min(4.0, lo / ws))
        else:
            tw = [la[i] - f[i] for i in range(3)]; d = math.hypot(tw[0], tw[1]) or 1.0; side = [-tw[1] / d, tw[0] / d]
            arc = 0.3 * math.dist(f, la)
            cam['to'] = [round(f[0] + tw[0] * 0.25 + side[0] * arc, 3), round(f[1] + tw[1] * 0.25 + side[1] * arc, 3), round(f[2] + tw[2] * 0.25, 3)]
            if travel_width_per_s(cam, dur) < lo: scale(min(4.0, lo / max(0.01, travel_width_per_s(cam, dur))))
    return cam


def project_point(cam, p, t):
    """Where a world point lands in the frame (0..1 both ways) at time t (0..1) of the shot, or None when it is behind the lens."""
    f = [cam['from'][i] + (cam.get('to', cam['from'])[i] - cam['from'][i]) * t for i in range(3)]
    la = [cam['look_at'][i] + (cam.get('look_to', cam['look_at'])[i] - cam['look_at'][i]) * t for i in range(3)]
    fw = [la[i] - f[i] for i in range(3)]; n = math.sqrt(sum(v * v for v in fw)) or 1.0; fw = [v / n for v in fw]
    rt = [fw[1], -fw[0], 0.0]; rn = math.hypot(rt[0], rt[1]) or 1.0; rt = [rt[0] / rn, rt[1] / rn, 0.0]
    up = [rt[1] * fw[2] - rt[2] * fw[1], rt[2] * fw[0] - rt[0] * fw[2], rt[0] * fw[1] - rt[1] * fw[0]]
    v = [p[i] - f[i] for i in range(3)]; z = sum(v[i] * fw[i] for i in range(3))
    if z <= 0.1: return None
    th = math.tan(math.atan(18.0 / max(10.0, cam.get('lens', 35))))
    return (0.5 + 0.5 * sum(v[i] * rt[i] for i in range(3)) / (z * th * 9 / 16), 0.5 + 0.5 * sum(v[i] * up[i] for i in range(3)) / (z * th))


def cast_in_frame(cam, cast):
    for c in cast:
        x, y = c['pos']
        for t in (0.0, 0.5, 1.0):
            h = project_point(cam, (x, y, 1.8), t); top = project_point(cam, (x, y, 2.1), t)
            if h is None or not (0.07 < h[0] < 0.93) or (top is not None and top[1] > 0.985): return False
    return True


def keep_cast_in_frame(cam, cast):
    """Camera moves must never carry a head out of the frame: shrink the move, then back the lens off, until every head stays inside the whole shot."""
    if not cast: return cam
    base_to = list(cam.get('to', cam['from'])); base_lt = list(cam.get('look_to', cam['look_at'])); f = cam['from']; la = cam['look_at']
    # back the lens off first and keep most of the move: a shrunken move is what made the old Shorts look like still pictures
    for back in (1.0, 1.12, 1.25, 1.4, 1.6):
        if back != 1.0:
            sx = sum(c['pos'][0] for c in cast) / len(cast); sy = sum(c['pos'][1] for c in cast) / len(cast)
            cam['from'] = [round(sx + (f[0] - sx) * back, 3), round(sy + (f[1] - sy) * back, 3), f[2]]
        for k in ((1.0, 0.8, 0.6) if back < 1.6 else (1.0, 0.8, 0.6, 0.4)):
            ff = cam['from']
            cam['to'] = [round(ff[i] + (base_to[i] - f[i]) * k, 3) for i in range(3)]
            if 'look_to' in cam or k < 1.0: cam['look_to'] = [round(la[i] + (base_lt[i] - la[i]) * k, 3) for i in range(3)]
            if cast_in_frame(cam, cast): return cam
    return cam


def limit_pitch(cam, max_down=48.0, max_up=22.0):
    """No top-down or worm's-eye views: keep the lens between 22 degrees below and 48 degrees above horizontal by moving it away horizontally."""
    for key in ('from', 'to'):
        if key not in cam: continue
        look = cam['look_at'] if key == 'from' else cam.get('look_to', cam['look_at']); f = cam[key]
        hx, hy = f[0] - look[0], f[1] - look[1]; hd = math.hypot(hx, hy) or 1e-3; dz = f[2] - look[2]
        pitch = math.degrees(math.atan2(dz, hd))
        if pitch > max_down: need = dz / math.tan(math.radians(max_down))
        elif pitch < -max_up: need = -dz / math.tan(math.radians(max_up))
        else: continue
        k = need / hd; cam[key] = [round(look[0] + hx * k, 3), round(look[1] + hy * k, 3), f[2]]
    return cam


def clear_sightline(place, cam, subjects):
    """Nothing may stand between the lens and what the shot is about: drop set props whose footprint sits on the line from the camera to any
    subject (cast or story object) and nearer than it. Sets are now fully dressed, so a cart or a well used to hide the very thing being described."""
    f = cam['from']; keep = []
    for it in place.get('items', []):
        x, y = it['pos'][0], it['pos'][1]; r = 0.55 + 0.35 * min(3.0, float(it.get('height', 1.0)))
        blocked = False
        for sx, sy in subjects:
            dx, dy = sx - f[0], sy - f[1]; L2 = dx * dx + dy * dy or 1.0
            t = ((x - f[0]) * dx + (y - f[1]) * dy) / L2
            if 0.05 < t < 0.97 and math.hypot(f[0] + dx * t - x, f[1] + dy * t - y) < r + 0.25: blocked = True; break
        if not blocked: keep.append(it)
    place['items'] = keep


def clear_lens_items(place, cam):
    """Nothing may sit in the lens's way: drop props and landmarks that stand within a body's reach of the camera path (the creator's 'passing through the lens' check)."""
    path = [(cam['from'][i] + (cam.get('to', cam['from'])[i] - cam['from'][i]) * t) for t in (0.0, 0.5, 1.0) for i in (0, 1)]
    pts = [(path[0], path[1]), (path[2], path[3]), (path[4], path[5])]
    keep = []
    for it in place.get('items', []):
        r = 1.4 if it['height'] < 3 else 2.4 + 0.15 * it['height']
        if any(math.hypot(it['pos'][0] - px, it['pos'][1] - py) < r for px, py in pts): continue
        keep.append(it)
    place['items'] = keep


def story_tint(p, lighting):
    """Warm and bright for the setup, a deeper blue at the pivot (53-87% of the story), warm again for the payoff."""
    warm, cool = (1.0, 0.95, 0.86), (0.82, 0.9, 1.08)
    w = max(0.0, 1 - abs(p - 0.70) / 0.17); k = w * w * (3 - 2 * w) * (0.5 if lighting == 'night' else 1.0)
    return [round(warm[i] + (cool[i] - warm[i]) * k, 3) for i in range(3)]
# Fraction of the frame height the main subject should fill (benchmark rulebook: 40-60% in medium shots, 70%+ in close shots)
SUBJECT_FRAC = {'close': 0.72, 'xclose': 0.9, 'medium': 0.55, 'ots': 0.55, 'low': 0.5, 'track': 0.5, 'orbit': 0.42, 'wide': 0.3, 'high': 0.3, 'establish': 0.17}


def fit_subject(cam, cast, kind, indoor=False):
    """Move the lens along its line of sight so the cast fills the rulebook share of the frame height and still fits the frame width."""
    frac = SUBJECT_FRAC.get(kind)
    if not frac or not cast: return cam
    xs = [c['pos'][0] for c in cast]; ys = [c['pos'][1] for c in cast]
    sx, sy = sum(xs) / len(xs), sum(ys) / len(ys); spread = max(math.hypot(a - sx, b - sy) for a, b in zip(xs, ys)) * 2
    tan_half = math.tan(math.atan(18.0 / max(10.0, cam.get('lens', 35))))   # vertical half field of view (36 mm sensor fits the portrait height)
    d_h = 1.9 / (frac * 2 * tan_half); d_w = (spread + 1.2) / (0.92 * 2 * tan_half * 9 / 16)
    want = max(d_h, d_w, 1.35)
    f = cam['from']; subj = (sx, sy, 0.95); d = math.dist(f, subj)
    back_ok = (not indoor) or kind in ('close', 'xclose', 'medium', 'ots', 'low', 'track')   # indoors only the framed kinds may back away
    if d > want * 1.06 or (d < want * 0.6 and back_ok):
        # keep the lens height (never below the ground) and change only the horizontal distance
        dz = f[2] - subj[2]; hx, hy = f[0] - sx, f[1] - sy; hd = math.hypot(hx, hy)
        if kind != 'high': dz = max(-0.25 * want, min(0.35 * want, dz))      # never a top-down or underground view unless the shot is a crane move
        if hd > 1e-3:
            target_h = math.sqrt(max(want * want - dz * dz, 0.9)); k = target_h / hd
            cam['from'] = [round(sx + hx * k, 3), round(sy + hy * k, 3), round(max(0.4, subj[2] + dz), 3)]
    return cam
CLOSE_LENS, CLOSE_FSTOP, XCLOSE_LENS, XCLOSE_FSTOP = 30, 5.0, 45, 3.6


def rule_of_thirds(cam, side):
    """Put a lone subject on a third of the frame instead of dead centre, so the place shows beside them (the benchmark close-ups do this):
    the aim point slides sideways by a third of the half-width of the frame at the subject's distance. Moves keep the same offset."""
    f, la = cam['from'], cam['look_at']; dx, dy = la[0] - f[0], la[1] - f[1]; d = math.hypot(dx, dy)
    if d < 1e-3: return cam
    tan_half = math.tan(math.atan(18.0 / max(10.0, cam.get('lens', 35)))); half_w = tan_half * 9 / 16 * d
    rx, ry = dy / d, -dx / d                      # the camera's right
    off = -side * half_w / 3
    cam['look_at'] = [round(la[0] + rx * off, 3), round(la[1] + ry * off, 3), la[2]]
    if 'look_to' in cam: cam['look_to'] = [round(cam['look_to'][0] + rx * off, 3), round(cam['look_to'][1] + ry * off, 3), cam['look_to'][2]]
    return cam


SIZE = (720, 1280)  # upscaled to 1080x1920; measured same look as 810x1440 at ~45% less GPU time
# ---------------------------------------------------------------- locations
_RING = {'center': ((0, -1), 90), 'left': ((-1.6, 1.8), 125), 'right': ((2.0, 1.4), 58), 'reverse': ((0, 2.5), 270)}
ZONES = {**BASE_ZONES, 'farm_field': _RING, 'outback': _RING, 'forest': _RING, 'market': _RING, 'neutral': _RING}
OUTDOOR = {'castle', 'village', 'battlefield', 'street', 'rail_yard', 'farm_field', 'outback', 'forest', 'market', 'ship_deck', 'neutral'}
NEUTRAL = 'neutral'  # plain sky + ground + the characters: used whenever no kit truly is the place (never the closest wrong kit)
# Place-type words only: a kit is chosen when the shot's free-text location NAMES that kind of place (owner rule, Nov 16 2026).
PLACE_WORDS = {
    'mine_tunnel': 'mine mines mineshaft tunnel tunnels cave caves underground mine-shaft',
    'ship_deck': 'aboard deck ship-deck on-deck on-board',
    'rail_yard': 'railyard rail-yard train-yard train-station railway-station railroad-station rail-depot train-depot',
    'castle': 'castle castles fortress palace throne-room',
    'office': 'office offices boardroom headquarters bureau ministry parliament newsroom',
    'workshop': 'workshop laboratory lab workbench garage forge smithy',
    'saloon': 'saloon bar pub tavern inn',
    'room': 'bedroom kitchen living-room parlor parlour apartment at-home',
    'farm_field': 'farm farms farmland field fields meadow pasture countryside farmyard ranch prairie country-road dirt-road',
    'outback': 'outback desert scrubland badlands',
    'forest': 'forest forests woods woodland jungle grove',
    'market': 'market marketplace bazaar',
    'battlefield': 'battlefield trench trenches front-line army-camp war-camp',
    'street': 'street streets avenue boulevard downtown plaza sidewalk alley neighborhood neighbourhood city-square main-street',
    'village': 'village hamlet town',
}
PLACE_INDEX = {k: v.split() for k, v in PLACE_WORDS.items()}
KITSET = set(PLACE_KITS)
INDOOR_KITS = {'office', 'workshop', 'saloon', 'room', 'mine_tunnel', 'castle'}  # 'indoors' in a location rules out street/field kits
MIN_PLACE = 1        # the location text must name the place type at least once
MIN_SPOKEN = 2       # legacy shots without a location: two place words in the line itself
OBJECT_HEIGHT = {'small': 0.55, 'medium': 1.2, 'large': 2.8, 'huge': 6.0}
SET_WORDS = {
    'mine_tunnel': 'mine mines miner miners tunnel tunnels underground cave caves shaft gold-rush dig digging dug ore',
    'ship_deck': 'ship ships sailor sailors sea seas ocean boat boats navy voyage deck sailed sail fleet harbour harbor port island crew',
    'rail_yard': 'train trains railway railways rail rails locomotive track tracks station railroad steam',
    'castle': 'castle castles king kings queen knight knights fortress siege palace throne kingdom empire emperor',
    'office': 'government minister ministers parliament office report reports letter letters newspaper newspapers desk signed law laws politician politicians committee senate president meeting permit press headquarters',
    'workshop': 'invented inventor invention lab laboratory experiment experiments factory engineer engineers built device workshop scientist scientists tested',
    'saloon': 'bar saloon pub tavern drink drinks whisky beer',
    'room': 'home bedroom family kitchen wife husband child children son daughter',
    'farm_field': 'farm farms farmer farmers crop crops wheat field fields harvest barn fence fences plough grain ranch cattle sheep land settlers soldier-settlers corn hay tractor road roads dusty countryside course marathon runners race',
    'outback': 'desert outback drought sand australia australian plains bush wilderness west western scrub nowhere dam waterhole rabbits emus emu kangaroo',
    'forest': 'forest forests woods jungle trees hunting hunter hunters wild wolves',
    'market': 'market markets merchant merchants trade traders shop shops sold sell buy bought price prices store',
    'battlefield': 'army armies troops war battle battles battlefield camp camps tents military artillery cannon enemy campaign platoon front trenches siege',
    'street': 'city cities street streets crowd crowds public citizens town-hall downtown stadium olympic spectators finish-line boston london paris york louis',
    'village': 'village villages villagers town towns locals neighbours neighbors',
}
WORLD_SET = {'ship': 'ship_deck', 'storm_sea': 'ship_deck', 'town': 'village', 'market': 'market', 'bridge': 'street', 'modern_street': 'street',
             'lab': 'workshop', 'device_cutaway': 'workshop', 'landscape': 'outback', 'night_camp': 'battlefield', 'castle': 'castle',
             'mine': 'mine_tunnel', 'map': 'outback'}
SET_INDEX = {k: set(v.split()) for k, v in SET_WORDS.items()}
GATED = {'ship_deck', 'mine_tunnel', 'castle', 'rail_yard', 'saloon'}  # never chosen unless the story's words name them

# ---------------------------------------------------------------- performance
VERB_ACTION = [  # first match wins; literal verbs in the spoken line drive the body
    (r'\b(ran|run|runs|running|raced|race|sprint\w*|fled|flee\w*|charg\w*|stampede\w*|chas\w*|escap\w*|scatter\w*|bolt\w*)\b', 'run'),
    (r'\b(fir(e|ed|es|ing)|shot|shoot\w*|aim\w*|gun\w*|rifle\w*|machine)\b', 'aim'),
    (r'\b(load\w*|reload\w*|ammunition)\b', 'load'),
    (r'\b(walk\w*|march\w*|travel\w*|arriv\w*|went|go|goes|head\w*|wander\w*|approach\w*|return\w*|crossed|journey\w*)\b', 'walk'),
    (r'\b(carr\w*|haul\w*|deliver\w*|lift\w*|brought|bring\w*)\b', 'carry'),
    (r'\b(dug|dig\w*|smash\w*|hit|hits|hammer\w*|chop\w*|struck|strike\w*|built|build\w*)\b', 'swing'),
    (r'\b(pour\w*|spill\w*|fill\w*)\b', 'pour'),
    (r'\b(fell|collaps\w*|fainted)\b', 'fall'),
    (r'\b(won|win|wins|celebrat\w*|cheer\w*|victory|triumph\w*|success\w*)\b', 'cheer'),
    (r'\b(panic\w*|terrif\w*|chaos|disaster)\b', 'panic'),
    (r'\b(destroy\w*|ruin\w*|lost|failed|fail\w*|humiliat\w*)\b', 'react'),   # one startled gesture, not a flail
    (r'\b(point\w*|show\w*|explain\w*|discover\w*|found|notic\w*|look\w*|spott\w*|announc\w*|declar\w*|order\w*)\b', 'point'),
    (r'\b(hid|hide\w*|crouch\w*|duck\w*|wait\w*|search\w*|inspect\w*|examin\w*)\b', 'crouch'),
]
GESTURES = ['talk', 'point', 'talk', 'think']   # what a person does while explaining, in rotation
LEGACY_ACTION = {'idle': 'stand', 'walk': 'walk', 'run': 'run', 'point': 'point', 'lift': 'carry', 'carry': 'carry', 'hold': 'carry', 'grab': 'carry',
                 'place': 'carry', 'pour': 'pour', 'react': 'react', 'shout': 'shout', 'cower': 'crouch', 'worried': 'worry', 'wave': 'cheer',
                 'cheer': 'cheer', 'thumbs_up': 'cheer', 'aim': 'aim', 'fire': 'aim', 'load': 'load', 'strike': 'swing', 'throw': 'swing',
                 'inspect': 'crouch', 'tap': 'point', 'think': 'stand', 'shrug': 'stand', 'cross_arms': 'stand', 'look_back': 'walk'}
FACE = {'grin': 'happy', 'smile': 'happy', 'laugh': 'happy', 'relief': 'happy', 'whistle': 'smug', 'stern': 'determined',
        'nervous': 'worried', 'shock': 'shock', 'dazed': 'sad', 'pained': 'sad', 'neutral': 'neutral'}
ACTION_FACE = {'run': 'shock', 'panic': 'shock', 'react': 'shock', 'worry': 'worried', 'shout': 'determined', 'aim': 'determined', 'load': 'determined', 'swing': 'determined', 'cheer': 'happy', 'fall': 'shock'}
OUTFIT = {'soldier': ('armor', 'helmet'), 'veteran': ('armor', 'helmet'), 'knight': ('armor', 'helmet'), 'captain': ('uniform', 'tricorne'),
          'pirate': ('sailor', 'tricorne'), 'sailor': ('sailor', 'beanie'), 'fisherman': ('sailor', 'beanie'), 'merchant': ('merchant', 'top'),
          'noble': ('royal', 'none'), 'king': ('royal', 'crown'), 'queen': ('dress', 'crown'), 'scholar': ('robe', 'none'), 'doctor': ('labcoat', 'none'),
          'inventor': ('labcoat', 'none'), 'spy': ('merchant', 'top'), 'explorer': ('worker', 'cap'), 'cowboy': ('worker', 'straw'),
          'worker': ('worker', 'hardhat'), 'blacksmith': ('worker', 'none'), 'farmer': ('tunic', 'straw'), 'peasant': ('rags', 'none'), 'villager': ('tunic', 'none'),
          'woman': ('dress', 'none'), 'maid': ('dress', 'headband'), 'nurse': ('labcoat', 'headband'), 'monk': ('robe', 'hood'), 'priest': ('robe', 'none'),
          'elder': ('robe', 'none'), 'chef': ('labcoat', 'cap'), 'pharaoh': ('royal', 'crown'), 'general': ('armor', 'crested'), 'emperor': ('royal', 'laurel'),
          'centurion': ('armor', 'crested'), 'gladiator': ('armor', 'helmet'), 'warrior': ('armor', 'helmet'), 'viking': ('armor', 'helmet'), 'samurai': ('armor', 'helmet'),
          'scientist': ('labcoat', 'none'), 'teacher': ('uniform', 'none'), 'president': ('merchant', 'top'), 'prince': ('royal', 'crown'), 'princess': ('dress', 'crown'),
          'astronaut': ('uniform', 'helmet'), 'engineer': ('worker', 'hardhat'), 'miner': ('worker', 'hardhat'), 'guard': ('armor', 'helmet'), 'pilot': ('uniform', 'cap'),
          'judge': ('robe', 'none'), 'sultan': ('royal', 'turban'), 'scribe': ('robe', 'headband'), 'shepherd': ('tunic', 'hood'), 'hunter': ('tunic', 'cap'),
          'merchant_woman': ('dress', 'headband'), 'rebel': ('rags', 'headband'), 'officer': ('uniform', 'cap')}
ROLES = {   # archetype word (in the cast id) -> outfit kind, hair/hat, shirt colour, trim colour, glasses, facial hair, species
    'hero': ('hoodie', 'spiky', [.2, .45, .85], [.95, .75, .2], 0, 'none', 'human'), 'protagonist': ('hoodie', 'spiky', [.2, .45, .85], [.95, .75, .2], 0, 'none', 'human'),
    'sidekick': ('hoodie', 'beanie', [.25, .65, .35], [.9, .9, .3], 0, 'none', 'human'), 'friend': ('hoodie', 'beanie', [.25, .65, .35], [.9, .9, .3], 0, 'none', 'human'),
    'rival': ('hoodie', 'spiky', [.85, .25, .2], [.1, .1, .12], 0, 'none', 'human'), 'bully': ('sweater', 'none', [.8, .2, .18], [.1, .1, .12], 0, 'none', 'human'),
    'villain': ('suit', 'top', [.12, .1, .18], [.6, .1, .7], 0, 'goatee', 'human'), 'antagonist': ('suit', 'top', [.12, .1, .18], [.6, .1, .7], 0, 'goatee', 'human'),
    'love': ('dress', 'bun', [.95, .45, .6], [.98, .85, .9], 0, 'none', 'human'), 'girlfriend': ('dress', 'bun', [.95, .45, .6], [.98, .85, .9], 0, 'none', 'human'), 'boyfriend': ('hoodie', 'spiky', [.9, .35, .45], [.95, .8, .85], 0, 'none', 'human'),
    'professor': ('sweater', 'none', [.45, .3, .2], [.8, .7, .5], 1, 'goatee', 'human'), 'teacher': ('uniform', 'bob', [.3, .4, .6], [.85, .8, .3], 1, 'none', 'human'),
    'boss': ('suit', 'none', [.25, .27, .32], [.85, .15, .15], 0, 'mustache', 'human'), 'manager': ('suit', 'none', [.3, .32, .4], [.2, .3, .7], 1, 'none', 'human'), 'ceo': ('suit', 'none', [.1, .1, .14], [.9, .75, .2], 0, 'none', 'human'),
    'mom': ('dress', 'bun', [.8, .35, .5], [.95, .85, .6], 0, 'none', 'human'), 'mother': ('dress', 'bun', [.8, .35, .5], [.95, .85, .6], 0, 'none', 'human'), 'dad': ('sweater', 'none', [.3, .45, .6], [.85, .85, .4], 0, 'mustache', 'human'), 'father': ('sweater', 'none', [.3, .45, .6], [.85, .85, .4], 0, 'mustache', 'human'),
    'neighbor': ('sweater', 'none', [.55, .5, .35], [.7, .35, .3], 1, 'mustache', 'human'), 'grandpa': ('sweater', 'none', [.5, .45, .4], [.7, .6, .5], 1, 'beard', 'human'), 'grandma': ('dress', 'bun', [.6, .45, .6], [.9, .85, .9], 1, 'none', 'human'), 'grandfather': ('sweater', 'none', [.5, .45, .4], [.7, .6, .5], 1, 'beard', 'human'), 'grandmother': ('dress', 'bun', [.6, .45, .6], [.9, .85, .9], 1, 'none', 'human'),
    'police': ('police', 'cap', [.15, .25, .5], [.95, .8, .2], 0, 'mustache', 'human'), 'cop': ('police', 'cap', [.15, .25, .5], [.95, .8, .2], 0, 'mustache', 'human'),
    'cashier': ('apron', 'cap', [.85, .3, .25], [.95, .85, .3], 0, 'none', 'human'), 'shopkeeper': ('apron', 'none', [.3, .55, .45], [.9, .75, .3], 0, 'mustache', 'human'), 'clerk': ('apron', 'cap', [.3, .5, .8], [.95, .85, .3], 0, 'none', 'human'), 'barista': ('apron', 'cap', [.4, .28, .2], [.9, .8, .6], 0, 'none', 'human'),
    'alien': ('suit', 'none', [.3, .3, .5], [.5, 1, .5], 0, 'none', 'alien'), 'monster': ('hoodie', 'none', [.35, .2, .5], [.9, .85, .8], 0, 'none', 'monster'), 'ghost': ('worker', 'none', [.9, .95, 1], [.8, .9, 1], 0, 'none', 'ghost'),
}
FACIAL = {'king': 'beard', 'general': 'mustache', 'emperor': 'beard', 'scholar': 'goatee', 'elder': 'beard', 'priest': 'beard', 'monk': 'none', 'pirate': 'beard',
          'viking': 'beard', 'merchant': 'mustache', 'cowboy': 'mustache', 'blacksmith': 'beard', 'centurion': 'mustache', 'sultan': 'goatee', 'sailor': 'mustache', 'captain': 'mustache',
          'pharaoh': 'goatee', 'inventor': 'mustache', 'president': 'mustache', 'scientist': 'goatee', 'doctor': 'mustache', 'soldier': 'mustache', 'veteran': 'mustache'}
SKINS = [[1.0, 1.0, 1.0]]   # house style: every face is pure white (the benchmark's egg characters)
TRIMS = {'armor': [.75, .55, .2], 'royal': [.85, .65, .15], 'robe': [.7, .6, .2], 'dress': [.85, .7, .3], 'tunic': [.8, .7, .35], 'uniform': [.8, .65, .2], 'worker': [.9, .75, .1]}
SHIRTS = [[0.95, 0.32, 0.25], [0.2, 0.55, 0.95], [0.98, 0.78, 0.15], [0.2, 0.75, 0.5]]   # coral, azure, sunny yellow, mint: bright and easy to tell apart
HAT_COLORS = [[0.95, 0.55, 0.1], [0.2, 0.6, 0.9], [0.85, 0.2, 0.45], [0.3, 0.75, 0.35]]

# ---------------------------------------------------------------- props (whitelisted offline models only)
PROP_MODEL = {'barrel': ('pirate-kit/barrel', .9), 'oil_jar': ('pirate-kit/barrel', .8), 'pot': ('pirate-kit/barrel', .6), 'chest': ('pirate-kit/chest', .7),
              'coins': ('pirate-kit/chest', .6), 'gold_piece': ('pirate-kit/chest', .6), 'cannon': ('pirate-kit/cannon', 1.0), 'cart': ('q-medievalvillage/Cart', 1.6),
              'lantern': ('fantasy-town-kit/lantern', .7), 'books': ('furniture-kit/books', .35), 'bottle': ('pirate-kit/bottle', .4), 'flask': ('pirate-kit/bottle', .4),
              'pickaxe': ('pirate-kit/tool-shovel', 1.1), 'tree': ('q-stylizednaturemegakit/CommonTree_3', 5), 'house': ('q-buildings/House1', 5),
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
            (r'\b(rain\w*|storm\w*|flood\w*)\b', 'rain'), (r'\b(snow\w*|blizzard\w*|frozen|freez\w*|winter|ice)\b', 'snow'),
            (r'\b(lightning|thunder\w*|bolt)\b', 'lightning'), (r'\b(torch\w*|campfire\w*|bonfire\w*|ember\w*|ablaze|on fire|wildfire\w*)\b', 'embers')]
IMPACT = re.compile(r'\b(boom|bang|crash\w*|explo\w*|smash\w*|hit|fir(e|ed|ing)|shot|slam\w*|destroy\w*|collaps\w*)\b')
SCALE_WORDS = re.compile(r'\b(\d[\d,]*|thousands?|hundreds?|millions?|army|armies|entire|whole|all|every|herds?|flocks?|mobs?|swarms?|hordes?|crowds?|nation|country)\b')
CROWD_WORDS = re.compile(r'\b(thousands|hundreds|lined up|queued?|queues?|visitors|onlookers|army|armies|soldiers?|troops?|crowds?|farmers|people|villagers|citizens|men|workers|miners|public|locals|settlers|residents|romans?|carthaginians?|fighters|legion\w*|warriors?|guards|columns|marching|soldiery|garrison|battalions?|regiments?|spectators|fans|passengers|sailors|crew)\b')
HERD_WORDS = re.compile(r'\b(\d[\d,]*|thousands?|hundreds?|herds?|flocks?|mobs?|swarms?|hordes?|groups?|packs?)\b')
UPLOADED_HUMANS = os.environ.get('ADVANCED_HUMANS', 'egg') == 'uploaded'  # benchmark look: expressive egg-heads by default (Nov 16 2026 upgrade); 'uploaded' restores the rigged humans
WOMAN = re.compile(r'\b(woman|women|wife|queen|mother|mom|girl|lady|ladies|daughter|princess|empress|sister|nurse|widow|actress|duchess|aunt|grandmother|she|her)\b')
HUMAN_ACTION = {'walk': 'walk', 'run': 'run', 'panic': 'run', 'fall': 'fall'}


def human_cast(ch, x, look):
    """Owner rule: people are the owner's uploaded rigged humans, not engine egg-heads. Only verified clips play
    (anything else stands); hand props are dropped because those rigs have no verified grip."""
    words = ' '.join(str(x.get(k) or '') for k in ('id', 'name', 'role', 'description')).lower().replace('_', ' ').replace('-', ' ')
    out = {k: v for k, v in ch.items() if k not in ('held',)}
    out['model'] = 'uploaded-woman' if WOMAN.search(words) else 'uploaded-man'
    out['action'] = HUMAN_ACTION.get(ch.get('action'), 'stand')
    out['shirt'] = look['shirt']
    return out


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


def score_place(location):
    """Kit -> number of place-type words the free-text location names (phrases like 'train station' count once)."""
    text = ' ' + re.sub(r'[^a-z]+', ' ', str(location or '').lower()) + ' '
    out = {}
    for st, ws in PLACE_INDEX.items():
        n = sum(1 for w in ws if f" {w.replace('-', ' ')} " in text)
        if n: out[st] = n
    return out


def match_location(location):
    """The one kit the location names, or NEUTRAL. Ties between different kits are ambiguous, so neutral too."""
    sc = score_place(location)
    text = str(location or '').lower()
    if re.search(r'\b(indoors?|inside|interior)\b', text): sc = {k: v for k, v in sc.items() if k in INDOOR_KITS}
    elif re.search(r'\b(outdoors?|outside|exterior|open air)\b', text): sc = {k: v for k, v in sc.items() if k not in INDOOR_KITS}
    if not sc: return NEUTRAL
    top = max(sc.values()); best = [k for k, v in sc.items() if v == top]
    if top < MIN_PLACE or len(best) != 1: return NEUTRAL
    return best[0]


MODERN_ITEM = re.compile(r'television|computer|laptop|monitor|keyboard|phone|speaker|microwave|toaster|fridge|refrigerator|washer|dryer|radio|vending|escalator|trafficLight|neon|server|drone|robot|sedan|taxi|truck|pickup|ambulance|airplane|helicopter|rocket|ufo|motorcycle|scooter', re.I)


# People a line talks about without naming anyone from the cast: generic extras act it out.
TRAGEDY = re.compile(r'\b(kill\w*|died|dies|dead|deaths?|victims?|murder\w*|drown\w*|buried alive|massacre\w*|executed|wounded|injured|casualt\w*)\b', re.I)
EXTRA_WORDS = re.compile(r"\b(diggers?|workers?|farmers?|labou?rers?|men|women|people|visitors?|villagers?|miners?|guards?|soldiers?|sailors?|crew|scientists?|"
                         r"experts?|officials?|reporters?|doctors?|police|they|someone|somebody|a man|a woman|the man|the woman|stone ?cutters?|carvers?|builders?)\b")
EXTRA_LOOK = [(r'guards?|soldiers?|police', 'police'), (r'scientists?|experts?|doctors?', 'scientist'), (r'sailors?|crew', 'sailor'),
              (r'officials?|reporters?', 'merchant'), (r'women|a woman|the woman', 'woman'), (r'.', 'worker')]


def extras_for(text):
    """[(id, role)] for the people a line describes but the cast does not name; plural words give two people."""
    m = EXTRA_WORDS.search(text or '')
    if not m or TRAGEDY.search(text or ''): return []   # never put cheerful stand-ins on a line about deaths or victims
    w = m.group(1); role = next(r for pat, r in EXTRA_LOOK if re.fullmatch(pat, w) or pat == '.')
    two = w.endswith('s') or w in ('men', 'women', 'people', 'they', 'crew', 'police') or re.search(r'\b(two|both|pair|several|many|thousands|hundreds)\b', text)
    return [(f'extra-{role}-{k}', role) for k in range(2 if two else 1)]


def plan_locations(m, cards=()):
    """One location per manifest shot, never a closest-wrong kit:
    * shots with a free-text location use the kit that location names, else the neutral sky + ground;
    * older shots without a location need two place words in their own line, else they stay where the
      previous matched line was, else neutral. No time-based switching to other kits."""
    out = []; prev = None
    year = story_year(m.get('script') or ' '.join(str(w) for w in m.get('caption_words') or []) or ' '.join(str(w.get('word', '')) for w in m.get('words') or []))
    for s in m['shots']:
        if s.get('place'):  # manifest v3: the validated place spec decides; no keyword matching, no neutral substitute
            t = s['place']['terrain']; best = t if t in PLACE_KITS else NEUTRAL
            out.append(best); prev = best; continue
        if s.get('location'):
            best = match_location(s['location'])
        else:
            sc = score_sets(text_of(spoken(m, s['start'], s['end'])))
            top = max(sc.values()) if sc else 0
            cands = [k for k, v in sc.items() if v == top]
            best = cands[0] if top >= MIN_SPOKEN and len(cands) == 1 else (prev or NEUTRAL)
        # World Pack: painted era-correct layers outrank any kit; a kit whose look is from another era is never used.
        if s.get('location') and backdrop_for(s['location'], cards): best = NEUTRAL
        elif not kit_fits_era(best, year): best = NEUTRAL
        out.append(best); prev = best if best != NEUTRAL or s.get('location') else prev
    return out


def location_report(m):
    """Per manifest shot: the free-text location, the kit used and why (for the owner's per-shot review)."""
    sets = plan_locations(m)
    return [{'shot': i, 'location': s.get('location'), 'set': st, 'reason': 'named place type' if st != NEUTRAL else 'no kit is this place: neutral sky + ground'}
            for i, (s, st) in enumerate(zip(m['shots'], sets))]


def project(cam, p, t=0.5):
    """Screen position (-1..1 both axes when inside the portrait frame) of world point p at shot fraction t, or None if behind."""
    def lerp(a, b): return [a[k] + (b[k] - a[k]) * t for k in range(3)]
    f = lerp(cam['from'], cam.get('to', cam['from'])); la = lerp(cam['look_at'], cam.get('look_to', cam['look_at']))
    fw = [la[k] - f[k] for k in range(3)]; L = math.sqrt(sum(x * x for x in fw)) or 1; fw = [x / L for x in fw]
    rt = [fw[1], -fw[0], 0.0]; Lr = math.hypot(rt[0], rt[1]) or 1; rt = [rt[0] / Lr, rt[1] / Lr, 0.0]
    up = [rt[1] * fw[2] - rt[2] * fw[1], rt[2] * fw[0] - rt[0] * fw[2], rt[0] * fw[1] - rt[1] * fw[0]]
    d = [p[k] - f[k] for k in range(3)]; z = sum(d[k] * fw[k] for k in range(3))
    if z <= 0.2: return None
    half_v = 18.0 / cam.get('lens', 35); half_h = half_v * SIZE[0] / SIZE[1]
    return (sum(d[k] * rt[k] for k in range(3)) / z / half_h, sum(d[k] * up[k] for k in range(3)) / z / half_v, z)


def card_visible(cam, card):
    """A painted object counts as shown when its middle is inside the frame at mid-shot and it is not a speck (>= 8% of frame height)."""
    h = card['height']; pos = card['pos']
    mid = project(cam, [pos[0], pos[1], h * 0.5]); top = project(cam, [pos[0], pos[1], h]); bot = project(cam, [pos[0], pos[1], 0])
    if not mid or not top or not bot: return False
    return abs(mid[0]) <= 0.92 and abs(mid[1]) <= 0.92 and (top[1] - bot[1]) / 2 >= 0.08


def screen_box(cam, pos, h, w, t=0.5):
    """Screen rectangle (x0, x1, y0, y1, depth) of an upright thing h tall and w wide standing at pos, or None if behind."""
    bot = project(cam, [pos[0], pos[1], 0], t); top = project(cam, [pos[0], pos[1], h], t)
    if not bot or not top: return None
    half = w / 2 / max(bot[2], .3) / (18.0 / cam.get('lens', 35) * SIZE[0] / SIZE[1])
    cx = (bot[0] + top[0]) / 2
    return (cx - half, cx + half, min(bot[1], top[1]), max(bot[1], top[1]), (bot[2] + top[2]) / 2)


def height_frac(cam, card, t=0.5):
    """Share of the frame height a painted object fills (0..1), clipped to the frame."""
    b = screen_box(cam, card['pos'], card['height'], card['height'] * .6, t)
    if not b: return 0.0
    return max(0.0, min(1.0, b[3]) - max(-1.0, b[2])) / 2


PERSON_H, PERSON_W = 1.8, 0.8


def blocked_share(cam, target, blockers, t=0.5):
    """Largest share of the target's on-screen box covered by any nearer blocker box (target/blockers = (pos, h, w))."""
    tb = screen_box(cam, target[0], target[1], target[2], t)
    if not tb: return 0.0
    tx0, tx1, ty0, ty1 = max(-1, tb[0]), min(1, tb[1]), max(-1, tb[2]), min(1, tb[3])
    area = max(0.0, tx1 - tx0) * max(0.0, ty1 - ty0)
    if area <= 0: return 0.0
    worst = 0.0
    for pos, h, w in blockers:
        bb = screen_box(cam, pos, h, w, t)
        if not bb or bb[4] >= tb[4]: continue  # only things in front of the target block it
        ix = max(0.0, min(tx1, bb[1]) - max(tx0, bb[0])); iy = max(0.0, min(ty1, bb[3]) - max(ty0, bb[2]))
        worst = max(worst, ix * iy / area)
    return worst


# ---------------------------------------------------------------- geometry helpers
def basis(h):
    a = math.radians(h); return (math.cos(a), math.sin(a)), (math.sin(a), -math.cos(a))  # forward, right


def at(o, F, R, fwd=0.0, right=0.0, z=None):
    p = [o[0] + F[0] * fwd + R[0] * right, o[1] + F[1] * fwd + R[1] * right]
    return r3(p + ([z] if z is not None else []))


def yaw_facing(d):
    """Character yaw (deg) so its face (-y at yaw 0) points along d."""
    return round(math.degrees(math.atan2(d[0], -d[1])), 2)


def _merge_short(edges, least):
    """Consecutive setups from edge points; a piece shorter than `least` frames joins its neighbour, so no frame is ever left out."""
    pieces = [(x, y) for x, y in zip(edges, edges[1:]) if y > x]
    out = []
    for x, y in pieces:
        if out and (y - x < least or out[-1][1] - out[-1][0] < least): out[-1] = (out[-1][0], y)
        else: out.append((x, y))
    return out or [(edges[0], edges[-1])]


def split_points(m, s, n_max=4, target=1.8):
    """Cut a long manifest shot into setups at word boundaries (measured benchmark: average 1.94 s, median 1.65 s per shot)."""
    a, b = s['start'], s['end']; dur = (b - a) / FPS
    n = max(1, min(n_max, round(dur / target)))
    if n == 1 or dur < 2.4: return [(a, b)]
    starts = [round(w['start'] * FPS) for _, w, _ in spoken(m, a, b)]
    cuts = []
    for j in range(1, n):
        ideal = a + (b - a) * j / n
        cand = [f for f in starts if a + 24 <= f <= b - 24] or [round(ideal)]
        cuts.append(min(cand, key=lambda f: abs(f - ideal)))
    edges = [a] + sorted(set(cuts)) + [b]
    return _merge_short(edges, 12)


def split_sequence(m, s, n):
    """Climax line: n equal setups (one per object state) at word boundaries, each at least 12 frames."""
    a, b = s['start'], s['end']; n = max(1, min(n, (b - a) // 12))
    starts = [round(w['start'] * FPS) for _, w, _ in spoken(m, a, b)]
    cuts = []
    for j in range(1, n):
        ideal = a + (b - a) * j / n
        cand = [f for f in starts if a + 12 <= f <= b - 12 and f not in cuts] or [round(ideal)]
        cuts.append(min(cand, key=lambda f: abs(f - ideal)))
    edges = [a] + sorted(set(cuts)) + [b]
    out = _merge_short(edges, 12)
    return out or [(a, b)]


# ---------------------------------------------------------------- the director
class Director:
    def __init__(self, m, cards=()):
        smooth_story_time(m)   # one time of day per stretch of the story: no day/night flicker between neighbouring scenes
        self.m = m; self.cards = set(cards); self.locations = plan_locations(m, self.cards)
        self.year = story_year(m.get('script') or ' '.join(str(w) for w in m.get('caption_words') or []) or ' '.join(str(w.get('word', '')) for w in m.get('words') or []))
        self.history = []; self.zone_use = {}; self.cast_look = {}; self.last_label = -9
        for i, c in enumerate(m.get('cast') or []):
            role = c.get('outfit')   # the shared vocabulary stays small (legacy web engine); the cast id's own words refine the look
            for w in re.split(r'[^a-z]+', str(c.get('id', '')).lower()):
                if w in OUTFIT and w not in ('worker', 'woman'): role = w; break
            outfit, hat = OUTFIT.get(role, ('worker', 'none')); extra = {}
            for w in re.split(r'[^a-z]+', str(c.get('id', '')).lower()):   # an archetype word in the id (boss, mom, hero, ghost...) sets the whole look
                if w in ROLES:
                    outfit, hat, shirt_c, trim_c, gl, fac, sp = ROLES[w]; extra = {'shirt': shirt_c, 'trim': trim_c, 'glasses': bool(gl), 'facial': fac, 'species': sp}; break
            self.cast_look[c['id']] = {'outfit': outfit, 'hat': hat, 'shirt': SHIRTS[i % 4], 'hat_color': HAT_COLORS[i % 4], 'skin': SKINS[(i * 2 + len(c['id'])) % len(SKINS)],
                                       'facial': FACIAL.get(role, 'none') if outfit not in ('dress',) else 'none', 'trim': TRIMS.get(outfit, [.72, .55, .12])}
            self.cast_look[c['id']].update(extra)
        self.last_zone = None; self.scene_shown = {}

    # -- choose a zone that differs from the previous segment's backdrop
    def zone(self, st, keep=False, shelled=False):
        zones = list(ZONES.get(st, {'center': ((0, 0), 90)}))
        if shelled: zones = [z for z in zones if z == 'front'] or zones   # a furnished room is always seen from its open front, facing the back wall
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
        if ctx['first_of_video']: prefs += (['insert'] if (ctx['story_object'] or ctx['props']) else []) + ['low', 'close', 'establish']   # the hook frame: big and moving
        if ctx.get('opening_reveal'): prefs += ['wide', 'establish', 'high']                                                              # then pull out and show the world
        if ctx['new_place'] and ctx['part'] == 0: prefs += ['establish', 'wide', 'high']
        if ctx['story_object'] and ctx['part'] >= 1: prefs += ['insert']
        elif ctx['story_object'] or ctx['props']: prefs += ['insert']   # benchmark: the key object gets its own close-up as early as the line allows
        if ctx.get('vehicle'): prefs = ['track'] + prefs   # a car or bike is always followed, never left to drive out of frame
        if ctx['moving']: prefs += ['track', 'wide']
        if ctx['scale']: prefs += ['high', 'establish']
        if ctx['threat']: prefs += ['low']
        if ctx['n_people'] >= 2: prefs += ['ots', 'medium']
        if ctx['emotion']: prefs += ['close', 'xclose']
        if ctx['reveal']: prefs += ['orbit', 'xclose']
        if ctx['hint']: prefs.insert(1 if prefs else 0, ctx['hint'])
        prefs += ['medium', 'orbit', 'low', 'close', 'wide', 'high']
        for p in prefs:
            if p == 'track' and ctx.get('vehicle'): return p
            if p == prev or recent.count(p) >= 2 or p in self.history[-2:]: continue
            if p == 'establish' and 'establish' in self.history[-3:]: continue
            if p in ('ots',) and (ctx['n_people'] < 2 or ctx['moving']): continue
            if p in ('close', 'xclose', 'ots') and ctx['n_subjects'] == 0: continue
            if p == 'insert' and not (ctx['story_object'] or ctx['props']): continue
            if p == 'track' and not ctx['moving']: continue
            return p
        return 'wide' if prev != 'wide' else 'medium'

    def segment(self, i, part, a, b, last=True):
        m = self.m; s = m['shots'][i]; st = self.locations[i]
        seq = [str(x) for x in (s.get('sequence') or [])]
        seq_card = f'obj-{seq[part]}.png' if seq and part < len(seq) else None
        ws = spoken(m, a, b); txt = text_of(ws); whole = text_of(spoken(m, s['start'], s['end']))
        new_place = part == 0 and (i == 0 or self.locations[i - 1] != st)
        from place_spec import resolve as _resolve
        zname = self.zone(st, keep=part > 0 and part % 2 == 1 and False, shelled=bool(_resolve(s.get('place') or {}).get('shell')))
        (origin, head) = ZONES[st][zname]; F, R = basis(head)
        dur = round((b - a) / FPS, 3)
        lighting = {'golden': 'sunset', 'night_bright': 'night'}.get(s.get('light'), 'day')
        if NIGHT.search(whole) or s.get('world') == 'night_camp': lighting = 'night'
        elif DUSK.search(whole): lighting = 'sunset'
        if 'rain' in (s.get('fx') or []) or re.search(r'\b(rain\w*|storm\w*)\b', whole) or s.get('world') == 'storm_sea': lighting = 'rain'
        if st in ('office', 'saloon', 'workshop', 'room') and lighting == 'rain': lighting = 'day'
        if s.get('place'):
            lighting = 'rain' if s['place'].get('weather') == 'rain' else PLACE_LIGHT[s['place']['time']]
        # --- who is on screen
        actors = [] if s.get('empty') else [x for x in s.get('actors') or [] if not ANIMAL.search(x['id'].lower())][:3]
        beasts = [x for x in s.get('actors') or [] if ANIMAL.search(x['id'].lower()) and f"{x['id']}.png" in self.cards]
        if s.get('empty'): beasts = []
        if not actors and not beasts and os.environ.get('EXTRAS', '1') != '0':
            for eid, role in ([] if TRAGEDY.search(whole) else extras_for(txt or whole)):   # nobody named: extras do what the line says (diggers dig, guards stand watch)
                if eid not in self.cast_look:
                    k = len(self.cast_look); outfit, hat = OUTFIT.get(role, ('worker', 'none'))
                    self.cast_look[eid] = {'outfit': outfit, 'hat': hat, 'shirt': SHIRTS[(k + 1) % 4], 'hat_color': HAT_COLORS[(k + 2) % 4], 'skin': SKINS[(k * 3 + 1) % len(SKINS)],
                                           'facial': 'none', 'trim': TRIMS.get(outfit, [.72, .55, .12])}
                actors.append({'id': eid, 'action': 'idle', 'expression': 'neutral'})
        if not actors and not beasts and not s.get('empty') and s.get('actor') and not ANIMAL.search(str(s['actor']).lower()):
            actors = [{'id': s['actor'], 'action': s.get('action', 'idle'), 'expression': s.get('expression', 'neutral')}]
        if not beasts and s.get('actor') and f"{s['actor']}.png" in self.cards and ANIMAL.search(str(s['actor']).lower()):
            beasts = [{'id': s['actor'], 'action': s.get('action', 'idle')}]
        animal_cards = [c['id'] for c in (m.get('cast') or []) if ANIMAL.search(c['id'].lower()) and f"{c['id']}.png" in self.cards]
        named = bool(ANIMAL.search(txt or whole)) and not s.get('empty')
        if named and animal_cards and not beasts: beasts = [{'id': k, 'action': 'run'} for k in animal_cards]
        verb = next((act for pat, act in VERB_ACTION if re.search(pat, txt or whole)), None)
        if verb is None and re.search(r'\b(kill\w*|hunt\w*|cull\w*)\b', txt or whole):  # killing means aiming only when weapons are in the story
            verb = 'aim' if re.search(r'\b(gun\w*|rifle\w*|shot|shoot\w*|bullets?|hunters?|soldiers?)\b', whole + ' ' + text_of(spoken(m, 0, 10 ** 9))) else 'panic'
        plan = (ACT.interpret(txt) or (None if ANIMAL.search(whole) else ACT.interpret(whole))) if (actors and not (named and beasts)) else None   # a line cut into several setups keeps its action in every one   # what the character is actually DOING (cook, type, drive, eat, hug...)
        if plan: verb = plan.motion
        beast_verb = verb if named and beasts else None
        if beast_verb in ('run', 'walk', 'panic', 'fall'):  # "the emus scattered": the animals move, people react
            verb = 'aim' if re.search(r'\b(gun\w*|fir\w*|shot|soldiers?|bullets?|kill\w*)\b', whole) and any(self.cast_look.get(x['id'], {}).get('outfit') in ('soldier', 'armor') for x in actors) else 'point'
        herd = bool(HERD_WORDS.search(whole)) and bool(beasts)
        moving = (verb in ('run', 'walk', 'drive', 'ride') and bool(actors)) or (beast_verb in ('run', 'walk', 'panic') and bool(beasts))
        # --- story objects (only when the words name them) and whitelisted props
        story_obj = []
        for p in s.get('props') or []:
            k = {'coins': 'money_bag', 'gold_piece': 'money_bag', 'chest': 'money_bag', 'cart': 'covered_cart', 'pan': 'gold_pan', 'magnifier': 'magnifier'}.get(p.get('kind'))
            if k and re.search(STORY_OBJECT_WORDS[k], whole) and k not in story_obj: story_obj.append(k)
        # Owner rule: a heard keyword never adds a built-in object or model (no "tank" -> army tank); only planned props draw.
        story_obj = story_obj[:1]
        props = []
        for p in s.get('props') or []:
            hit = PROP_MODEL.get(p.get('kind'))
            if hit and all(q[0] != hit[0] for q in props): props.append(hit)
        props = [p for p in props if not (p[0] == 'pirate-kit/ship-large' and st != 'ship_deck')][:3]
        # Painted object cards named by the shot's descriptive phrases (upright cutouts that cast shadows).
        obj_cards = []
        for p in s.get('props') or []:
            ref = str(p.get('asset') or '')
            if p.get('kind') == 'asset' and ref.startswith('card/') and f'obj-{ref[5:]}.png' in self.cards and all(o['image'] != f'obj-{ref[5:]}.png' for o in obj_cards):
                obj_cards.append({'image': f'obj-{ref[5:]}.png', 'size': p.get('size') if p.get('size') in OBJECT_HEIGHT else 'medium', 'phrase': str(p.get('phrase') or ref[5:])})
        obj_cards = obj_cards[:3]
        if seq_card:  # climax: each setup shows one state of the key event, in story order
            obj_cards = [o for o in obj_cards if o['image'] == seq_card][:1]
        ctx = {'first_of_video': i == 0 and part == 0, 'opening_reveal': i == 0 and part == 1, 'new_place': new_place, 'part': part, 'story_object': bool(story_obj), 'props': bool(props) or bool(obj_cards),
               'moving': bool(moving), 'vehicle': bool(plan and plan.vehicle), 'scale': bool(SCALE_WORDS.search(txt)) or herd, 'threat': verb in ('aim', 'load') or s.get('mood') == 'tense',
               'n_people': len(actors), 'n_subjects': len(actors) + len(beasts), 'emotion': verb in ('panic', 'fall', 'cheer') or s.get('expression') in ('shock', 'laugh', 'nervous'),
               'reveal': s.get('mood') == 'reveal', 'hint': HINT.get(s.get('shot')) if part == 0 else None}
        kind = self.camera_type(ctx)
        if seq_card:  # intact = wide, failing = close insert, burst = low and shaking
            kind = 'wide' if part == 0 else ('low' if part == len(seq) - 1 else 'insert')
        S = at(origin, F, R, 2.0, 0)  # subject mark
        cast = []; cards = []; crowd = None; effects = []; objects = []
        # --- staging
        travel_dir = 1 if (i + part) % 2 == 0 else -1
        for j, x in enumerate(actors):
            look = self.cast_look.get(x['id'], {'outfit': 'worker', 'hat': 'none', 'shirt': SHIRTS[j % 4], 'hat_color': HAT_COLORS[j % 4]})
            base = LEGACY_ACTION.get(x.get('action'), 'stand')
            act = verb if verb and (j == 0 or verb in ('run', 'walk', 'panic', 'cheer', 'aim') or (plan and plan.companion)) else base
            if act == 'stand' and j == 0 and (x['id'] == s.get('speaker') or base == 'stand'): act = 'talk' if x['id'] == s.get('speaker') else 'point' if (i + j) % 3 == 0 else 'stand'
            if act == 'point' and verb != 'point' and not plan: act = GESTURES[(i * 3 + part + j) % len(GESTURES)]   # a planner default 'point' on every line looks robotic: vary the speaking gestures
            expr = 'talk' if x['id'] == s.get('speaker') else FACE.get(x.get('expression'), ACTION_FACE.get(act, 'neutral'))
            if act in ACTION_FACE and expr == 'neutral': expr = ACTION_FACE[act]
            n = len(actors)
            mine = plan if (plan and act == plan.motion) else None
            if mine and mine.profile and not mine.vehicle:
                pos = at(S, F, R, 0, 0); yaw = yaw_facing((R[0] * travel_dir, R[1] * travel_dir)) if not mine.away else yaw_facing((F[0] + R[0] * .45 * travel_dir, F[1] + R[1] * .45 * travel_dir))   # side-on to the camera: it can be seen working on what is in front of it
            elif mine and mine.vehicle:
                pos = at(S, F, R, 0, -travel_dir * 2.0 * dur * (1.4 if mine.vehicle == 'car' else .8) / 2); yaw = yaw_facing((R[0] * travel_dir, R[1] * travel_dir))
            elif act in ('walk', 'run'):
                v = .7 if act == 'walk' else 1.3; span = v * dur
                start = at(S, F, R, 0.6 * j, -travel_dir * span / 2 + (-.7 * j * travel_dir))
                yaw = yaw_facing((R[0] * travel_dir, R[1] * travel_dir))
                if kind in ('low', 'xclose', 'close'):  # run toward the lens for the dramatic setups
                    start = at(S, F, R, 0.5 + span * .6, 0.6 * (j - (n - 1) / 2)); yaw = yaw_facing((-F[0], -F[1]))
                pos = start
            else:
                gap = .3 if (plan and plan.activity == 'hug') else .52 if (plan and plan.activity == 'handshake') else .75   # partners stand close enough to touch
                offs = [(0, 0)] if n == 1 else [(-gap, 0), (gap, 0)] if n == 2 else [(-.9, 0), (.9, 0), (0, .9)]
                pos = at(S, F, R, offs[j][1], offs[j][0])
                if n >= 2 and j < 2:  # partners turn toward each other (3/4 to camera)
                    other = at(S, F, R, offs[1 - j][1], offs[1 - j][0]); d = (other[0] - pos[0] - F[0] * .9, other[1] - pos[1] - F[1] * .9)
                    yaw = yaw_facing(d)
                else:
                    yaw = yaw_facing((-F[0] + R[0] * .25 * (1 if j % 2 else -1), -F[1] + R[1] * .25 * (1 if j % 2 else -1)))
            ch = {'id': x['id'], 'pos': pos, 'yaw': yaw, 'action': act, 'expression': expr, 'outfit': look['outfit'], 'hat': look['hat'],
                  'shirt': look['shirt'], 'hat_color': look['hat_color'], 'skin': look.get('skin', [.94, .93, .88]), 'facial': look.get('facial', 'none'), 'trim': look.get('trim', [.72, .55, .12])}
            if look.get('species', 'human') != 'human': ch['species'] = look['species']
            if look.get('glasses'): ch['glasses'] = True
            if mine:
                if mine.held: ch['holds'] = [{'prop': pr, 'hand': hd} for pr, hd in mine.held]
                if mine.seat: ch['seat'] = .53
                if ch['expression'] in ('neutral', 'talk') and mine.face and x['id'] != s.get('speaker'): ch['expression'] = 'sleep' if mine.activity == 'sleep' else mine.face
                if mine.activity == 'sleep': ch['expression'] = 'sleep'
                if mine.companion and n >= 2: ch['holds'] = []
            if act in ('aim', 'load') and st in ('office', 'saloon', 'workshop', 'room'): act = 'point'; ch['action'] = act
            if act in ('aim', 'load') and look['outfit'] in ('soldier', 'armor'): ch['held'] = 'rifle'
            elif act == 'carry' and not ch.get('holds'): ch['held'] = 'crate'
            elif act == 'swing': ch['held'] = 'tool'
            cast.append(human_cast(ch, x, look) if UPLOADED_HUMANS else ch)
        if beasts:
            herd_n = max(0, (6 if herd else min(6, max(len(beasts), 1))) - len(obj_cards))
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
        if CROWD_WORDS.search(whole) and st in OUTDOOR and kind in ('establish', 'wide', 'high', 'orbit', 'low', 'medium', 'track', 'ots'):
            cact = 'run' if verb in ('run', 'panic') else 'cheer' if verb == 'cheer' else 'stand'
            cc = at(S, F, R, 4.5, 0)
            army = bool(re.search(r'\b(army|armies|soldiers?|troops?|legion\w*|warriors?|battle|siege|march\w*|romans?|carthaginians?|fighters|guards|columns|garrison)\b', whole))
            crowd = {'count': 60 if kind in ('establish', 'high') else 36 if kind in ('wide', 'orbit', 'low') else 20, 'center': cc, 'size': [9.0, 4.5], 'action': cact, 'kind': 'army' if army else 'civil',
                     'yaw': yaw_facing((-F[0], -F[1])), 'seed': i * 11 + part}
        # story object goes beside the subject; props frame the subject without blocking it
        anchor = cast[0]['pos'] if cast else S
        for k in story_obj:
            act = 'hold'
            for cand in OBJECTS[k]['actions'] if isinstance(OBJECTS[k], dict) else []:
                if cand != 'hold' and re.search(cand[:4], txt): act = cand
            objects.append({'kind': k, 'action': act, 'pos': at(anchor, F, R, -0.7, 0.55) + [0], 'scale': .85, 'yaw': round(head - 90, 2)})
        obj_specs = []
        for j, o in enumerate(obj_cards):
            h = OBJECT_HEIGHT[o['size']]; side = (1 if j % 2 == 0 else -1) * (1 if (i % 2 == 0) else -1)
            if o['size'] == 'huge': pos = at(S, F, R, 4.6 + 1.2 * j, 2.4 * side)
            elif o['size'] == 'large': pos = at(S, F, R, 2.6 + 0.8 * j, 1.9 * side)
            elif o['size'] == 'medium': pos = at(anchor, F, R, 0.25, 1.15 * side)
            else: pos = at(anchor, F, R, -0.35, 0.7 * side)
            obj_specs.append({'image': o['image'], 'pos': pos, 'height': h})
        cards = obj_specs + cards
        prop_specs = []
        for j, (mid, hgt) in enumerate(props):
            big = hgt >= 4
            p = at(S, F, R, 4.0 + 2 * j, (-3.2 if j % 2 else 3.2)) if big else at(anchor, F, R, 0.3 + 0.5 * j, (1.25 if j % 2 == 0 else -1.3))
            prop_specs.append({'id': mid, 'pos': p, 'height': hgt, 'yaw': round((head + 35 * j) % 360, 1)})
        rigs = []
        if plan and cast:
            c0 = cast[0]; yv = math.radians(c0['yaw']); fw = (math.sin(yv), -math.cos(yv)); rt = (math.cos(yv), math.sin(yv))
            for mid, ph, fwd, right, off in plan.pieces:
                prop_specs.append({'id': mid, 'pos': r3([c0['pos'][0] + fw[0] * fwd + rt[0] * right, c0['pos'][1] + fw[1] * fwd + rt[1] * right]), 'height': ph, 'yaw': round((math.degrees(yv) + off) % 360, 1)})
            if plan.vehicle:
                lx, ly = (-.32, .2) if plan.vehicle == 'car' else (0, .4)   # where the rider sits in the vehicle's own frame
                px, py = c0['pos']; ryaw = math.degrees(yv)
                cx = px - (lx * math.cos(yv) - ly * math.sin(yv)); cy = py - (lx * math.sin(yv) + ly * math.cos(yv))
                dist = dur * (5.5 if plan.vehicle == 'car' else 3.0)
                c0['pos'] = r3([px, py]); c0['to'] = r3([px + fw[0] * dist, py + fw[1] * dist]); c0['action'] = plan.motion
                if plan.vehicle == 'car': c0['seat'] = .55
                rigs.append({'kind': plan.vehicle, 'pos': r3([cx, cy]), 'yaw': round(ryaw % 360, 1), 'to': r3([cx + fw[0] * dist, cy + fw[1] * dist]), 'color': SHIRTS[(i + part) % 4]})
            if plan.rig: rigs.append({'kind': plan.rig, 'pos': r3([c0['pos'][0] + fw[0] * .35, c0['pos'][1] + fw[1] * .35]), 'yaw': round(math.degrees(yv) % 360, 1)})
            prop_specs = prop_specs[:8]
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
            elif fk == 'snow':
                if st in OUTDOOR: effects.append({'kind': 'snow', 'pos': at(S, F, R, 0, 0, 0), 'start': 0, 'scale': 1, 'seed': i})
            elif fk == 'lightning':
                effects.append({'kind': 'lightning', 'pos': at(S, F, R, 4.0, 0, 0), 'start': round(t0, 3), 'scale': 1, 'seed': i})
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
        beast_cards = cards[len(obj_specs):]
        subj = [c['pos'] for c in cast] + [c['pos'] for c in beast_cards] + [c['pos'] for c in obj_specs if c['height'] < 2]
        if beast_cards and 'to' in beast_cards[0]: subj += [beast_cards[0]['to']]
        C = [sum(p[0] for p in subj) / len(subj), sum(p[1] for p in subj) / len(subj)] if subj else S
        cam = self.make_camera(kind, s, st, origin, head, F, R, C, cast, beast_cards, objects, dur, moving, verb, travel_dir, txt, part, obj_specs)
        # Every painted object the line names must be seen in its scene: reframe wide, then an insert on the object.
        shown = [o['image'] for o in obj_specs if card_visible(cam, o)]
        seen = self.scene_shown.setdefault(i, set()); seen.update(shown)
        missing = [o for o in obj_specs if o['image'] not in seen]
        if missing and (last or kind not in ('close', 'xclose', 'ots', 'insert')):
            for k2 in ('wide', 'establish', 'insert'):
                big = [c['pos'] for c in obj_specs] + [c['pos'] for c in cast]
                C2 = [sum(p[0] for p in big) / len(big), sum(p[1] for p in big) / len(big)]
                cam2 = self.make_camera(k2, s, st, origin, head, F, R, C2, cast, beast_cards, objects, dur, moving, verb, travel_dir, txt, part, missing)
                if all(card_visible(cam2, o) for o in missing):
                    cam, kind = cam2, k2; shown = [o['image'] for o in obj_specs if card_visible(cam, o)]; seen.update(shown); break
        # Occlusion: nobody may hide the key object (or, in a close-up, the subject); move the person, else cut to an insert.
        fixes = []
        key = obj_specs[0] if obj_specs else None
        def worst_block(target):
            return max(blocked_share(cam, target, [(c['pos'], PERSON_H, PERSON_W) for c in cast if c is not target_ch], t) for t in (.2, .5, .8))
        target_ch = None
        if key:
            target = (key['pos'], key['height'], key['height'] * .6)
        elif cast and kind in ('close', 'xclose'):
            target_ch = cast[0]; target = (target_ch['pos'], PERSON_H, PERSON_W)
        else:
            target = None
        if target and worst_block(target) > 0.3:
            for c in [c for c in cast if c is not target_ch and c['action'] not in ('walk', 'run')]:
                best = None
                for step in (1.2, -1.2, 2.2, -2.2):
                    old = c['pos']; c['pos'] = at(old, F, R, 0, step)
                    share = worst_block(target)
                    if share <= 0.3: best = step; break
                    c['pos'] = old
                if best is not None: fixes.append(f"moved {c['id']} {abs(best)} m aside"); break
            if worst_block(target) > 0.3 and key:
                cam2 = self.make_camera('insert', s, st, origin, head, F, R, C, cast, beast_cards, objects, dur, moving, verb, travel_dir, txt, part, [key])
                cam, kind = cam2, 'insert'; fixes.append('cut to a close-up of the object (blocked)')
        # Wide shots: the key object fills at least 15% of the frame height, otherwise cut to a close-up of it.
        if key and kind in ('wide', 'establish', 'high') and height_frac(cam, key) < 0.15:
            cam2 = self.make_camera('insert', s, st, origin, head, F, R, C, cast, beast_cards, objects, dur, moving, verb, travel_dir, txt, part, [key])
            if height_frac(cam2, key) >= 0.15:
                fixes.append(f"wide shot showed the object at {height_frac(cam, key):.0%} of frame height: cut to a close-up")
                cam, kind = cam2, 'insert'
        if obj_specs:
            shown = [o['image'] for o in obj_specs if card_visible(cam, o)]; seen.update(shown)
        if seq_card and part == len(seq) - 1:  # the burst: shake and dust on the cut
            cam['shake'] = [{'t': 0.0, 'amp': 0.07}, {'t': round(min(dur, .6), 3), 'amp': 0.02}]
            if len(effects) < 6 and st in OUTDOOR: effects.append({'kind': 'dust', 'pos': at(S, F, R, 2.0, 0, 0), 'start': 0.05, 'scale': 1.4, 'seed': i * 7 + 5})
        if IMPACT.search(txt):
            hits = [w for _, w, t in ws if IMPACT.search(str(t).lower())]
            t = max(0.0, min(dur, (hits[0]['start'] * FPS - a) / FPS)) if hits else min(dur, .15)
            cam['shake'] = [{'t': round(t, 3), 'amp': 0.05}, {'t': round(min(dur, t + .35), 3), 'amp': 0.025}]
        shot = {'set': st, 'lighting': lighting, 'duration': max(0.2, min(12, dur)), 'camera': cam, 'cast': cast, 'objects': objects,
                'engine': 'eevee', 'samples': 16, 'size': list(SIZE), 'grade': 'Punchy'}
        if st in OUTDOOR and lighting in ('day', 'sunset'):  # gentle aerial perspective only: strong mist swallowed the sky
            shot['haze'] = 0.003; shot['haze_color'] = [0.86, 0.72, 0.56] if st == 'outback' else [0.5, 0.66, 0.9]   # a touch of blue distance, never a white wash
        if cards: shot['cards'] = cards
        if cast and os.environ.get('HUMAN_CAST') == 'ual':   # CC0 mocap mannequin for every person (HUMAN_CAST=ual); the bean cast stays the default
            for c in cast: c['model'] = 'ual-mannequin'; c.pop('held', None)
        if self.year is not None and self.year < 1900: shot['era'] = int(self.year)   # old story: rooms get period materials, not modern tile and lamps
        if s.get('place'):
            pl = s['place']
            if plan and plan.place_hint and plan.score >= 2.9 and not ACT.compatible(plan, pl.get('terrain')) and pl.get('terrain') not in ('road', 'highway'):
                pl = {**pl, 'terrain': plan.place_hint, 'dressing': []}
            shot['place'] = compile_place(pl, seed=i)
            if shot.get('era') is not None:   # no televisions, computers or phones in an old story's rooms
                shot['place']['items'] = [it for it in shot['place'].get('items', []) if not MODERN_ITEM.search(str(it.get('id', '')))]
            if s['place'].get('weather') == 'fog': shot['haze'] = 0.02; shot['haze_color'] = [0.62, 0.66, 0.72]
        else:
            bd = backdrop_for(s.get('location'), self.cards)
            if bd: shot['backdrop'] = bd
        if crowd: shot['crowd'] = crowd
        foot_n = 0
        # footfall dust: a small puff where each foot lands, timed to the stride (walk 1.2 steps/s, run 2.8 steps/s)
        for j, c in enumerate(cast):
            if c.get('action') in ('walk', 'run') and os.environ.get('FOOTFALL_DUST', '1') != '0':
                period = (1 / 1.2) if c['action'] == 'walk' else (1 / 2.8)
                x0, y0 = c['pos']; x1, y1 = c.get('to', c['pos'])
                k = 0; t = period * 0.5
                while t < dur - 0.05 and foot_n < 24:
                    u = t / max(dur, 1e-3)
                    px, py = x0 + (x1 - x0) * u, y0 + (y1 - y0) * u
                    effects.append({'kind': 'dust', 'pos': [round(px, 3), round(py, 3), 0.0], 'start': round(t, 3), 'scale': 0.35 if c['action'] == 'walk' else 0.55,
                                    'seed': i * 31 + j * 7 + k})
                    foot_n += 1; t += period; k += 1
        if effects: shot['effects'] = effects
        if prop_specs: shot['props'] = prop_specs
        if rigs: shot['rigs'] = rigs
        self.house_extras(shot, i, part, kind, st, cast, cam, txt)
        if kind not in ('track', 'orbit', 'establish'): normalize_travel(cam, shot['duration'])
        if cast and kind not in ('establish', 'high', 'insert') and not (kind == 'track' and any(c.get('to') for c in cast)): keep_cast_in_frame(cam, cast)
        self.history.append(kind); self.last_zone = (st, zname)
        return validate_shot(shot), {'camera_type': kind, 'set': st, 'zone': zname, 'verb': verb, 'words': txt, 'location': s.get('location'),
                                     'objects': [o['phrase'] for o in obj_cards], 'cards_shown': shown,
                                     'key_height': round(height_frac(cam, key), 3) if key else None, 'fixes': fixes,
                                     'cast': [c['id'] for c in cast], 'cast_reasons': {c['id']: (s.get('cast_reasons') or {}).get(c['id'], '') for c in cast},
                                     'sequence_step': seq[part] if seq_card else None}

    def vfx_extras(self, shot, i, part, kind, st, cast, txt):
        """Editing-language VFX chosen from the words of the line: confetti at a celebration, hearts for love, floating dust motes in light,
        speed lines on a chase, a white flash on a bang, an RGB glitch for digital trouble, film grain for old footage, a light leak for warm memories."""
        t = (txt or '').lower(); fx = shot.setdefault('effects', []); ov = shot.setdefault('overlay', [])
        if i == 0 and part == 0 and 'flash' not in ov: ov.append('flash')    # a white pop on the very first frames: a pattern interrupt for the scroll
        if not cast: return
        cx = sum(c['pos'][0] for c in cast) / len(cast); cy = sum(c['pos'][1] for c in cast) / len(cast)
        def add(kk, sc=1.0):
            if len(fx) < 6 and all(e['kind'] != kk for e in fx): fx.append({'kind': kk, 'pos': [round(cx, 3), round(cy, 3), 0.0], 'start': 0, 'scale': sc, 'seed': i * 11 + part})
        if re.search(r'\b(party|birthday|celebrat\w*|confetti|congratulat\w*|won|win|wins|victory|winner|cheer\w*|surprise)\b', t): add('confetti')
        if re.search(r'\b(love|loved|loves|kiss\w*|heart|romance|romantic|crush|valentine|wedding|date)\b', t): add('hearts')
        if st in ('room', 'office', 'workshop') and re.search(r'\b(sunlight|sunbeam|dust|dusty|old|attic|abandoned|quiet|morning|afternoon|memory|remember\w*)\b', t): add('motes')
        want = []
        if re.search(r'\b(chase\w*|chasing|ran|run|running|race|racing|raced|sprint\w*|speed\w*|fast|rush\w*|escape\w*|fled|flee|zoom\w*|dash\w*)\b', t): want.append('speed_lines')
        if re.search(r'\b(suddenly|boom|bang|crash\w*|explod\w*|exploded|slam\w*|shock\w*|snap\w*|gasp\w*)\b', t): want.append('flash')
        if re.search(r'\b(glitch\w*|hack\w*|virus|error|matrix|digital|cyber\w*|computer|software|AI|robot\w*|signal)\b', t, re.I): want.append('glitch')
        if re.search(r'\b(memory|memories|remember\w*|childhood|nostalg\w*|years ago|once upon|long ago|old days)\b', t): want.append('light_leak')
        if re.search(r'\b(flashback|footage|vintage|old photo\w*|black and white|archive\w*|tape)\b', t): want.append('grain')
        for w in want:
            if len(ov) < 4 and w not in ov: ov.append(w)

    def house_extras(self, shot, i, part, kind, st, cast, cam, txt):
        """Depth, story lighting and an in-world label (benchmark rulebook): a blurred foreground object near the lens, a cooler key at the pivot,
        and a painted sign carrying the year or number the line names."""
        n = max(2, len(self.m['shots'])); shot['tint'] = story_tint(i / (n - 1), shot['lighting'])
        if (shot.get('place') or {}).get('terrain') in KITSET:   # indoors the lens stays under the ceiling (a 5 m 'high' shot would look at the roof planks)
            for key in ('from', 'to'):
                if key in cam and cam[key][2] > 2.3: cam[key] = [cam[key][0], cam[key][1], 2.3]
            limit_pitch(cam, 24.0, 15.0)   # a room is seen level, never looked down at the floor
            if shot['place'].get('shell'): shot['haze'] = 0   # indoors there is no distance haze: it only turns the room milky
            if shot['place'].get('shell') and kind in ('wide', 'establish', 'high', 'orbit', 'track'):   # establish the whole furnished room from its open front
                dx = round(max(-1.0, min(1.0, cam['from'][0])) * 0.6, 3)
                cam['from'] = [dx, -4.4, 1.5]; cam['to'] = [dx * 0.5, -3.6, 1.5]; cam['look_at'] = [0.0, 5.0, 0.85]; cam['look_to'] = [0.0, 5.0, 0.85]; cam['lens'] = 28
        else: limit_pitch(cam)
        place = shot.get('place')
        if place:
            clear_lens_items(place, cam)
            clear_sightline(place, cam, [tuple(c['pos'][:2]) for c in cast] + [tuple(c['pos'][:2]) for c in shot.get('cards', [])])
        self.vfx_extras(shot, i, part, kind, st, cast, txt)
        if not place or not cast: return
        import library
        f, la = cam['from'], cam['look_at']; fx, fy = la[0] - f[0], la[1] - f[1]; L = math.hypot(fx, fy) or 1.0; fx, fy = fx / L, fy / L; rx, ry = fy, -fx
        cx = sum(c['pos'][0] for c in cast) / len(cast); cy = sum(c['pos'][1] for c in cast) / len(cast)
        lat = (cx - f[0]) * rx + (cy - f[1]) * ry; side = -1 if lat > 0 else 1        # the object enters from the side the cast is not on
        if kind in FG_KINDS and (i + part) % 3 != 2 and len(place.get('items', [])) < 38:
            indoor = st in INDOOR_KITS or place.get('terrain') in KITSET
            pool = FG_INDOOR if indoor else FG_OUTDOOR; mid = pool[(i * 5 + part) % len(pool)]
            if library.known(mid):
                fw = 0.675 * 1.9                                                          # frame width at the object's distance
                x, y = f[0] + fx * 1.9 + rx * side * 0.47 * fw, f[1] + fy * 1.9 + ry * side * 0.47 * fw
                z = 0.0 if indoor else max(0.0, terrain_height(place['terrain'], x, y, place.get('seed', 0), place.get('params')))
                place['items'].append({'id': 'lib:' + mid, 'model': mid, 'pos': [round(x, 3), round(y, 3), round(z, 3)], 'height': 0.3, 'yaw': float((i * 53) % 360 - 180)})
                cam['fstop'] = min(cam.get('fstop', 3.4), 3.4)                         # shallow enough for the foreground to blur
        m = LABEL_RE.search(txt or '')
        spoken = None if m else spoken_number(txt or '')
        if (m or spoken) and part == 0 and i - self.last_label >= 3 and kind not in ('insert', 'xclose'):
            word = (re.sub(r"\s+", " ", m.group(1).upper()).strip() if m else spoken)[:24]
            d = max(1.5, math.hypot(cx - f[0], cy - f[1])); fw = 0.675 * d; width = max(1.2, min(2.6, 0.30 + 0.2 * len(word)))
            sc = min(1.0, 0.26 * fw / width); lat = 0.24 * fw + 0.13 * fw
            lx, ly = cx - rx * side * lat - fx * 0.5, cy - ry * side * lat - fy * 0.5
            shot['label'] = {'text': word, 'pos': [round(lx, 3), round(ly, 3)], 'yaw': round(math.degrees(math.atan2(f[0] - lx, -(f[1] - ly))), 1), 'scale': round(sc, 3)}
            self.last_label = i

    def make_camera(self, kind, s, st, origin, head, F, R, C, cast, cards, objects, dur, moving, verb, tdir, txt, part, obj_cards=()):
        side = 1 if (len(self.history) % 2 == 0) else -1
        face = 1.62
        def P(fwd, right, z, base=C): return at(base, F, R, fwd, right, z)
        tgt = P(0, 0, 1.0)
        if kind == 'establish':
            cam = {'from': P(-7.0, 1.8 * side, 3.4), 'to': P(-5.4, 1.0 * side, 2.1), 'look_at': P(0.4, 0, 1.0), 'lens': 28, 'fstop': 8}
        elif kind == 'wide':
            tall = max([o['height'] for o in obj_cards] + [0])
            if tall >= 2:  # a landmark-sized object: step back and look up so the whole thing fits
                cam = {'from': P(-6.5 - tall * 0.9, 1.4 * side, 1.6), 'look_at': P(1.2, 0, min(3.2, tall * 0.42)), 'lens': 24, 'fstop': 8}
            else:
                cam = {'from': P(-6.0, 1.4 * side, 1.9), 'look_at': P(0.3, 0, 1.0), 'lens': 28, 'fstop': 6}
        elif kind == 'medium':
            cam = {'from': P(-3.4, .8 * side, 1.5), 'look_at': P(0, 0, 1.05), 'lens': 35, 'fstop': 4}
        elif kind in ('close', 'xclose'):
            who = cast[0]['pos'] if cast else (cards[0]['pos'] if cards else C)
            hz = face if cast else (cards[0]['height'] * .75 if cards else 1.2)
            lens_ = CLOSE_LENS if kind == 'close' else XCLOSE_LENS
            d = 1.9 / (SUBJECT_FRAC[kind] * 2 * 18.0 / lens_)    # the distance that already gives the subject its share of the frame: a wide lens close in shows far more of the place than a long lens far back
            cam = {'from': at(who, F, R, -d, .35 * side, hz + .05), 'look_at': at(who, F, R, 0, 0, hz - (0.08 if kind == 'close' else 0)),
                   'lens': CLOSE_LENS if kind == 'close' else XCLOSE_LENS, 'fstop': CLOSE_FSTOP if kind == 'close' else XCLOSE_FSTOP}
        elif kind == 'low':
            cam = {'from': P(-2.5, .9 * side, 0.32), 'look_at': P(0, 0, 1.55), 'lens': 21, 'fstop': 5}
        elif kind == 'high':
            cam = {'from': P(-3.6, 1.2 * side, 7.5), 'look_at': P(0.4, 0, 0.2), 'lens': 26, 'fstop': 8}
        elif kind == 'ots':
            a_, b_ = cast[0]['pos'], cast[1]['pos']
            if len(self.history) % 2: a_, b_ = b_, a_
            d = [b_[0] - a_[0], b_[1] - a_[1]]; L = math.hypot(*d) or 1; u = [d[0] / L, d[1] / L]; perp = [-u[1], u[0]]
            sgn = side
            cam = {'from': r3([a_[0] - u[0] * 1.8 + perp[0] * 1.25 * sgn - F[0] * .4, a_[1] - u[1] * 1.8 + perp[1] * 1.25 * sgn - F[1] * .4, 1.62]),
                   'look_at': r3([b_[0], b_[1], 1.55]), 'lens': 38, 'fstop': 2.8}
        elif kind == 'track':
            mover = next((c for c in cast if c['action'] in ('walk', 'run', 'drive', 'ride')), None)
            if mover and mover.get('to'):
                p0 = mover['pos']; p1 = mover['to']; mover = None
            elif mover:
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
            if obj_cards and not objects:  # close look at the painted object the line is about
                o = obj_cards[0]; h = o['height']; d = 1.2 + h * 1.25
                cam = {'from': at(o['pos'], F, R, -d, .35 * side, min(h * 0.55 + .4, 4.5)), 'look_at': at(o['pos'], F, R, 0, 0, h * 0.5),
                       'lens': 35 if h < 2 else 28, 'fstop': 2.8}
            elif objects:
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
        follows = kind == 'track' and any(c.get('to') for c in cast)   # a travelling vehicle: the camera already moves with it
        if cast and kind not in ('insert',) and not follows: cam = fit_subject(cam, cast, kind, indoor=st in INDOOR_KITS)
        if kind in ('close', 'xclose') and len(cast) == 1: cam = rule_of_thirds(cam, side)
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
                arc = (0.18 if kind in ('low', 'medium', 'wide') else 0.1) * math.dist(f, la) * (1 if (len(self.history) + part) % 2 else -1)
                cam['to'] = r3([f[k] + tw[k] * (0.3 if kind in ('low', 'medium', 'wide') else 0.22) + (R[k] * arc if k < 2 else 0) for k in range(3)])
        cam = clear_lens(cam, obstacles(cast, cards, dur), keep=kind in ('close', 'xclose', 'insert'))
        if st == 'mine_tunnel':
            for k in ('from', 'to', 'whip_from'):
                if k in cam: cam[k][0] = max(-0.9, min(0.9, cam[k][0]))
        if st in ('office', 'saloon', 'workshop', 'room'):  # keep the lens inside the walls
            for k in ('from', 'to', 'whip_from'):
                if k in cam: cam[k] = [max(-5.4, min(5.4, cam[k][0])), max(-4.5, min(8.4, cam[k][1])), max(0.25, min(4.1, cam[k][2]))]
        return cam


def obstacles(cast, cards, dur):
    """Every spot a body occupies during the shot: standing marks, sampled walk/run paths and moving cards."""
    pts = []
    for c in cast:
        pts.append(c['pos'])
        if c['action'] in ('walk', 'run'):
            v = .7 if c['action'] == 'walk' else 1.3; yv = math.radians(c['yaw']); d = [math.sin(yv), -math.cos(yv)]
            for k in range(1, 9): t = dur * k / 8; pts.append([c['pos'][0] + d[0] * v * t, c['pos'][1] + d[1] * v * t])
    for c in cards:
        pts.append(c['pos'])
        if 'to' in c:
            for k in range(1, 9): pts.append([c['pos'][0] + (c['to'][0] - c['pos'][0]) * k / 8, c['pos'][1] + (c['to'][1] - c['pos'][1]) * k / 8])
    return pts


def clear_lens(cam, obstacles, radius=1.0, keep=False):
    """Back the camera away (along its own view line) until no person/animal stands within `radius` of the lens.
    Close-ups keep their subject distance; only blockers between lens and subject are cleared."""
    la = cam['look_at']
    for key in ('from', 'to'):
        if key not in cam: continue
        p = list(cam[key])
        for _ in range(14):
            near = [o for o in obstacles if math.hypot(o[0] - p[0], o[1] - p[1]) < radius
                    and not (keep and math.hypot(o[0] - la[0], o[1] - la[1]) < 0.35)]
            if not near: break
            d = [p[0] - la[0], p[1] - la[1]]; L = math.hypot(*d) or 1
            p = [p[0] + d[0] / L * .45, p[1] + d[1] / L * .45, p[2] + (0.05 if p[2] > 1 else 0)]
        cam[key] = r3(p)
    return cam


def plan(m, cards=()):
    """All segments of the video: [{'shot_index', 'start', 'end', 'shot', 'notes'}] covering every frame exactly once."""
    d = Director(m, cards); out = []
    for i, s in enumerate(m['shots']):
        parts = split_sequence(m, s, len(s['sequence'])) if s.get('sequence') else split_points(m, s)
        if s.get('sequence') and len(parts) < len(s['sequence']):  # too short for every state: keep the start and the burst
            s['sequence'] = (s['sequence'][:max(1, len(parts) - 1)] + s['sequence'][-1:])[:len(parts)] if len(parts) > 1 else s['sequence'][-1:]
        for part, (a, b) in enumerate(parts):
            shot, notes = d.segment(i, part, a, b, last=part == len(parts) - 1)
            out.append({'shot_index': i, 'start': a, 'end': b, 'shot': shot, 'notes': notes})
    return out
