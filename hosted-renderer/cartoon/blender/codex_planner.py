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
    listing = '\n'.join(f'{s["index"]}: ' + ' '.join(f'[{i}]{w}' for i, w in enumerate(s['words'])) + f'  ({s["end"]-s["start"]:.2f}s)' for s in sents)
    return f"""You direct a 9:16 3D cartoon Short. You may ONLY use the drawable vocabulary below; anything else cannot be rendered.
{concept_menu()}
Framings: wide (set establishing shot), medium (characters), close (face of first cast member), insert (first object fills frame; use for every object action).
Cast looks: outfit {sorted(OUTFITS)}, hat {sorted(HATS)}, expression {sorted(EXPRESSIONS)}, shirt rgb 0-1.

Story sentences with word indexes and spoken duration:
{listing}

Rules:
1. Each sentence gets 1 or 2 shots, in spoken order. A second shot has start_word = index of the word where it begins; put the cut where the new thing is spoken. Each shot must last 0.5-5.0 s, and the whole film must average 1.4-3.0 s per shot.
2. mentions: list EVERY concrete thing and physical action spoken in the sentence (exact words copied from the sentence) with its concept id, or concept null if nothing in the vocabulary depicts it. Never invent words. Abstract ideas (numbers, reasons, temperatures as ideas) are not mentions unless a listed word form covers them.
3. Every mentioned concept must be visible in that sentence's shots: object actions as objects with that action, character actions as a cast member doing it, sets as the shot set, lighting as the shot lighting.
4. Change set between consecutive shots often: the benchmark changes set 14-18 times per minute (target about 16/min); choose the set that best fits the words, keep one consistent cast.
5. Prefer an insert framing for object actions and medium/close for people.
6. Concept ids are exact strings such as "set:mine_tunnel", "obj:gold_shotgun:fire", "char:run", "light:night", "cast:person", "outfit:merchant". In shots, "set" is a bare set id (e.g. "mine_tunnel"), "lighting" one of day|sunset|night|rain, objects use bare "kind" (e.g. "gold_shotgun") and "action", cast entries use the cast "id". Never put cast ids or bare set names in mentions.concept.
7. Sounds (e.g. noises), numbers, money amounts and feelings are not mentions. Pronouns (he, it, they) are not mentions.
8. An insert shot may also include cast members; an object action can be shown in a medium shot only if its object is listed in that shot.
Return ONLY JSON: {{"cast":[{{"id","outfit","hat","shirt":[r,g,b]}}],"sentences":[{{"index","mentions":[{{"word","concept"}}],"shots":[{{"start_word"?,"set","lighting","framing","cast":[{{"id","action","expression"}}],"objects":[{{"kind","action"}}]}}]}}]}}"""


def call(text, tries=3):
    for k in range(tries):
        try: return _call(text)
        except (json.JSONDecodeError, ValueError) as e: print('unparseable reply, retrying', e, flush=True)
    raise RuntimeError('model never returned valid JSON')


def _call(text):
    body = json.dumps({'model': MODEL, 'input': text, 'reasoning': {'effort': 'medium'}, 'text': {'format': {'type': 'json_object'}}}).encode()
    req = urllib.request.Request(URL, body, {'api-key': os.environ['AZURE_OPENAI_API_KEY'], 'content-type': 'application/json'})
    r = json.load(urllib.request.urlopen(req, timeout=600))
    out = ''.join(c.get('text', '') for o in r.get('output', []) if o.get('type') == 'message' for c in o.get('content', []))
    out = out.strip().removeprefix('```json').removesuffix('```').strip()
    return json.loads(out[out.index('{'):out.rindex('}') + 1])


def main():
    name = sys.argv[1]; rounds = int(sys.argv[2]) if len(sys.argv) > 2 else 4
    story = json.load(open(Path(__file__).parent.parent / 'benchmark' / 'results' / f'{name}.shots.json'))
    out = Path(__file__).parent / 'director-plans'; out.mkdir(exist_ok=True)
    base = prompt(story); text = base; history = []
    for r in range(rounds):
        plan = call(text); errs, rep = D.validate_plan(plan, story)
        history.append({'round': r + 1, 'errors': errs, 'coverage': rep.get('coverage'), 'set_changes_per_min': rep.get('set_changes_per_min')})
        print(f'{name} round {r+1}: {len(errs)} errors, coverage {rep.get("coverage")}, sets/min {rep.get("set_changes_per_min")}', flush=True)
        json.dump({'plan': plan, 'errors': errs, 'report': rep}, open(out / f'{name}.round{r+1}.json', 'w'), indent=1)
        if not errs: break
        text = base + '\n\nYour previous plan:\n' + json.dumps(plan) + '\n\nThe validator rejected it. Fix ALL of these and return the full corrected JSON:\n' + '\n'.join(errs)
    json.dump(plan, open(out / f'{name}.plan.json', 'w'), indent=1)
    json.dump({'story': name, 'model': MODEL, 'accepted': not errs, 'errors': errs, 'report': rep, 'rounds': history}, open(out / f'{name}.report.json', 'w'), indent=1)
    sys.exit(0 if not errs else 2)


if __name__ == '__main__':
    main()
