"""The art director turns what a line SAYS into what the character DOES: cooking at a stove, typing at a desk, driving a car, hugging, riding a bike."""
import sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import art_director as A
from test_art_director import manifest


def shot_for(line, **kw):
    m = manifest([line], cast=[{'id': 'major', 'outfit': 'worker'}], secs=3.5, **kw)
    return A.plan(m)[0]['shot']


class ActivityDirector(unittest.TestCase):
    def test_cooking_puts_a_pan_in_the_hand_and_a_stove_in_front(self):
        sh = shot_for('She was baking cookies for the whole town.'); c = sh['cast'][0]
        self.assertEqual(c['action'], 'cook'); self.assertIn('pan', [h['prop'] for h in c['holds']])
        self.assertTrue(any('kitchenStove' in p['id'] for p in sh['props']))

    def test_driving_puts_the_character_in_a_car_that_moves(self):
        sh = shot_for('Then he drove his red car down the highway.'); c = sh['cast'][0]
        self.assertEqual(c['action'], 'drive'); self.assertEqual([r['kind'] for r in sh['rigs']], ['car'])
        self.assertNotEqual(c['pos'], c['to']); self.assertNotEqual(sh['rigs'][0]['pos'], sh['rigs'][0]['to'])
        self.assertAlmostEqual(c['to'][0] - c['pos'][0], sh['rigs'][0]['to'][0] - sh['rigs'][0]['pos'][0], places=2)   # driver and car travel together

    def test_riding_uses_a_bike(self):
        self.assertEqual([r['kind'] for r in shot_for('She rode her bike to school.')['rigs']], ['bike'])

    def test_typing_and_writing_sit_at_a_desk(self):
        for line, act in (('The hacker typed the password on a laptop.', 'type'), ('He wrote a long letter to the king.', 'write')):
            sh = shot_for(line); c = sh['cast'][0]
            self.assertEqual(c['action'], act); self.assertTrue(c.get('seat')); self.assertTrue(any('desk' in p['id'] for p in sh['props']))

    def test_eating_holds_food_and_cookie_alone_is_not_cooking(self):
        c = shot_for('The boy ate the cookie.')['cast'][0]
        self.assertEqual(c['action'], 'eat'); self.assertEqual(c['holds'][0]['prop'], 'food')

    def test_two_people_hug_close_together(self):
        m = manifest(['The two friends hugged after ten years.'], cast=[{'id': 'major', 'outfit': 'worker'}, {'id': 'friend', 'outfit': 'worker'}], secs=3.5)
        m['shots'][0]['actors'].append({'id': 'friend', 'action': 'idle', 'expression': 'neutral', 'slot': 'left', 'facing': 0})
        cast = A.plan(m)[0]['shot']['cast']
        self.assertEqual([c['action'] for c in cast], ['hug', 'hug']); self.assertLess(abs(cast[0]['pos'][0] - cast[1]['pos'][0]) + abs(cast[0]['pos'][1] - cast[1]['pos'][1]), 1.2)

    def test_a_line_with_no_activity_keeps_the_old_behaviour(self):
        sh = shot_for('The weather was cold and grey.'); self.assertNotIn('rigs', sh); self.assertIn(sh['cast'][0]['action'], ('stand', 'point', 'talk'))


if __name__ == '__main__': unittest.main()
