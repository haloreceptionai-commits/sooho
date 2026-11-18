"""Rules of the Advanced art director (pure Python, no Blender)."""
import sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import art_director as A


def manifest(lines, cast=None, world='landscape', secs=3.0):
    words, cap, shots, t = [], [], [], 0.2
    for k, line in enumerate(lines):
        start = t
        for w in line.split():
            words.append({'text': w.lower(), 'start': round(t, 3), 'end': round(t + .3, 3)}); cap.append(w); t += secs / len(line.split())
        shots.append({'start': round(start * 30) if k else 0, 'end': round(t * 30), 'world': world, 'light': 'day', 'shot': 'medium', 'move': 'static', 'mood': 'calm',
                      'speaker': None, 'keyword': 0, 'props': [], 'fx': [], 'actors': [{'id': 'major', 'action': 'idle', 'expression': 'neutral', 'slot': 'center', 'facing': 0}]})
    for a, b in zip(shots, shots[1:]): b['start'] = a['end']
    return {'words': words, 'caption_words': cap, 'shots': shots, 'cast': cast or [{'id': 'major', 'outfit': 'soldier'}, {'id': 'bird', 'outfit': 'soldier', 'card': True}]}


class ArtDirector(unittest.TestCase):
    def test_every_frame_covered_once(self):
        m = manifest(['Farmers watched the wheat fields die.', 'The army marched into the outback with machine guns.', 'The emus scattered and ran.'], secs=5.5)
        segs = A.plan(m, {'bird.png'})
        frames = [f for g in segs for f in range(g['start'], g['end'])]
        self.assertEqual(frames, list(range(0, m['shots'][-1]['end'])))

    def test_no_frame_is_ever_left_out_of_the_plan(self):
        """Regression: a short setup used to be dropped, leaving frames uncovered and the video cut short."""
        for secs in (1.0, 2.2, 3.1, 4.7, 6.3, 7.9):
            for line in ('Thousands lined up because two well diggers hit a foot.', 'They cleared soil and uncovered a ten foot stone giant.'):
                m = manifest([line, line], secs=secs)
                frames = [f for g in A.plan(m) for f in range(g['start'], g['end'])]
                self.assertEqual(frames, list(range(0, m['shots'][-1]['end'])), (secs, line))

    def test_long_lines_are_split_into_setups(self):
        m = manifest(['In nineteen thirty two the farmers of western australia begged the government for help against the birds.'], secs=7.5)
        self.assertGreaterEqual(len(A.plan(m)), 3)

    def test_camera_never_repeats_back_to_back(self):
        m = manifest([f'Line {k} about farmers and soldiers in the field.' for k in range(10)], secs=4)
        kinds = [g['notes']['camera_type'] for g in A.plan(m)]
        self.assertTrue(all(a != b for a, b in zip(kinds, kinds[1:])), kinds)
        self.assertGreaterEqual(len(set(kinds)), 5)

    def test_spoken_place_wins(self):
        m = manifest(['The farmers lost their wheat crops.', 'Officials in parliament signed the report.', 'The ship sailed across the sea.'])
        self.assertEqual([g['notes']['set'] for g in A.plan(m) if g['start'] in (s['start'] for s in m['shots'])], ['farm_field', 'office', 'ship_deck'])

    def test_running_animals_move_and_people_react(self):
        m = manifest(['The soldiers opened fire but the emus scattered and ran.'], secs=2.5)
        shots = [x['shot'] for x in A.plan(m, {'bird.png'})]
        g = next(x for x in shots if x.get('cards'))   # the setup where the emus scatter (lines are cut into ~1.8 s setups)
        self.assertTrue(g['cards'] and all('to' in c for c in g['cards']))
        self.assertTrue(all(c['action'] != 'run' for x in shots for c in x['cast']))

    def test_walkers_cross_the_frame(self):
        m = manifest(['The major walked across the plains.'], secs=2.5)
        c = A.plan(m)[0]['shot']['cast'][0]
        self.assertEqual(c['action'], 'walk')

    def test_herd_words_fill_the_frame_with_cards(self):
        m = manifest(['Twenty thousand emus invaded the farms.'], secs=2.5)
        self.assertEqual(len(A.plan(m, {'bird.png'})[0]['shot']['cards']), 6)

    def test_gunfire_effects_start_on_the_word(self):
        m = manifest(['They waited and then fired.'], secs=2.5)
        segs = A.plan(m); fired = [w for w in m['words'] if w['text'].startswith('fired')][0]['start']
        fx = [(g['start'] / 30 + e['start']) for g in segs for e in g['shot'].get('effects', []) if e['kind'] == 'sparks']
        self.assertTrue(fx and abs(fx[0] - fired) < 0.35)   # the sparks start on the word, in whichever setup says it

    def test_no_money_bag_unless_money_is_spoken(self):
        m = manifest(['The emus ate the wheat.'], secs=2.5); m['shots'][0]['props'] = [{'kind': 'coins', 'place': 'hand', 'motion': 'none', 'asset': ''}]
        self.assertEqual(A.plan(m, {'bird.png'})[0]['shot']['objects'], [])

    def test_props_are_whitelisted_models(self):
        from shot_schema import PROP_IDS
        m = manifest(['The farmers loaded barrels and crates onto the cart.'], secs=3)
        for g in A.plan(m):
            for p in g['shot'].get('props', []): self.assertIn(p['id'], PROP_IDS)


    # ---- Stage 1 owner rules (Nov 16 2026)
    def test_location_names_the_kit_or_neutral(self):
        self.assertEqual(A.match_location("Commercial Street in Boston's North End, 1919"), 'street')
        self.assertEqual(A.match_location('a Boston courtroom, 1925'), 'neutral')
        self.assertEqual(A.match_location('molasses tank yard by the harbor'), 'neutral')
        self.assertEqual(A.match_location('a dusty country road outside St. Louis, 1904'), 'farm_field')
        self.assertEqual(A.match_location('a legal desk in a company office, downtown Boston, 1919, indoors'), 'office')
        self.assertEqual(A.match_location('steel tank perimeter walkway, Boston North End, outdoors'), 'neutral')

    def test_free_text_location_overrides_world(self):
        m = manifest(['The tank burst.', 'The judge ruled.'], world='town')
        m['shots'][0]['location'] = 'Commercial Street, Boston'; m['shots'][1]['location'] = 'a Boston courtroom'
        self.assertEqual(A.plan_locations(m), ['street', 'neutral'])

    def test_no_closest_wrong_kit_without_a_match(self):
        m = manifest(['It happened around midday.'], world='lab')
        self.assertEqual(A.plan_locations(m), ['neutral'])

    def test_keyword_never_adds_a_model(self):
        m = manifest(['The steel tank full of oil and water leaked.'], secs=3)
        for g in A.plan(m): self.assertNotIn('props', g['shot'])

    def test_painted_object_is_placed_and_shown(self):
        m = manifest(['The huge tank stood over the street.', 'Then the tank burst.'], secs=5.5)
        for sh in m['shots']:
            sh['location'] = 'Commercial Street, Boston'
            sh['props'] = [{'kind': 'asset', 'asset': 'card/molasses_tank', 'place': 'background', 'motion': 'none', 'phrase': 'huge riveted steel molasses storage tank', 'size': 'huge'}]
        segs = A.plan(m, {'obj-molasses_tank.png'})
        for i in range(2):
            mine = [g for g in segs if g['shot_index'] == i]
            self.assertTrue(any('obj-molasses_tank.png' in g['notes']['cards_shown'] for g in mine), [g['notes'] for g in mine])
            self.assertTrue(all(any(c['image'] == 'obj-molasses_tank.png' and c['height'] == 6.0 for c in g['shot']['cards']) for g in mine))


    def card(self, name, size):
        return {'kind': 'asset', 'asset': f'card/{name}', 'place': 'background', 'motion': 'none', 'phrase': name.replace('_', ' '), 'size': size}

    def test_empty_shot_has_no_people(self):
        m = manifest(['Boston molasses killed twenty one people.'], secs=3)
        m['shots'][0]['empty'] = True
        for g in A.plan(m): self.assertEqual(g['shot']['cast'], [])

    def test_climax_is_shown_as_a_sequence_in_order(self):
        m = manifest(['Then at midday the steel tank burst on Commercial Street.'], secs=4.5)
        sh = m['shots'][0]; sh['location'] = 'Commercial Street, Boston, outdoors'
        sh['props'] = [self.card('steel_tank', 'huge'), self.card('seam_failure', 'large'), self.card('molasses_wave', 'large')]
        sh['sequence'] = ['steel_tank', 'seam_failure', 'molasses_wave']
        segs = A.plan(m, {'obj-steel_tank.png', 'obj-seam_failure.png', 'obj-molasses_wave.png'})
        self.assertEqual([g['notes']['sequence_step'] for g in segs], ['steel_tank', 'seam_failure', 'molasses_wave'])
        for g, want in zip(segs, ['obj-steel_tank.png', 'obj-seam_failure.png', 'obj-molasses_wave.png']):
            self.assertEqual([c['image'] for c in g['shot']['cards']], [want])
            self.assertIn(want, g['notes']['cards_shown'])
        self.assertIn('shake', segs[-1]['shot']['camera'])

    def test_short_climax_keeps_the_burst(self):
        m = manifest(['The tank burst.'], secs=0.9)
        sh = m['shots'][0]
        sh['props'] = [self.card('steel_tank', 'huge'), self.card('seam_failure', 'large'), self.card('molasses_wave', 'large')]
        sh['sequence'] = ['steel_tank', 'seam_failure', 'molasses_wave']
        segs = A.plan(m, {'obj-steel_tank.png', 'obj-seam_failure.png', 'obj-molasses_wave.png'})
        self.assertEqual(segs[-1]['notes']['sequence_step'], 'molasses_wave')

    def test_key_object_is_never_hidden_or_tiny_in_wide_shots(self):
        lines = ['The tank stood by the street.', 'Neighbors watched the tank.', 'Men walked past the tank.', 'The tank kept leaking.', 'Everyone looked up at the tank.']
        m = manifest(lines, secs=2.4)
        for sh in m['shots']:
            sh['location'] = 'Commercial Street, Boston, outdoors'
            sh['props'] = [self.card('seam_drip', 'medium')]
            sh['actors'] = [{'id': 'major', 'action': 'idle', 'expression': 'neutral', 'slot': 'center', 'facing': 0}, {'id': 'neighbor', 'action': 'idle', 'expression': 'neutral', 'slot': 'left', 'facing': 0}]
        m['cast'] = [{'id': 'major', 'outfit': 'soldier'}, {'id': 'neighbor', 'outfit': 'villager'}]
        for g in A.plan(m, {'obj-seam_drip.png'}):
            cam = g['shot']['camera']; key = next(c for c in g['shot']['cards'] if c['image'] == 'obj-seam_drip.png')
            people = [(c['pos'], A.PERSON_H, A.PERSON_W) for c in g['shot']['cast']]
            self.assertLessEqual(A.blocked_share(cam, (key['pos'], key['height'], key['height'] * .6), people), 0.3, g['notes'])
            if g['notes']['camera_type'] in ('wide', 'establish', 'high'): self.assertGreaterEqual(A.height_frac(cam, key), 0.15, g['notes'])


if __name__ == '__main__':
    unittest.main()


class BrightCalmLookTests(unittest.TestCase):
    def test_nobody_flails_for_a_failed_story_or_a_react_or_worried_cue(self):
        import re, art_director as AD
        verb = lambda text: next((a for pat, a in AD.VERB_ACTION if re.search(pat, text)), None)
        self.assertEqual(verb('the first whistle failed again'), 'react')        # one startled gesture
        self.assertEqual(verb('a lost army'), 'react')
        self.assertEqual(verb('the crowd began to panic'), 'panic')              # real panic still flails
        for cue, want in (('react', 'react'), ('worried', 'worry'), ('shout', 'shout')): self.assertEqual(AD.LEGACY_ACTION[cue], want)
        self.assertNotIn('panic', [AD.LEGACY_ACTION[c] for c in ('react', 'worried', 'shout')])

    def test_the_cast_wears_bright_saturated_colours(self):
        import art_director as AD
        for rgb in AD.SHIRTS + AD.HAT_COLORS: self.assertGreaterEqual(max(rgb) - min(rgb), .45, rgb)
        self.assertGreater(len({tuple(c) for c in AD.SHIRTS}), 3)
