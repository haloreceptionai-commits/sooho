"""Animal identity shared with the app (animals.json, also read by src/lib/advanced-cards.ts).
Matches whole id words, never substrings: 'senator', 'pirate' or 'catapult' are not animals."""
import json, re
from pathlib import Path
_V = json.loads((Path(__file__).parent / 'animals.json').read_text())
ANIMALS = set(_V['animals']); PLURAL = _V['plural']


def _word(w):
    w = re.sub(r'[^a-z]', '', w.lower())
    if w in PLURAL: return PLURAL[w]
    if w in ANIMALS: return w
    for cut in ('es', 's'):
        if w.endswith(cut) and w[:-len(cut)] in ANIMALS: return w[:-len(cut)]
    return None


class _Matcher:
    """Drop-in for the old compiled regex: .search(text) is truthy when any word is an animal."""
    def search(self, text):
        for w in re.split(r'[^a-zA-Z]+', str(text or '')):
            a = _word(w) if w else None
            if a: return a
        return None


ANIMAL = _Matcher()
