"""What is the character DOING? Reads the words of a line and decides a concrete activity: the body motion, the items in the hands,
the furniture or vehicle it needs, and the place it belongs in. Pure data and regexes (no Blender), so it is fast to test.

    interpret("She was baking cookies for the party")  ->  Plan(activity='cook', held=[('pan','right')], pieces=[stove...])

Rules the director relies on:
  * every activity has weighted word patterns; the best score wins (a literal verb beats a noun that merely hints at an activity);
  * a food noun alone ("cookie", "pizza") hints at cooking, but an eating verb ("ate", "bite") wins over it;
  * a vehicle noun with a travel verb ("drove", "rode a bike") means the character is IN the vehicle and it moves;
  * an activity never needs a prop that is not in the offline library: every model id here is checked by test_activities.py.
"""
import re
from dataclasses import dataclass, field


def W(*pairs):
    return [(re.compile(p, re.I), w) for p, w in pairs]


# held: (prop, hand)      pieces: (library model, height m, forward m, right m, yaw offset deg)  placed relative to the character, forward = the way it faces
# profile: turn the character side-on to the camera so it can be seen working on the thing in front of it
# places: recipe/kit names where this reads naturally; place_hint is the recipe to switch to when the scene is somewhere else
ACTIVITIES = {
    # ----- travelling
    'run':    dict(motion='run', face='shock', words=W((r'\b(ran|run|runs|running|raced?|sprint\w*|fled|flee\w*|charg\w*|stampede\w*|chas\w*|escap\w*|bolt\w*|rush\w*|dash\w*)\b', 3.2))),
    'walk':   dict(motion='walk', words=W((r'\b(walk\w*|march\w*|strol\w*|wander\w*|approach\w*|arriv\w*|went|goes|go|head\w*|return\w*|crossed|journey\w*|travel\w*|step\w*|follow\w*)\b', 2.6))),
    'drive':  dict(motion='drive', vehicle='car', profile=True, face='determined', place_hint='highway', places=('road', 'highway', 'countryside_road', 'town_street', 'lowpoly_city', 'street'),
                   words=W((r'\b(drove|drive|drives|driving|driver|drivers|steer\w*|motorist|behind the wheel|car chase|got in(to)? (the |a |his |her )?car|speed(ed|ing) (down|along|through))\b', 4.0), (r'\b(cars?|taxi|truck|van|suv|automobile|vehicle)s?\b', 1.2))),
    'ride':   dict(motion='ride', vehicle='bike', profile=True, face='happy', place_hint='road', places=('road', 'highway', 'countryside_road', 'town_street', 'playground', 'garden'),
                   words=W((r'\b(rode|ride|rides|riding|rider|cycl\w*|pedal\w*|bike|bikes|bicycle\w*)\b', 4.0))),
    'climb':  dict(motion='climb', profile=True, away=True, rig='ladder', face='determined', words=W((r'\b(climb\w*|scal(e|ed|ing)|ladder|clamber\w*)\b', 3.4))),
    'push':   dict(motion='push', face='determined', words=W((r'\b(push\w*|shov\w*|shoved)\b', 3.0))),
    'pull':   dict(motion='pull', face='determined', words=W((r'\b(pull\w*|tug\w*|drag\w*|yank\w*|haul\w*)\b', 3.0))),
    'jump':   dict(motion='jump', face='happy', words=W((r'\b(jump\w*|leap\w*|leapt|hop\w*|bounc\w*|sprang|spring\w*|vault\w*)\b', 3.0))),
    'fall':   dict(motion='fall', face='shock', words=W((r'\b(fell|fall|falls|falling|collaps\w*|faint\w*|tripp\w*|slipp\w*|tumbl\w*|crash(ed|es)? down)\b', 3.2))),
    # ----- kitchen and table
    'cook':   dict(motion='cook', profile=True, held=[('pan', 'left'), ('spatula', 'right')], face='happy', place_hint='kitchen', places=('kitchen', 'house', 'cozy_house', 'luxury_house', 'mansion'),
                   pieces=[('furniture-kit/kitchenStove', 1.0, 0.75, 0, 180), ('furniture-kit/kitchenCabinet', 1.0, 0.75, 1.0, 180)],
                   words=W((r'\b(cook(s|ed|ing|er)?|bak(e|ed|es|ing)|bakery|baker|chef|fry\w*|fried|grill\w*|boil\w*|stir\w*|simmer\w*|roast\w*|saut\w*|recipe|kitchen|dough|batter|oven|stove|pancakes?|omelet\w*)\b', 3.4),
                           (r'\b(cookies?|cakes?|pizza|pie|soup|bread|burgers?|noodles|pasta|dinner|lunch|breakfast|feast|meal|dish|stew|sauce|cupcakes?|muffins?|donuts?|doughnuts?|waffles?|sausages?|bacon|eggs?)\b', 1.6))),
    'chop':   dict(motion='chop', profile=True, held=[('knife', 'right')], face='determined', place_hint='kitchen', places=('kitchen', 'house'),
                   pieces=[('furniture-kit/kitchenCabinet', 1.0, 0.75, 0, 180)], words=W((r'\b(chop\w*|slic\w*|dic(e|ed|ing)|carv\w*|cut(s|ting)? (up|the|a|an)|knife)\b', 3.2))),
    'eat':    dict(motion='eat', face='happy', held=[('food', 'right')], place_hint=None, words=W((r'\b(ate|eat|eats|eating|eaten|bit(e|es|ing|ten)?|swallow\w*|nibbl\w*|munch\w*|chew\w*|devour\w*|gobbl\w*|hungry|snack\w*|tast(e|ed|es|ing))\b', 3.6))),
    'drink':  dict(motion='drink', face='happy', held=[('cup', 'right')], words=W((r'\b(drank|drink|drinks|drinking|sip\w*|gulp\w*|swallow\w*|coffee|tea|juice|beer|wine|whisky|water bottle|thirsty|cocktail|milkshake|soda)\b', 3.0))),
    # ----- desk work
    'type':   dict(motion='type', seat=True, profile=True, held=[], place_hint='office_cubicles', places=('office_cubicles', 'office', 'boardroom', 'house', 'bedroom', 'school', 'cyberpunk_alley'),
                   pieces=[('furniture-kit/desk', 0.78, 0.78, 0, 180), ('furniture-kit/laptop', 0.3, 0.78, 0, 180), ('furniture-kit/chairDesk', 1.0, 0.0, 0, 0)],
                   words=W((r'\b(typ(e|ed|es|ing)|keyboard|laptop|computer|coding|coded|programm\w*|hack\w*|hacker|email\w*|software|website|online|download\w*|upload\w*|login|password|search(ed|ing)? (the )?(web|internet|online))\b', 3.2))),
    'write':  dict(motion='write', seat=True, profile=True, held=[('pen', 'right'), ('paper', 'left')], place_hint='office', places=('office_cubicles', 'office', 'boardroom', 'house', 'school', 'bedroom'),
                   pieces=[('furniture-kit/desk', 0.78, 0.78, 0, 180), ('furniture-kit/chairDesk', 1.0, 0.0, 0, 0)],
                   words=W((r'\b(wrote|write|writes|writing|written|sign(ed|ing)?|signature|note(book)?s?|diary|journal|letter|essay|draft\w*|scribbl\w*|document\w*|contract|pen|pencil|calculat\w*)\b', 3.0))),
    'read':   dict(motion='read', held=[('book', 'both')], face='neutral', words=W((r'\b(read|reads|reading|book|books|newspaper|study|studied|studying|library|page|pages|novel|textbook|scroll)\b', 2.8))),
    'phone':  dict(motion='phone', held=[('phone', 'right')], words=W((r'\b(phone\w*|call(ed|ing|s)?|dial\w*|ring(ing)?|rang|text(ed|ing)?|smartphone|mobile|hotline|voicemail|answer(ed|ing)? the)\b', 3.0))),
    'photo':  dict(motion='photo', held=[('camera', 'both')], words=W((r'\b(photograph\w*|photo|photos|camera|snapp?(ed|ing)? a|selfie|filmed|filming|paparazzi|picture of)\b', 3.0))),
    'look':   dict(motion='look', held=[('magnifier', 'right')], words=W((r'\b(inspect\w*|examin\w*|investigat\w*|magnif\w*|microscope|detective|clue|clues|evidence|scrutin\w*|studied the)\b', 3.2))),
    'count':  dict(motion='count', held=[('cash', 'both')], face='happy', words=W((r'\b(count(ed|ing|s)?|cash|banknotes?|bills?|dollars?|millions?|billions?|money|rich|wealth\w*|salary|paid|payment|profit\w*|invest\w*)\b', 1.8))),
    # ----- hands and tools
    'swing':  dict(motion='swing', held=[('hammer', 'right')], face='determined', words=W((r'\b(hammer\w*|smash\w*|struck|strike\w*|chop\w*|axe|break(s|ing)? (the|a|down)|bang\w*|pound\w*|nail\w*|built|build\w*|construct\w*|forge\w*)\b', 3.0), (r'\b(hit|hits|hitting)\b', 2.0))),
    'dig':    dict(motion='dig', held=[('shovel', 'both')], face='determined', place_hint='garden', places=('garden', 'deep_forest', 'countryside_road', 'desert_canyon', 'beach', 'war_zone'),
                   words=W((r'\b(dug|dig|digs|digging|shovel\w*|excavat\w*|bur(y|ied|ies)|grave|trench\w*|mine[sd]?|mining|miner)\b', 3.4))),
    'sweep':  dict(motion='sweep', held=[('broom', 'both')], words=W((r'\b(sweep\w*|swept|broom|clean(ed|ing|s)?|mop\w*|scrub\w*|janitor|wash(ed|ing)?|polish\w*|dust(ed|ing)?)\b', 3.0))),
    'paint':  dict(motion='paint', profile=True, held=[('brush', 'right')], face='happy', words=W((r'\b(paint\w*|brush\w*|canvas|artist|mural|draw(ing|ings|n)?|drew|sketch\w*|graffiti|spray\w*)\b', 3.0))),
    'fish':   dict(motion='fish', held=[('rod', 'both')], place_hint='beach', places=('beach', 'deep_forest', 'mountain_cliff', 'countryside_road'), words=W((r'\b(fish(ed|ing|erman|ermen)?|angler|angling|fishing rod|caught a fish|reel(ed|ing)?)\b', 3.4))),
    'throw':  dict(motion='throw', held=[('ball', 'right')], face='determined', words=W((r'\b(threw|throw\w*|hurl\w*|toss\w*|pitch\w*|launch\w*|flung|fling\w*|lob\w*|catapult\w*)\b', 3.0))),
    'kick':   dict(motion='kick', face='determined', words=W((r'\b(kick\w*|soccer|football|penalty|stomp\w*)\b', 3.0))),
    'punch':  dict(motion='punch', face='angry', words=W((r'\b(punch\w*|fight\w*|fought|brawl\w*|box(ed|ing|er)?|attack\w*|slap\w*|duel\w*|combat|wrestl\w*|assault\w*)\b', 3.2))),
    'knock':  dict(motion='knock', face='worried', pieces=[], words=W((r'\b(knock\w*|doorbell|rang the bell|tapped on)\b', 3.2))),
    'aim':    dict(motion='aim', face='determined', words=W((r'\b(fir(e|ed|es|ing)|shot|shoot\w*|aim\w*|gun\w*|rifle\w*|machine|pistol|sniper|bullets?)\b', 3.2))),
    'load':   dict(motion='load', face='determined', words=W((r'\b(load\w*|reload\w*|ammunition)\b', 3.0))),
    'carry':  dict(motion='carry', words=W((r'\b(carr(y|ied|ies|ying)|deliver\w*|lift\w*|brought|bring\w*|luggage|suitcase|parcel|package|groceries|shopping|bag|bags|box|boxes|crate\w*)\b', 2.4))),
    'pour':   dict(motion='pour', held=[('cup', 'right')], words=W((r'\b(pour\w*|spill\w*|fill(ed|ing)?|splash\w*|refill\w*)\b', 3.0))),
    'play':   dict(motion='play', held=[('guitar', 'both')], face='happy', words=W((r'\b(guitar|music\w*|musician|concert|band|song|sang|sing\w*|singer|strum\w*|play(ed|ing)? (the )?(guitar|music|piano|drums))\b', 3.0))),
    # ----- body and feelings
    'dance':  dict(motion='dance', face='happy', words=W((r'\b(danc\w*|party|partied|disco|ballet|rhythm|boogie|twerk\w*|club|festival)\b', 3.0))),
    'cheer':  dict(motion='cheer', face='happy', words=W((r'\b(won|win|wins|winner|celebrat\w*|cheer\w*|victory|triumph\w*|success\w*|hooray|record|champion\w*|trophy|prize|applaud\w*|rejoic\w*)\b', 3.0))),
    'wave':   dict(motion='wave', face='happy', words=W((r'\b(wav(e|ed|es|ing)|greet\w*|hello|goodbye|farewell|welcome\w*|hi there)\b', 3.0))),
    'clap':   dict(motion='clap', face='happy', words=W((r'\b(clap\w*|applause|ovation|bravo)\b', 3.2))),
    'bow':    dict(motion='bow', face='neutral', words=W((r'\b(bow(ed|ing|s)?|curtsy|kneel\w*|apolog\w*|beg(ged|ging)?|plead\w*)\b', 3.0))),
    'salute': dict(motion='salute', face='determined', words=W((r'\b(salut\w*|soldier saluted|anthem|honou?r(ed|ing)?|pledge)\b', 3.2))),
    'think':  dict(motion='think', face='worried', words=W((r'\b(think\w*|thought|wonder\w*|puzzl\w*|ponder\w*|idea|decid\w*|realiz\w*|realis\w*|doubt\w*|confus\w*|mystery|mysterious)\b', 1.9))),
    'shrug':  dict(motion='shrug', face='smug', words=W((r'\b(shrug\w*|who knows|no idea|clueless|whatever|did not know|didn\'?t know)\b', 3.0))),
    'cry':    dict(motion='cry', face='sad', words=W((r'\b(cri(ed|es|ing)|tears?|weep\w*|sob\w*|mourn\w*|griev\w*|heartbr\w*|sad(ly)?)\b', 3.0))),
    'laugh':  dict(motion='laugh', face='happy', words=W((r'\b(laugh\w*|giggl\w*|funny|joke\w*|hilarious|chuckl\w*|amus\w*|prank\w*)\b', 3.0))),
    'sleep':  dict(motion='sleep', profile=True, face='neutral', place_hint='bedroom', places=('bedroom', 'house', 'hospital', 'cozy_house'), pieces=[('furniture-kit/bedSingle', 0.6, -0.9, 0.0, 90)],
                   words=W((r'\b(slept|sleep\w*|asleep|nap\w*|dream\w*|bed|bedtime|snor\w*|insomnia|coma|dozed?)\b', 3.0))),
    'hug':    dict(motion='hug', face='happy', companion=True, words=W((r'\b(hug\w*|embrac\w*|reunit\w*|cuddl\w*)\b', 3.4))),
    'handshake': dict(motion='handshake', face='happy', companion=True, words=W((r'\b(shook hands|handshake|shake hands|shaking hands|deal|agreed|agreement|partner\w*|negotiat\w*|met with|introduc\w*)\b', 2.6))),
    'react':  dict(motion='react', face='shock', words=W((r'\b(destroy\w*|ruin\w*|lost|failed|fail\w*|humiliat\w*|shock\w*|surpris\w*|gasp\w*|horrif\w*|startl\w*|explod\w*|explosion|blast\w*|collapsed)\b', 2.4))),
    'panic':  dict(motion='panic', face='shock', words=W((r'\b(panic\w*|terrif\w*|chaos|screamed|scream\w*|disaster|stamped\w*|alarm\w*|emergency|evacuat\w*)\b', 2.6))),
    'point':  dict(motion='point', face='determined', words=W((r'\b(point\w*|show\w*|explain\w*|discover\w*|found|notic\w*|spott\w*|announc\w*|declar\w*|order\w*|claim\w*|reveal\w*|pointed)\b', 1.8))),
    'shout':  dict(motion='shout', face='determined', words=W((r'\b(shout\w*|yell\w*|command\w*|roar\w*|demand\w*|protest\w*|furious|angry|rage|outrag\w*)\b', 2.2))),
    'look_around': dict(motion='look_around', face='worried', words=W((r'\b(search\w*|look(ed|ing)? (around|for)|watch(ed|ing)?|waiting|waited|wait|guard(ed|ing)?|spy|spied|lookout|suspic\w*|sneak\w*|tiptoe\w*)\b', 1.8))),
    'crouch': dict(motion='crouch', face='worried', words=W((r'\b(hid|hide\w*|crouch\w*|duck(ed|ing)?|cower\w*|hiding|shelter\w*)\b', 2.8))),
    'worry':  dict(motion='worry', face='worried', words=W((r'\b(worr\w*|nervous\w*|anxious\w*|afraid|fear\w*|scared|danger\w*|trembl\w*|risk\w*)\b', 1.6))),
}

