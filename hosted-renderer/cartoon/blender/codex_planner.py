"""Step-6 planner: Azure gpt-5.1-codex proposes a declarative shot plan; shot_director gates it.

Usage: python3 codex_planner.py <story> [rounds]   (story = mine|rail, reads ../benchmark results)
Writes director-plans/<story>.plan.json and <story>.report.json.  Needs AZURE_OPENAI_API_KEY.
"""
import json, os, sys, urllib.request
from pathlib import Path
import shot_director as D
from object_specs import OBJECTS
from character_motion import ACTIONS, EXPRESSIONS, OUTFITS, HATS

URL = 'https://robiulalamsuleman-5258-resource.services.ai.azure.com/openai/v1/responses'
MODEL = 'gpt-5.1-codex'


def concept_menu():
    lines = ['SETS (concept set:<id>): ' + ', '.join(f'{k} [{", ".join(v)}]' for k, v in D.VOCAB['sets'].items())]
    for k, spec in D.VOCAB['objects'].items():
        lines.append(f'OBJECT obj:{k} words {spec["words"]}; actions: ' + ', '.join(f'obj:{k}:{a} {spec["actions"].get(a, [])}' for a in OBJECTS[k]['actions']))
    lines.append('CHARACTER ACTIONS (char:<a>): ' + ', '.join(f'{a} {D.VOCAB["character_actions"].get(a, [])}' for a in sorted(ACTIONS)))
    lines.append(f'LIGHTING light:<l>: {D.VOCAB["lighting"]}')
    lines.append(f'PEOPLE cast:person (any cast member on screen) {D.VOCAB["people"]}; OUTFIT outfit:<o> (a cast member wearing it) {D.VOCAB["outfits"]}')
    return '\n'.join(lines)


def prompt(story):
    sents = D.sentences(story['words'])
    listing = '\n'.join(f'{s["index"]}: ' + ' '.join(f'[{i}]{w}@{t-s["start"]:.2f}' for i, (w, t) in enumerate(zip(s['words'], s['times']))) + f'  ({s["end"]-s["start"]:.2f}s)' for s in sents)
    return f"""You direct a 9:16 3D cartoon Short. You may ONLY use the drawable vocabulary below; anything else cannot be rendered.
{concept_menu()}
Zones (distinct backdrops inside each set; a shot may set "zone"): {json.dumps({k: sorted(v) for k, v in D.ZONES.items() if k != 'open_day'})}
Story worlds: shots may only use sets named in the story ({sorted({c[4:] for s_ in D.sentences(story['words']) for c in D.lexical_concepts(s_['text']) if c.startswith('set:')})}) plus at most 2 extra sets you list in "worlds" because they genuinely fit the story's setting.
Framings: wide (set establishing shot), medium (characters), close (face of first cast member), insert (first object fills frame; use for every object action).
Cast looks: outfit {sorted(OUTFITS)}, hat {sorted(HATS)}, expression {sorted(EXPRESSIONS)}, shirt rgb 0-1.

Story sentences: [word index]word@seconds after sentence start, then total spoken duration:
{listing}

Rules:
1. Each sentence gets 1 or 2 shots, in spoken order. A second shot has start_word = index of the word where it begins; put the cut where the new thing is spoken. Each shot must last 0.5-5.0 s, and the whole film must average 1.4-3.0 s per shot.
2. mentions: list EVERY word of the sentence that names a thing, place, person or physical action (exact words copied from the sentence) with "kind": "thing"|"action"|"abstract" and its concept id. abstract = ideas, quantities, measurements, sounds, temperatures, forces, directions, time; abstract words get concept null. A thing/action with concept null means it cannot be drawn and FAILS the plan, so map things to the closest listed drawable concept whose word list or meaning genuinely depicts it (e.g. money -> obj:money_bag, rails -> obj:rail_joint or set:rail_yard). Never invent words.
3. Every mentioned concept must be visible in that sentence's shots: object actions as objects with that action, character actions as a cast member doing it, sets as the shot set, lighting as the shot lighting.
4. Change backdrop (set or zone) between consecutive shots often: the benchmark changes backdrop 14-18 times per minute (target about 16/min, allowed 12-22). Get variety by moving between zones of story worlds, never by jumping to unrelated places. Keep one consistent cast.
4b. Only put an object in a shot if the sentence speaks it (or its unique action). No decorative or unrelated props.
5. Prefer an insert framing for object actions and medium/close for people.
6. The only people concept is "cast:person" (never cast:<id>). Body parts and details of a shown action map to that action (e.g. "head" in "bangs his head" -> char:fall). Concept ids are exact strings such as "set:mine_tunnel", "obj:gold_shotgun:fire", "char:run", "light:night", "cast:person", "outfit:merchant". In shots, "set" is a bare set id (e.g. "mine_tunnel"), "lighting" one of day|sunset|night|rain, objects use bare "kind" (e.g. "gold_shotgun") and "action", cast entries use the cast "id". Never put cast ids or bare set names in mentions.concept.
7. Sounds (e.g. noises), numbers, money amounts and feelings are not mentions. Pronouns (he, it, they) are not mentions.
8. An insert shot may also include cast members; an object action can be shown in a medium shot only if its object is listed in that shot.
Return ONLY JSON (mentions items are {{"word","kind","concept"}}; shots may include "zone"): {{"worlds":[...],"cast":[{{"id","outfit","hat","shirt":[r,g,b]}}],"sentences":[{{"index","mentions":[{{"word","concept"}}],"shots":[{{"start_word"?,"set","lighting","framing","cast":[{{"id","action","expression"}}],"objects":[{{"kind","action"}}]}}]}}]}}"""


