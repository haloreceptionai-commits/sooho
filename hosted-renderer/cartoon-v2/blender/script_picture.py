"""Isolated step-9 authoring and blind acceptance; never changes live generation.

Evidence is supplied by the caller, not invented by the author. The writer is restricted
to the renderer's real vocabulary. Independent judges decide factual support, readability
and benchmark parity; a model's self-score is never an acceptance signal.
"""
import json
import os
import random
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import shot_director as D

GOLD_1 = ('A gift with no battery spied on America for seven years. Soviet schoolchildren give the U.S. ambassador in Moscow a carved wooden seal. '
          'He hangs it right behind his desk. Security sweeps the room. No wires. No battery. Nothing. Yet for seven years, the Soviets hear every private word. '
          'How? Inside the seal is a hollow chamber with a thin metal membrane. The signal itself was the power. America had hung the spy on its own wall.')
GOLD_2 = ('Hannibal was trapped, so he strapped fire to two thousand oxen. Rome has his army cornered in a valley. Rome just has to wait. '
          'So Hannibal comes up with a plan that sounds completely insane. That\'s exactly what he wanted. '
          'Hannibal didn\'t win with strength. He won by making the enemy look the wrong way.')
STOP = set('the a an and or but so of to in on at for with by from his her its their was were is are be been that this it he she they them had has have as into up out not no'.split())
LOOP = re.compile(r"\?[\"']?$|\b(yet|but|then|until|insane|impossible|nothing|nobody|secret|strange|wrong|instead)\b|n't\b", re.I)


def keys(t):
    return {w for w in re.sub(r"[^a-z0-9' ]", ' ', t.lower()).split() if len(w) > 2 and w not in STOP}


def shape_errors(texts):
    errors = []
    hook = texts[0] if texts else ''
    if not 8 <= len(hook.split()) <= 12: errors.append('shape: hook must be 8-12 words')
    if hook.rstrip().endswith('?'): errors.append('shape: hook must be a statement, not a question')
    if re.search(r'\b(because|which is why|so that|the reason)\b', hook, re.I): errors.append('shape: hook gives the reason away')
    for i, t in enumerate(texts):
        if re.search(r'^like\b|\b(is|was|just|it\'s) like\b|\b(we|us|our)\b', t, re.I): errors.append(f's{i}: no like-comparisons or we/us narrator')
        for j in range(i):
            a, b = keys(t), keys(texts[j])
            if len(a) >= 3 and len(a & b) / len(a) >= 0.7 and len(b) and len(a & b) / len(b) >= 0.7:
                errors.append(f's{i}: repeats s{j}')
    gap = 0
    for t in texts[1:max(2, int(len(texts) * 0.75))]:
        gap = 0 if LOOP.search(t) else gap + 1
        if gap > 4: errors.append('shape: more than 4 sentences without a loop line'); break
    if not any(len(t.split()) <= 8 for t in texts[int(len(texts) * 0.6):]): errors.append('shape: no short payoff sentence near the end')
    if texts and not (keys(' '.join(texts[-2:])) & keys(hook)): errors.append('shape: last two sentences must echo the hook')
    return errors

from codex_planner import concept_menu, READER


def azure_json(prompt):
    body = json.dumps({'messages': [{'role': 'user', 'content': prompt}],
                       'response_format': {'type': 'json_object'}}).encode()
    request = urllib.request.Request(READER, body, {
        'api-key': os.environ['AZURE_OPENAI_API_KEY'], 'content-type': 'application/json'})
    # An ambiguous paid request is not automatically replayed.
    with urllib.request.urlopen(request, timeout=540) as response:
        result = json.load(response)
    return json.loads(result['choices'][0]['message']['content'])


def text_of(draft):
    return ' '.join(s['text'] for s in draft['sentences'])


def check(draft, evidence):
    errors = []
    if not isinstance(draft, dict) or not isinstance(draft.get('sentences'), list):
        return ['sentences required']
    facts = {f['id'] for f in evidence['facts']}
    if not 16 <= len(draft['sentences']) <= 28:
        errors.append('need 16-28 connected picture sentences')
    for i, sentence in enumerate(draft['sentences']):
        text = sentence.get('text', '')
        if not text.strip() or text[-1:] not in '.?!':
            errors.append(f's{i}: sentence needs spoken punctuation')
        if any(mark in text for mark in '{}<>'):
            errors.append(f's{i}: narration must be plain text')
        refs = sentence.get('fact_ids', [])
        if not refs or any(ref not in facts for ref in refs):
            errors.append(f's{i}: missing or invented evidence id')
        picture = sentence.get('picture', [])
        if not picture or any(not isinstance(c, str) or not D.concept_valid(c) for c in picture):
            errors.append(f's{i}: picture needs existing drawable concepts')
    errors += shape_errors([x.get('text', '') for x in draft['sentences']])
    count = len(text_of(draft).split())
    if not 185 <= count <= 215:
        errors.append(f'{count} words outside 185-215 test budget (duration still must be measured)')
    return errors