# the actions the old pipeline already knows, so a plan can always fall back to them
FALLBACK = {'look': 'point', 'count': 'carry', 'play': 'cheer'}


@dataclass
class Plan:
    activity: str
    motion: str
    score: float
    held: list = field(default_factory=list)
    pieces: list = field(default_factory=list)
    vehicle: str = ''
    rig: str = ''
    seat: bool = False
    profile: bool = False
    away: bool = False
    face: str = ''
    place_hint: str = ''
    places: tuple = ()
    companion: bool = False
    hits: list = field(default_factory=list)


def interpret(text, minimum=1.4):
    """Best activity for a line of narration, or None when the words describe nothing the body can do.
    Ranking: the highest total weight wins; a literal verb (weight >= 2.4) beats any number of noun hints; ties go to the earliest word."""
    t = (text or '').lower().replace('-', ' ')
    best = None
    for name, a in ACTIVITIES.items():
        score, first, hits = 0.0, 10 ** 6, []
        for rx, w in a['words']:
            for m in rx.finditer(t):
                score += w if not hits else w * .35   # repeated mentions count a little, not a lot
                first = min(first, m.start()); hits.append(m.group(0))
        if score < minimum: continue
        key = (round(score, 2), -first)
        if best is None or key > best[0]: best = (key, name, a, hits, score)
    if best is None: return None
    _, name, a, hits, score = best
    return Plan(activity=name, motion=a['motion'], score=score, held=list(a.get('held', [])), pieces=list(a.get('pieces', [])), vehicle=a.get('vehicle', ''), rig=a.get('rig', ''),
                seat=bool(a.get('seat')), profile=bool(a.get('profile')), away=bool(a.get('away')), face=a.get('face', ''), place_hint=a.get('place_hint') or '', places=tuple(a.get('places', ())),
                companion=bool(a.get('companion')), hits=hits)


def compatible(plan, terrain):
    """True when the scene's place already suits the activity, so the director keeps the planner's place."""
    if not plan or not plan.places: return True
    return terrain in plan.places
