"""Board elements: timed to the words that name them, repeatable, and placed on the right part of the map."""
import sys, unittest
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).parent))
import doc_elements as E
import doc_board as B


def W(text, t0, t1=None):
    return {'text': text, 't0': t0, 't1': t1 if t1 is not None else t0 + .4}


class Elements(unittest.TestCase):
    def test_a_year_and_a_place_are_scheduled_on_their_words(self):
        ev = E.schedule([W('Peru', 1.0), W('1877', 2.0)], 0.0, 8.0)
        kinds = {e['kind']: e for e in ev}
        self.assertEqual(kinds['stamp']['text'], '1877'); self.assertAlmostEqual(kinds['stamp']['at'], 2.0)
        self.assertEqual(kinds['cartouche']['text'], 'PERU'); self.assertAlmostEqual(kinds['cartouche']['at'], 1.0)

    def test_two_word_place_and_no_negative_or_late_times(self):
        ev = E.schedule([W('New', 3.0), W('York', 3.3), W('again', 9.5)], 0.0, 8.0)
        names = [e['text'] for e in ev if e['kind'] == 'cartouche']
        self.assertIn('NEW YORK', names)
        self.assertTrue(all(0 <= e['at'] < 8.0 for e in ev))

    def test_an_element_is_absent_before_it_is_named_and_gone_after_it_leaves(self):
        ev = E.schedule([W('1877', 2.0)], 0.0, 8.0)
        frame = np.zeros((1080, 1920, 3), np.uint8)
        before = E.draw(frame.copy(), ev, 1.0, 1920, 1080, 'plaster')
        during = E.draw(frame.copy(), ev, 2.5, 1920, 1080, 'plaster')
        after = E.draw(frame.copy(), ev, 7.9, 1920, 1080, 'plaster')
        self.assertGreater(int(during.sum()), int(before.sum()))
        self.assertEqual(int(after.sum()), int(E.draw(frame.copy(), [], 7.9, 1920, 1080, 'plaster').sum()))

    def test_the_hotspot_lands_on_the_named_place(self):
        px, py = E.project(*E.PLACES['peru'], 1920, 1080)
        self.assertTrue(0 < px < 1920 and 0 < py < 1080)
        self.assertLess(px, 1920 * .5); self.assertGreater(py, 1080 * .4)   # Peru is in the west, south of the equator line

    def test_same_time_same_picture(self):
        ev = E.schedule([W('Peru', 1.0), W('1877', 2.0)], 0.0, 8.0)
        base = B.board('parchment', 1920, 1080, 7)
        self.assertTrue(np.array_equal(E.draw(base.copy(), ev, 2.2, 1920, 1080, 'parchment'), E.draw(base.copy(), ev, 2.2, 1920, 1080, 'parchment')))


if __name__ == '__main__':
    unittest.main()