def call(text, tries=3):
    for k in range(tries):
        try: return _call(text)
        except (json.JSONDecodeError, ValueError, TimeoutError, OSError) as e: print('bad or slow reply, retrying', type(e).__name__, flush=True)
    raise RuntimeError('model never returned valid JSON')


def _call(text):
    body = json.dumps({'model': MODEL, 'input': text, 'reasoning': {'effort': 'medium'}, 'text': {'format': {'type': 'json_object'}}}).encode()
    req = urllib.request.Request(URL, body, {'api-key': os.environ['AZURE_OPENAI_API_KEY'], 'content-type': 'application/json'})
    r = json.load(urllib.request.urlopen(req, timeout=900))
    out = ''.join(c.get('text', '') for o in r.get('output', []) if o.get('type') == 'message' for c in o.get('content', []))
    out = out.strip().removeprefix('```json').removesuffix('```').strip()
    return json.loads(out[out.index('{'):out.rindex('}') + 1])


READER = 'https://robiulalamsuleman-5258-resource.services.ai.azure.com/openai/deployments/gpt-5/chat/completions?api-version=2025-04-01-preview'


def concrete_words(story, cache):
    if cache.exists(): return {int(k): v for k, v in json.loads(cache.read_text()).items()}
    sents = D.sentences(story['words'])
    q = ('For each numbered sentence, list the words (copied exactly) that name a concrete physical object, place, person or a visible physical action a '
         'viewer could see on screen. Exclude pronouns, numbers, measurements, sounds, temperatures, ideas and abstract verbs. '
         'Reply JSON {"sentences":{"<index>":["word",...]}}\n' + '\n'.join(f'{s["index"]}: {s["text"]}' for s in sents))
    body = json.dumps({'messages': [{'role': 'user', 'content': q}], 'response_format': {'type': 'json_object'}}).encode()
    r = json.load(urllib.request.urlopen(urllib.request.Request(READER, body, {'api-key': os.environ['AZURE_OPENAI_API_KEY'], 'content-type': 'application/json'}), timeout=600))
    out = {int(k): [w for w in v if D.has_phrase(D.norm(sents[int(k)]['text']), w)] for k, v in json.loads(r['choices'][0]['message']['content'])['sentences'].items()}
    cache.write_text(json.dumps(out, indent=1)); return out


def main():
    name = sys.argv[1]; rounds = int(sys.argv[2]) if len(sys.argv) > 2 else 4
    raw = json.load(open(Path(__file__).parent.parent / 'benchmark' / 'results' / f'{name}.shots.json'))
    # Step-1 OCR anchors are coarse (e.g. a 6-word sentence spanning 16 s), so benchmark tests use
    # syllable-estimated times over the measured video length; production passes aligned times.
    story = {'words': D.estimated_timing(raw['words'], raw['shots'][-1]['end']), 'timing': 'syllable-estimated'}
    out = Path(__file__).parent / 'director-plans'; out.mkdir(exist_ok=True)
    concrete = concrete_words(story, out / f'{name}.concrete.json')
    base = prompt(story); text = base; history = []
    for r in range(rounds):
        plan = call(text); errs, rep = D.validate_plan(plan, story, concrete)
        history.append({'round': r + 1, 'errors': errs, 'coverage': rep.get('coverage'), 'set_changes_per_min': rep.get('set_changes_per_min')})
        print(f'{name} round {r+1}: {len(errs)} errors, coverage {rep.get("coverage")}, sets/min {rep.get("set_changes_per_min")}', flush=True)
        json.dump({'plan': plan, 'errors': errs, 'report': rep}, open(out / f'{name}.round{r+1}.json', 'w'), indent=1)
        if not errs: break
        text = base + '\n\nYour previous plan:\n' + json.dumps(plan) + '\n\nThe validator rejected it. Fix ALL of these and return the full corrected JSON:\n' + '\n'.join(errs)
    json.dump(plan, open(out / f'{name}.plan.json', 'w'), indent=1)
    json.dump({'story': name, 'timing': story['timing'], 'model': MODEL, 'accepted': not errs, 'errors': errs, 'report': rep, 'rounds': history}, open(out / f'{name}.report.json', 'w'), indent=1)
    sys.exit(0 if not errs else 2)


if __name__ == '__main__':
    main()