def author_prompt(evidence):
    return f"""Write an ORIGINAL factual 60-second 3D Short, not a copy of a benchmark.
The voice is compact Puck sample 03. Aim 185-215 words, 16-28 connected sentences.
EVERY sentence must show a clear concrete picture. First THREE words must contain
the literal subject and an observable action: e.g. 'Steel rails grow' or 'Miners shoot gold'.
Everyday English an eight-year-old understands. Connected cause and effect, concrete events
not a lecture. OWNER GOLD SHAPE (copy the shape and rhythm, never the content):
1. Hook 8-12 words: a CONTRADICTION stated as a fact (never a question) that hides the reason.
2. Present-tense setup in short stacked lines; each line carries a surprise, danger or new fact.
3. An open loop at least every 3-4 sentences: a lone 'How?', 'But...', 'Yet...', 'Then...' or a reversal.
4. The reveal step by step, one visible action per sentence.
5. A payoff sentence of 8 words or fewer that makes the viewer feel the twist.
6. The last sentence echoes two or three hook words in a NEW sentence; never repeat any line.
No greetings, 'Imagine', 'Did you know', invented dialogue, invented people, rivals or conspiracies,
no 'like...' comparisons, no metaphors, no we/us narrator. Dates and figures only when evidence gives them.
GOLD 1: {GOLD_1}
GOLD 2: {GOLD_2}
Historically illustrated actions are general demonstrations, never invented specific events.
Do not say an entire army was stopped or not one arrow missed unless evidence says so.
Do not invent real gold behind a salted wall. Do not imply all modern rails have gaps.
No analogy using an object absent from the renderer. Avoid unsupported adjectives.
Only physical nouns/actions accurately drawn by these existing concepts:
{concept_menu()}
For hardware details not represented (such as continuous rail welding), omit the demonstration
or state the limitation using the existing rail view; never call a gapless rail a different object.
The launch cart's engine-owned hole count is 82: do NOT narrate another exact count.
Use mine_tunnel, office, street only for a mine demonstration; rail_yard/workshop for rails;
castle/battlefield for Korean rocket carts. No unrelated location for variety.
Each claim must cite supplied fact ids. Citations are separate, NEVER spoken.
SOURCE EVIDENCE (only these claims are allowed): {json.dumps(evidence)}
Return JSON {{"title":str,"sentences":[{{"text":str,"fact_ids":[id],
"picture":["set:rail_yard","obj:rail_joint:expand",...]}}]}}.
Picture must be a literal match, not a metaphor or a stand-in. No free code."""


def judge_prompt(draft, evidence, benchmark, seed):
    entries = [('candidate', text_of(draft)), ('benchmark', benchmark)]
    random.Random(seed).shuffle(entries)
    labels = {name: chr(65 + i) for i, (name, _) in enumerate(entries)}
    prompt = f"""Blind script comparison. You do not know which script is new.
Rate only WORDS, not images, audio, promised quality, popularity or authorship.
For each script score clarity 0-10, connected cause/effect 0-10 and engagement 0-10.
Score both under identical standards; never favor a script because it is called a benchmark.
Engagement means the owner's gold shape: a contradiction hook, an open question or reversal every few lines, a short payoff and a hook-echo close; a calm explainer is NOT engaging.
For each say whether an eight-year-old can explain what happens and why (kid_clear boolean),
and whether first THREE words give a concrete subject plus observable action (opening boolean).
List any unsupported claims in the script supported by the evidence below; evidence validation
is REQUIRED ONLY for label {labels['candidate']}, the candidate, not the comparison transcript.
Check EVERY candidate sentence against its fact_ids: an id's presence is NOT evidence.
Reconstructed demonstrations must not become a claimed historical individual/date/outcome.
Also list all candidate physical nouns/actions that cannot be shown LITERALLY by the given
drawable vocabulary. No generous synonym, unrelated object, or abstract marking for a concrete noun.
Include per-sentence evidence_ok and picture_ok; a shown concept id does not prove a picture match.
Candidate sentence definitions: {json.dumps(draft['sentences'])}
Evidence: {json.dumps(evidence)}
Drawable vocabulary: {concept_menu()}
Scripts:
""" + '\n'.join(f'{chr(65+i)}: {t}' for i, (_, t) in enumerate(entries))
    prompt += '\nReturn JSON {"scores":{"A":{"clarity":number,"cause_effect":number,"engagement":number,"kid_clear":boolean,"opening":boolean},"B":{same}},"candidate_sentences":[{"index":integer,"evidence_ok":boolean,"picture_ok":boolean,"reason":str}],"unsupported":[str],"undrawable":[str]}.'
    return prompt, labels


