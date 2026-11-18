"""Long-form backgrounds: 16:9 size, deterministic per seed, warm palette, real map linework."""
import sys, unittest
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).parent))
import doc_board as B


class Board(unittest.TestCase):
    def test_long_form_ratio_and_type(self):
        for style in ('plaster', 'parchment'):
            a = B.board(style)
            self.assertEqual(a.shape, (1080, 1920, 3)); self.assertEqual(a.dtype, np.uint8)
            self.assertAlmostEqual(a.shape[1] / a.shape[0], 16 / 9, places=3)

    def test_same_seed_same_picture(self):
        self.assertTrue(np.array_equal(B.board('parchment', 480, 270, 3), B.board('parchment', 480, 270, 3)))
        self.assertFalse(np.array_equal(B.board('plaster', 480, 270, 1), B.board('plaster', 480, 270, 2)))

    def test_amber_is_warm_and_brighter_in_the_centre(self):
        a = B.board('plaster', 480, 270, 7).astype(float)
        r, g, b = a[..., 0].mean(), a[..., 1].mean(), a[..., 2].mean()
        self.assertTrue(r > g > b)                       # amber, not grey or cold
        centre = a[100:170, 180:300].mean(); corner = a[:30, :30].mean()
        self.assertGreater(centre, corner)               # light centre, darker edges

    def test_parchment_has_faint_map_lines_not_flat(self):
        p = B.board('parchment', 480, 270, 3).astype(float)
        self.assertGreater(p.std(), 6)                   # not a plain sheet: map linework and stains are present
        self.assertLess(p.mean(), 230); self.assertGreater(p.mean(), 120)

    def test_unknown_style_is_rejected(self):
        with self.assertRaises(ValueError): B.board('neon')


if __name__ == '__main__':
    unittest.main()
