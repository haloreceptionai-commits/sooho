"""What is the character DOING? Reads the words of a line and decides a concrete activity: the body motion, the items in the hands,
the furniture or vehicle it needs, and the place it belongs in. Pure data and regexes (no Blender), so it is fast to test.

    interpret("She was baking cookies for the party")  ->  Plan(activity='cook', held=[('pan','left'),('spatula','right')], pieces=[stove...])

Rules the director relies on:
  * every activity has weighted word patterns; the best score wins. A literal verb ("drove", "typed") is weighted 2.6-4; a noun that only hints
    at the activity ("cookie", "laptop") is 1.6-2.2; ambiguous words ("note", "wave", "pitch", "single", "fish" as a noun) are written so they only
    match in the sense that means a body action, or are weighted below MINIMUM so they never decide alone;
  * a food noun alone ("cookie", "pizza") hints at cooking, but an eating verb ("ate", "bite") wins over it;
  * a vehicle noun with a travel verb ("drove", "rode a bike") means the character is IN the vehicle and it moves;
  * explainer narration about physics, sound or money ("the pea wobbles the pitch of the note") matches nothing, so the old gentle gestures apply;
  * an activity never needs a prop that is not in the offline library: every model id here is checked by test_activities.py.
"""
import re
from dataclasses import dataclass, field

MINIMUM = 1.6


def W(*pairs):
    return [(re.compile(p, re.I), w) for p, w in pairs]