def judge_accepts(result, labels, sentence_count):
    try:
        candidate = result['scores'][labels['candidate']]
        benchmark = result['scores'][labels['benchmark']]
        rows = result['candidate_sentences']
        # Require complete identities, not zip-order or empty-list all() acceptance.
        if sorted(row['index'] for row in rows) != list(range(sentence_count)):
            return False
        return (not result['unsupported'] and not result['undrawable']
                and candidate['kid_clear'] is True and candidate['opening'] is True
                and all(row['evidence_ok'] is True and row['picture_ok'] is True for row in rows)
                and all(isinstance(candidate[key], (int, float))
                        and 0 <= benchmark[key] <= candidate[key] <= 10
                        for key in ('clarity', 'cause_effect', 'engagement')))
    except (KeyError, TypeError, ValueError):
        return False


def run(evidence_file, output, max_rounds=3, stage='all', first_attempt=1):
    evidence = json.loads(Path(evidence_file).read_text())
    out = Path(output); out.mkdir(parents=True, exist_ok=True)
    benchmark_path = D.HERE.parent / 'benchmark/results' / (evidence['benchmark'] + '.shots.json')
    benchmark = ' '.join(w['w'] for w in json.loads(benchmark_path.read_text())['words'])
    base = author_prompt(evidence); prompt = base
    for attempt in range(first_attempt, max_rounds + 1):
        if attempt > 1:
            previous = json.loads((out / f'draft-{attempt-1}.json').read_text())
            previous_votes = [json.loads(p.read_text()) for p in sorted(out.glob(f'judge-{attempt-1}-*.json'))]
            prompt = base + '\nRepair the latest draft, not an earlier draft: ' + json.dumps(previous)
            prompt += '\nFix these actual check findings: ' + json.dumps({'errors': check(previous, evidence), 'votes': previous_votes})
        draft_path = out / f'draft-{attempt}.json'
        if stage == 'judge' and not draft_path.exists():
            raise ValueError('Author stage must finish before judge stage')
        draft = json.loads(draft_path.read_text()) if draft_path.exists() else azure_json(prompt)
        errors = check(draft, evidence)
        draft_path.write_text(json.dumps(draft, indent=2))
        if stage == 'author':
            return {'accepted': False, 'pending': 'judges', 'errors': errors, 'attempt': attempt}
        votes = []
        if not errors:
            def judge(vote):
                saved = out / f'judge-{attempt}-{vote}.json'
                if saved.exists():
                    return json.loads(saved.read_text())
                question, labels = judge_prompt(draft, evidence, benchmark, attempt * 10 + vote)
                result = azure_json(question)
                passed = judge_accepts(result, labels, len(draft['sentences']))
                response = {'labels': labels, 'passed': passed, 'result': result}
                saved.write_text(json.dumps(response, indent=2))
                print(f'{evidence["id"]} draft {attempt} vote {vote+1}: {passed}', flush=True)
                return response
            with ThreadPoolExecutor(max_workers=3) as pool:
                votes = list(pool.map(judge, range(3)))
        accepted = not errors and len(votes) == 3 and all(v['passed'] for v in votes)
        audit = {'accepted': accepted, 'attempt': attempt, 'errors': errors, 'votes': votes,
                 'word_count': len(text_of(draft).split()), 'evidence': evidence,
                 'duration_measured': False, 'production_enabled': False}
        (out / 'script.json').write_text(json.dumps(draft, indent=2))
        (out / 'script-audit.json').write_text(json.dumps(audit, indent=2))
        if accepted:
            (out / 'narration.txt').write_text(text_of(draft))
            return audit
        if stage == 'judge':
            return audit
        prompt = base + '\nRepair the latest draft, not an earlier draft: ' + json.dumps(draft)
        prompt += '\nFix these actual check findings: ' + json.dumps({'errors': errors, 'votes': votes})
    return audit


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(); parser.add_argument('evidence'); parser.add_argument('output')
    parser.add_argument('--rounds', type=int, default=3)
    parser.add_argument('--stage', choices=['all', 'author', 'judge'], default='all')
    parser.add_argument('--attempt', type=int, default=1)
    args = parser.parse_args()
    audit = run(args.evidence, args.output, min(3, max(1, args.rounds)), args.stage, args.attempt)
    print(json.dumps({k: audit[k] for k in ('accepted', 'attempt', 'errors')}))
    raise SystemExit(0 if audit['accepted'] or audit.get('pending') else 2)