import json, unittest, numpy as np
from pathlib import Path
import sound_cues as C, sound_mix as M, effects as E, character_motion as CM

HERE = Path(__file__).parent


def shot(n): return json.loads((HERE / 'shots' / n).read_text())


class CueTimingTest(unittest.TestCase):
    def test_explosion_cue_on_the_blast_frame(self):
        s = shot('plan-fx-01.json'); cs = C.cues(s)
        blast = [c['t'] for c in cs if c['sound'] == 'explosion']
        self.assertEqual(blast, [0.5])  # effect start word; the overlapping object burst is not doubled
        fb = [p for p in E.particles('explosion') if p['role'] == 'fireball']
        self.assertTrue(all(E.state('explosion', p, 0.5 - 0.5 - 1/30)[3] == 0 for p in fb))

    def test_debris_cues_land_within_one_frame_of_ground_contact(self):
        e = {'kind': 'explosion', 'pos': [0, 0, 0], 'start': 0, 'scale': 1}
        for t in C._debris_landings(e, 30):
            hit = [p for p in E.particles('explosion') if p['role'] == 'debris' and E.state('explosion', p, t)[2] == 0 and E.state('explosion', p, t - 1/30)[2] > 0]
            self.assertTrue(hit)

    def test_footsteps_match_foot_down(self):
        for t in C.footfalls('run', 2):
            p0, p1 = CM.pose('run', t + .001), CM.pose('run', t + 1/30)
            self.assertTrue(abs(p0['left_ankle'][2] - .055) < 1e-3 or abs(p0['right_ankle'][2] - .055) < 1e-3)

    def test_swing_hits_on_grip_peak(self):
        for t in C.swing_hits(3): self.assertAlmostEqual(CM.pose('swing', t)['grip_angle'], .85, places=6)

    def test_cues_snap_to_frames(self):
        for c in C.cues(shot('plan-fx-02.json')): self.assertAlmostEqual(c['t'] * 30, round(c['t'] * 30), places=3)


class MixTest(unittest.TestCase):
    def test_voice_samples_untouched(self):
        v = np.sin(np.arange(48000) / 9) * .3; sfx = np.random.default_rng(1).normal(0, .1, (48000, 2))
        out = M.mix(v, np.zeros((48000, 2))); self.assertTrue(np.array_equal(out[:, 0], v))
        out = M.mix(v, sfx); self.assertTrue(np.allclose(out[:, 0] - sfx[:, 0] * M.duck(v) * .9, v))

    def test_effects_duck_under_speech(self):
        v = np.concatenate([np.zeros(24000), np.sin(np.arange(24000) / 9) * .3]); env = M.duck(v)
        self.assertGreater(env[20000], .95); self.assertLess(env[-1000], .65)


if __name__ == '__main__': unittest.main()


class SpatialTest(unittest.TestCase):
    def test_pan_side_and_audible_floor(self):
        g, pan = C.spatial({'pos': [3, 5, 0]}, [0, 0, 1.5], [0, 5, 1])
        self.assertGreater(pan, 0); self.assertGreaterEqual(g, .45)
        g, pan = C.spatial({'pos': [-3, 5, 0]}, [0, 0, 1.5], [0, 5, 1]); self.assertLess(pan, 0)