# held: (prop, hand)      pieces: (library model, height m, forward m, right m, yaw offset deg)  placed relative to the character, forward = the way it faces
# profile: turn the character side-on to the camera so it can be seen working on the thing in front of it;  away: face away (climbing)
# places: recipe/kit names where this reads naturally; place_hint is the recipe to switch to when the scene is somewhere else
ACTIVITIES = {
    # ----- travelling
    'run':    dict(motion='run', face='shock', words=W((r'\b(ran|run|runs|running|raced?|racing|sprint\w*|fled|flee\w*|fleeing|charg(e|ed|es|ing)|stampede\w*|chased?|chasing|escap(e|ed|es|ing)|bolted|rush(ed|es|ing)|dash(ed|es|ing))\b', 3.2))),
    'walk':   dict(motion='walk', words=W((r'\b(walk(s|ed|ing)?|march(ed|es|ing)?|strol\w*|wander\w*|approach(ed|es|ing)?|arriv(e|ed|es|ing)|went to|heads? (to|for|toward\w*|home|out)|heading (to|for|toward\w*|home|out)|returned|crossed|journey(ed|s)?)\b', 2.6))),
    'drive':  dict(motion='drive', vehicle='car', profile=True, face='determined', place_hint='highway', places=('road', 'highway', 'countryside_road', 'town_street', 'lowpoly_city', 'street'),
                   words=W((r'\b(drove|drive|drives|driving|driven|drivers?|steer(ed|ing)?|motorist|behind the wheel|car chase|got in(to)? (the |a |his |her )?car|speed(ed|ing) (down|along|through))\b', 4.0), (r'\b(cars?|taxi|truck|van|suv|automobile)\b', 1.2))),
    'ride':   dict(motion='ride', vehicle='bike', profile=True, face='happy', place_hint='road', places=('road', 'highway', 'countryside_road', 'town_street', 'playground', 'garden'),
                   words=W((r'\b(rode|ride|rides|riding|riders?|cycl(e|ed|ing|ist|ists)|pedal(ed|ing|led|ling)|bicycles?)\b', 4.0), (r'\bbikes?\b', 1.4))),
    'climb':  dict(motion='climb', profile=True, away=True, rig='ladder', face='determined', words=W((r'\b(climb(s|ed|ing)?|scal(ed|ing) (the|a)|ladders?|clamber\w*)\b', 3.4))),
    'push':   dict(motion='push', face='determined', words=W((r'\b(push(ed|es|ing)?|shov(e|ed|es|ing))\b', 3.0))),
    'pull':   dict(motion='pull', face='determined', words=W((r'\b(pull(ed|ing)|pulls (the|a|on)|tugg?(ed|ing)|yank(ed|ing)|hauled|hauling|dragg?(ed|ing))\b', 3.0))),
    'jump':   dict(motion='jump', face='happy', words=W((r'\b(jump(s|ed|ing)?|leap(s|ed|ing|t)?|hop(s|ped|ping)|sprang|vault(ed|ing))\b', 3.0), (r'\bbounc(e|ed|es|ing)\b', 2.0))),
    'fall':   dict(motion='fall', face='shock', words=W((r'\b(fell|falls? (down|over|off)|falling (down|over|off)|collaps(e|ed|es|ing)|faint(ed|ing)|tripp(ed|ing)|slipp(ed|ing)|tumbl(e|ed|ing)|crash(ed|es)? down)\b', 3.2))),
    # ----- kitchen and table
    'cook':   dict(motion='cook', profile=True, held=[('pan', 'left'), ('spatula', 'right')], face='happy', place_hint='kitchen', places=('kitchen', 'house', 'cozy_house', 'luxury_house', 'mansion'),
                   pieces=[('furniture-kit/kitchenStove', 1.0, 0.75, 0, 180), ('furniture-kit/kitchenCabinet', 1.0, 0.75, 1.0, 180)],
                   words=W((r'\b(cook(s|ed|ing|er)?|bak(e|ed|es|ing)|bakery|baker|chef|fry(ing)?|fried|grill(ed|ing)?|simmer\w*|saut\w*|recipes?|kitchen|dough|batter|oven|stove|pancakes?|omelet\w*)\b', 3.4),
                           (r'\b(stir(red|ring|s)?|boil(ed|ing|s)?|roast(ed|ing)?)\b', 1.3),
                           (r'\b(cookies?|cakes?|pizzas?|pies?|soup|bread|burgers?|noodles|pasta|dinner|lunch|breakfast|feast|meals?|dish|dishes|stew|sauce|cupcakes?|muffins?|donuts?|doughnuts?|waffles?|sausages?|bacon|eggs?)\b', 1.7))),
    'chop':   dict(motion='chop', profile=True, held=[('knife', 'right')], face='determined', place_hint='kitchen', places=('kitchen', 'house'),
                   pieces=[('furniture-kit/kitchenCabinet', 1.0, 0.75, 0, 180)], words=W((r'\b(chop(ped|ping|s)? (the|up|an?|some)|slic(e|ed|es|ing) (the|up|an?|some)|dic(e|ed|ing) (the|up|an?|some)|carv(e|ed|ing) (the|an?)|knife)\b', 3.2))),
    'eat':    dict(motion='eat', face='happy', held=[('food', 'right')], words=W((r'\b(ate|eat|eats|eating|eaten|bite|bites|biting|bitten|took a bite|swallow(ed|ing)? (the|a|some)|nibbl\w*|munch\w*|chew(ed|ing)?|devour\w*|gobbl\w*|hungry|snack(ed|ing)?|tast(ed|ing))\b', 3.6))),
    'drink':  dict(motion='drink', face='happy', held=[('cup', 'right')], words=W((r'\b(drank|drink|drinks|drinking|sip(s|ped|ping)?|gulp\w*|thirsty|cocktails?|milkshakes?)\b', 3.0), (r'\b(coffee|tea|juice|beer|wine|whisky|soda)\b', 1.7))),
    # ----- desk work
    'type':   dict(motion='type', seat=True, profile=True, held=[], place_hint='office_cubicles', places=('office_cubicles', 'office', 'boardroom', 'house', 'bedroom', 'school', 'cyberpunk_alley'),
                   pieces=[('furniture-kit/desk', 0.78, 0.78, 0, 180), ('furniture-kit/laptop', 0.3, 0.78, 0, 180), ('furniture-kit/chairDesk', 1.0, 0.0, 0, 0)],
                   words=W((r'\b(typed|typing|types (a|the|on|in)|keyboards?|laptops?|computers?|coding|coded|programm(er|ers|ing)|hack(ed|ing|er|ers)|emailed|e-?mail)\b', 3.0), (r'\b(software|website|online|download(ed|ing)?|upload(ed|ing)?|login|password)\b', 1.7))),
    'write':  dict(motion='write', seat=True, profile=True, held=[('pen', 'right'), ('paper', 'left')], place_hint='office', places=('office_cubicles', 'office', 'boardroom', 'house', 'school', 'bedroom'),
                   pieces=[('furniture-kit/desk', 0.78, 0.78, 0, 180), ('furniture-kit/chairDesk', 1.0, 0.0, 0, 0)],
                   words=W((r'\b(wrote|write|writes|writing|written|signed|signing|signature|notebooks?|diary|journal|letters?|essays?|scribbl\w*|contracts?|pencils?|calculat(ed|ing))\b', 3.0))),
    'read':   dict(motion='read', held=[('book', 'both')], face='neutral', words=W((r'\b(read|reads|reading|books?|newspapers?|novels?|textbooks?|studying|studied)\b', 2.8), (r'\b(library|pages?|scroll)\b', 1.4))),
    'phone':  dict(motion='phone', held=[('phone', 'right')], words=W((r'\b(phoned|phoning|phones|telephone\w*|smartphones?|dial(ed|ing)|texted|texting|hotline|voicemail|cell ?phone|mobile phone|on the phone|called (him|her|them|me|his|her|the police|police|home))\b', 3.0))),
    'photo':  dict(motion='photo', held=[('camera', 'both')], words=W((r'\b(photograph(ed|ing|er|s)?|photos?|cameras?|selfies?|filmed|filming|paparazzi|snapped a)\b', 2.8))),
    'look':   dict(motion='look', held=[('magnifier', 'right')], words=W((r'\b(inspect(ed|ing|s)?|examin(e|ed|es|ing)|investigat(e|ed|es|ing)|magnif\w*|microscopes?|detectives?|clues?|scrutin\w*)\b', 3.2), (r'\bevidence\b', 1.7))),
    'count':  dict(motion='count', held=[('cash', 'both')], face='happy', words=W((r'\b(count(ed|ing)? (the|his|her|their|all|every|out|up|money|cash)|cash|banknotes?)\b', 2.6), (r'\b(dollars?|millions?|billions?|money|rich|wealth\w*|salary|paid|payment|profit\w*|invest\w*)\b', 1.4))),
    # ----- hands and tools
    'swing':  dict(motion='swing', held=[('hammer', 'right')], face='determined', words=W((r'\b(hammer(ed|ing|s)?|smash(ed|es|ing)?|axes?|chop(ped|ping)? (down|wood|the tree)|nail(ed|ing)|pound(ed|ing)|forge[sd]?|forging)\b', 3.0), (r'\b(built|build(s|ing)?|construct(ed|ing|s)?|struck|strikes?|striking|hit|hits|hitting|bang(ed|ing|s)?)\b', 1.4))),
    'dig':    dict(motion='dig', held=[('shovel', 'both')], face='determined', place_hint='garden', places=('garden', 'deep_forest', 'countryside_road', 'desert_canyon', 'beach', 'war_zone'),
                   words=W((r'\b(dug|dig|digs|digging|shovel\w*|excavat\w*|buried|burying|trench(es)?|miners?|mining|mined)\b', 3.4))),
    'sweep':  dict(motion='sweep', held=[('broom', 'both')], words=W((r'\b(sweep(s|ing)?|swept|brooms?|mop(s|ped|ping)?|scrub(bed|bing|s)?|janitor)\b', 3.0), (r'\b(clean(ed|ing)? (the|up|his|her)|wash(ed|ing)? (the|his|her|dishes)|polish(ed|ing)?|dust(ed|ing)? (the|off))\b', 2.0))),
    'paint':  dict(motion='paint', profile=True, held=[('brush', 'right')], face='happy', words=W((r'\b(paint(s|ed|ing|er|ers)?|brush(ed|ing)? (the|a|on)|canvas|murals?|sketch(ed|ing|es)?|graffiti)\b', 3.0), (r'\b(artists?|drew|drawing (a|the))\b', 2.0))),
    'fish':   dict(motion='fish', held=[('rod', 'both')], place_hint='beach', places=('beach', 'deep_forest', 'mountain_cliff', 'countryside_road'), words=W((r'\b(fishing|fished|fisherman|fishermen|anglers?|angling|reeled in)\b', 3.4))),
    'throw':  dict(motion='throw', held=[('ball', 'right')], face='determined', words=W((r'\b(threw|throw(s|ing|n)?|hurl(ed|ing|s)?|toss(ed|ing|es)?|pitch(ed|er) (a|the)|flung|fling(s|ing)?|lob(bed|bing|s)?|catapult(ed|ing|s)?)\b', 3.0))),
    'kick':   dict(motion='kick', face='determined', words=W((r'\b(kick(s|ed|ing)?|soccer|football|stomp(ed|ing|s)?)\b', 3.0))),
    'punch':  dict(motion='punch', face='angry', words=W((r'\b(punch(es|ed|ing)?|fight(s|ing)?|fought|brawl\w*|boxing|boxers?|slapp?(ed|ing|s)?|duel(s|ed|ing)?|wrestl\w*)\b', 3.2), (r'\b(attack(ed|ing|s)?|combat|assault\w*)\b', 1.8))),
    'knock':  dict(motion='knock', face='worried', pieces=[], words=W((r'\b(knock(s|ed|ing)? (on|at)|knocked|doorbell|rang the bell|tapped on)\b', 3.2))),
    'aim':    dict(motion='aim', face='determined', words=W((r'\b(fir(e|ed|es|ing) (a|the|his|her|their|at)|shot (at|the|a|him|her)|shoot(s|ing)?|aim(ed|ing|s)?|guns?|rifles?|pistols?|snipers?|bullets?)\b', 3.2))),
    'load':   dict(motion='load', face='determined', words=W((r'\b(load(ed|ing)? (the|a|his|her)|reload(ed|ing)?|ammunition)\b', 3.0))),
    'carry':  dict(motion='carry', words=W((r'\b(carr(y|ied|ies|ying)|deliver(ed|ing|s|y)?|brought|luggage|suitcases?|parcels?|packages?|groceries|crates?)\b', 2.4), (r'\b(lift(ed|ing|s)?|bag|bags|box|boxes|bring(s|ing)?|shopping)\b', 1.5))),
    'pour':   dict(motion='pour', held=[('cup', 'right')], words=W((r'\b(pour(ed|ing|s)?|spill(ed|ing|s)?|splash(ed|ing|es)?|refill(ed|ing)?)\b', 2.8), (r'\bfill(ed|ing)? (the|a|his|her)\b', 1.8))),
    'play':   dict(motion='play', held=[('guitar', 'both')], face='happy', words=W((r'\b(guitars?|musicians?|concerts?|bands?|songs?|sang|sing|sings|singing|singers?|strum\w*|played (the )?(guitar|music|piano|drums))\b', 3.0))),
    # ----- body and feelings
    'dance':  dict(motion='dance', face='happy', words=W((r'\b(danc(e|ed|es|ing|er|ers)|disco|ballet|boogie|twerk\w*)\b', 3.0), (r'\b(party|parties|partied|nightclub|festivals?)\b', 1.7))),
    'cheer':  dict(motion='cheer', face='happy', words=W((r'\b(won|wins|winners?|celebrat(e|ed|es|ing|ion)|cheer(s|ed|ing)?|victory|triumph\w*|hooray|champions?|championships?|trophy|applaud\w*|rejoic\w*)\b', 3.0), (r'\b(prize|success(ful|fully)?)\b', 1.7))),
    'wave':   dict(motion='wave', face='happy', words=W((r'\b(waved|waving|waves (hello|goodbye|at|to|his|her)|wave (hello|goodbye|at|to)|greet(ed|ing|s)?|hello|goodbye|farewell|hi there)\b', 3.0))),
    'clap':   dict(motion='clap', face='happy', words=W((r'\b(clap(s|ped|ping)?|applause|ovation|bravo)\b', 3.2))),
    'bow':    dict(motion='bow', face='neutral', words=W((r'\b(bowed|bowing|bows (to|down)|bow (to|down)|curtsy|kneel(s|ed|ing)?|apolog(y|ies|ised|ized|ise|ize)|begg?(ed|ing)|plead(ed|ing|s)?)\b', 3.0))),
    'salute': dict(motion='salute', face='determined', words=W((r'\b(salut(e|ed|es|ing))\b', 3.2))),
    'think':  dict(motion='think', face='worried', words=W((r'\b(thinking|pondered|pondering|wondered|wondering|puzzled|puzzling|thought about|thought of|decided|realized|realised)\b', 2.4), (r'\b(idea|doubts?|confus(ed|ing)|mystery|mysterious)\b', 1.2))),
    'shrug':  dict(motion='shrug', face='smug', words=W((r'\b(shrug(s|ged|ging)?|who knows|no idea|clueless|did not know|didn\'?t know)\b', 3.0))),
    'cry':    dict(motion='cry', face='sad', words=W((r'\b(cried|cries|crying|in tears|tears|wept|weeping|sobb?(ed|ing)?|mourn(ed|ing|s)?|griev(e|ed|ing)|heartbroken)\b', 3.0), (r'\bsad(ly)?\b', 1.5))),
    'laugh':  dict(motion='laugh', face='happy', words=W((r'\b(laugh(s|ed|ing|ter)?|giggl\w*|funny|jokes?|joked|hilarious|chuckl\w*|amused|prank(s|ed|ing)?)\b', 3.0))),
    'sleep':  dict(motion='sleep', profile=True, face='neutral', place_hint='bedroom', places=('bedroom', 'house', 'hospital', 'cozy_house'), pieces=[('furniture-kit/bedSingle', 0.6, -0.9, 0.0, 90)],
                   words=W((r'\b(slept|sleep(s|ing|y)?|asleep|naps?|napped|dream(ed|t|ing|s)?|bedtime|snor(e|ed|ing)|insomnia|dozed?)\b', 3.0), (r'\b(in|to|on|into) (his|her|their|a|the|my) bed\b|\bto bed\b', 1.7))),
    'hug':    dict(motion='hug', face='happy', companion=True, words=W((r'\b(hug(s|ged|ging)?|embrac(e|ed|es|ing)|reunit(e|ed|ing)|cuddl\w*)\b', 3.4))),
    'handshake': dict(motion='handshake', face='happy', companion=True, words=W((r'\b(shook hands|handshakes?|shake hands|shaking hands)\b', 3.4), (r'\b(deal|agreed|agreement|partners?|negotiat\w*|introduc(ed|ing|es))\b', 1.4))),
    'react':  dict(motion='react', face='shock', words=W((r'\b(destroy(ed|ing|s)?|ruin(ed|ing|s)?|lost|failed|fails?|humiliat\w*|shock(ed|ing)?|surpris(ed|ing|e)|gasp(ed|ing)?|horrif\w*|startl\w*|explod(ed|es|ing)|explosions?|blasts?)\b', 2.4))),
    'panic':  dict(motion='panic', face='shock', words=W((r'\b(panic\w*|terrif\w*|screamed|screaming|screams?|stampede[sd]?)\b', 2.8), (r'\b(chaos|alarm(ed|s)?|emergency|evacuat\w*|disaster)\b', 1.7))),
    'shout':  dict(motion='shout', face='determined', words=W((r'\b(shout(s|ed|ing)?|yell(s|ed|ing)?|roar(s|ed|ing)?|protest(s|ed|ing)?|furious|outrag\w*)\b', 2.4), (r'\b(command(ed|ing)?|demand(ed|ing|s)?|angry|rage)\b', 1.4))),
    'look_around': dict(motion='look_around', face='worried', words=W((r'\b(search(ed|ing|es)? (for|the|around)|look(ed|ing)? (around|for)|spy|spied|spying|lookout|sneak(ed|ing|s)?|tiptoe\w*|on guard|stood guard)\b', 2.2), (r'\b(watch(ed|ing)|waiting|waited|suspic\w*)\b', 1.3))),
    'crouch': dict(motion='crouch', face='worried', words=W((r'\b(hid|hide|hides|hiding|crouch\w*|duck(ed|ing)? (down|behind)|cower\w*)\b', 2.8))),
    'worry':  dict(motion='worry', face='worried', words=W((r'\b(worr(y|ied|ies|ying)|nervous\w*|anxious\w*|afraid|scared)\b', 2.2), (r'\b(fear\w*|danger\w*|trembl\w*|risk(y|ed|s)?)\b', 1.3))),
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


def interpret(text, minimum=MINIMUM):
    """Best activity for a line of narration, or None when the words describe nothing the body can do.
    Ranking: the highest total weight wins; a literal verb (weight >= 2.4) beats any number of noun hints; ties go to the earliest word."""
    t = (text or '').lower().replace('-', ' ').replace('‑', ' ')
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
                seat=bool(a.get('seat')), profile=bool(a.get('profile')), away=bool(a.get('away')), face=a.get('face', ''), place_hint=a.get('place_hint') or '',
                places=tuple(a.get('places', ())), companion=bool(a.get('companion')), hits=hits)


def compatible(plan, terrain):
    """True when the scene's place already suits the activity, so the director keeps the planner's place."""
    if not plan or not plan.places: return True
    return terrain in plan.places
