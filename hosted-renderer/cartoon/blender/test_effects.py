import unittest, effects as E


class EffectsTest(unittest.TestCase):
    def test_nothing_before_spoken_start(self):
        for k in E.KINDS:
            for p in E.particles(k): self.assertEqual(E.state(k, p, -0.01)[3], 0)

    def test_debris_never_below_ground_and_falls(self):
        for p in E.particles('explosion'):
            if p['role'] != 'debris': continue
            zs = [E.state('explosion', p, t / 30)[2] for t in range(90)]
            self.assertTrue(all(z >= 0 for z in zs)); self.assertEqual(zs[-1], 0.0)

    def test_fireball_flashes_then_fades(self):
        fb = [p for p in E.particles('explosion') if p['role'] == 'fireball']
        self.assertTrue(all(E.state('explosion', p, .2)[3] > 0 for p in fb))
        self.assertTrue(all(E.state('explosion', p, .8)[3] == 0 for p in fb))

    def test_shake_is_slight_and_decays(self):
        self.assertEqual(E.shake_offset(.5, [{'t': 1}]), (0, 0, 0))
        a = max(abs(v) for v in E.shake_offset(1.02, [{'t': 1}])); self.assertLess(a, .06)
        self.assertEqual(E.shake_offset(1.7, [{'t': 1}]), (0, 0, 0))

    def test_crowd_of_250_fits_and_is_spaced(self):
        pts = E.crowd_layout(250, (0, 6), (16, 9))
        self.assertEqual(len(pts), 250)
        d = min(((a[0]-b[0])**2+(a[1]-b[1])**2)**.5 for i, a in enumerate(pts[:60]) for b in pts[i+1:60])
        self.assertGreater(d, .3)
        with self.assertRaises(ValueError): E.crowd_layout(400, (0, 0), (3, 3))


if __name__ == '__main__': unittest.main()
