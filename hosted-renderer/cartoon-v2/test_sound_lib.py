"""The procedural sound library: every effect is finite, deterministic, clean at its edges and has the acoustic signature of what it is named after."""
import unittest
import numpy as np
import sound_lib as S

R = S.RATE


def signature(x):
    f = np.fft.rfftfreq(len(x), 1 / R); e = np.abs(np.fft.rfft(x)) ** 2
    return float((f * e).sum() / e.sum()), float(f[int(np.argmax(e))])


class EffectTests(unittest.TestCase):
    def test_every_effect_is_finite_deterministic_unclipped_and_click_free(self):
        for kind in S.SFX:
            with self.subTest(kind=kind):
                x, y = S.render(kind, 4), S.render(kind, 4)
                np.testing.assert_array_equal(x, y)
                self.assertTrue(np.isfinite(x).all()); self.assertGreater(len(x), R // 20)
                self.assertLess(float(np.max(np.abs(x))), 1.0); self.assertGreater(float(np.max(np.abs(x))), .05)
                self.assertLess(abs(float(x[0])), 1e-3); self.assertLess(abs(float(x[-1])), 2e-3)   # no click at either edge
                self.assertLess(abs(float(np.mean(x))), .03)                                        # no DC offset

    def test_acoustic_signatures_match_the_names(self):
        cen = lambda k: signature(S.render(k, 7))
        self.assertTrue(380 < cen('horn')[1] < 520)            # a car horn sits on its notes (392 and 494 Hz)
        self.assertLess(cen('heartbeat')[1], 90)                # sub-bass thump
        self.assertLess(cen('drop')[1], 140); self.assertLess(cen('thunder')[0], 400)
        self.assertTrue(900 < cen('ding')[1] < 1200)            # notification bell
        self.assertTrue(250 < cen('boing')[1] < 700)
        self.assertGreater(cen('click')[0], 2500); self.assertGreater(cen('cash')[0], 2500)
        self.assertLess(cen('door')[0], 400); self.assertLess(cen('slam')[0], 400); self.assertLess(cen('engine')[0], 400)
        self.assertTrue(190 < cen('trombone')[1] < 240)         # the Bb3-A3-Ab3-G3 slide ends near G3 (196 Hz)

    def test_ambient_beds_fill_the_length_and_fade_at_both_ends(self):
        for kind in S.AMBIENT:
            with self.subTest(kind=kind):
                x = S.render(kind, 3, R * 20)
                self.assertEqual(len(x), R * 20); self.assertTrue(np.isfinite(x).all())
                self.assertLess(float(np.max(np.abs(x))), .5)
                self.assertLess(abs(float(x[0])), 1e-4); self.assertLess(abs(float(x[-1])), 1e-3)
                seam = x[8 * R - R // 2:8 * R + R // 2]    # the join of the tiled loop is not a hole in the sound
                self.assertGreater(float(np.sqrt(np.mean(seam ** 2))), .3 * float(np.sqrt(np.mean(x ** 2))))

    def test_ambient_signatures(self):
        self.assertGreater(signature(S.render('rain', 5, R * 6))[0], 3000)
        self.assertLess(signature(S.render('wind', 5, R * 6))[0], 700)
        self.assertLess(signature(S.render('traffic', 5, R * 6))[0], 700)
        self.assertTrue(3800 < signature(S.render('crickets', 5, R * 6))[1] < 4800)
        self.assertGreater(signature(S.render('fire', 5, R * 6))[0], 600)     # crackle: well above a rumble
        self.assertTrue(250 < signature(S.render('water', 5, R * 6))[0] < 3500)


class MusicTests(unittest.TestCase):
    N = R * 14; TW = R * 9
    beds = {}

    @classmethod
    def bed(cls, mood, seed=5):
        if (mood, seed) not in cls.beds: cls.beds[(mood, seed)] = S.music_bed(mood, cls.N, cls.TW, seed)
        return cls.beds[(mood, seed)]

    def test_beds_are_exact_length_deterministic_seeded_and_not_clipped(self):
        for mood in S.MOODS:
            with self.subTest(mood=mood):
                x = self.bed(mood)
                self.assertEqual(len(x), self.N); self.assertTrue(np.isfinite(x).all())
                self.assertLessEqual(float(np.max(np.abs(x))), .451)
                np.testing.assert_array_equal(x, S.music_bed(mood, self.N, self.TW, 5))
                self.assertFalse(np.array_equal(x, self.bed(mood, 6)))
                self.assertEqual(float(x[0]), 0.0); self.assertEqual(float(x[-1]), 0.0)

    def test_the_answer_brightens_the_bed(self):
        cen = lambda v: float((np.fft.rfftfreq(len(v), 1 / R) * np.abs(np.fft.rfft(v)) ** 2).sum() / (np.abs(np.fft.rfft(v)) ** 2).sum())
        for mood in ('lofi', 'sad'):
            with self.subTest(mood=mood):
                x = self.bed(mood)
                self.assertGreater(cen(x[self.TW:]), 1.2 * cen(x[:self.TW]))

    def test_beds_keep_the_tempo_they_claim(self):
        def lock(x, bpm):
            hop = 480; seg = np.abs(x[:len(x) // hop * hop]).reshape(-1, hop).mean(1); e = np.maximum(0, np.diff(seg)); e = e - e.mean(); n = len(e)
            lag = int(round(100 * 60 / bpm)); ac = lambda l: float(np.dot(e[:n - l], e[l:]) / (n - l))
            return ac(lag) / ac(0)
        for mood, bpm in (('lofi', 76), ('epic', 96), ('sad', 62)):
            with self.subTest(mood=mood):
                x = self.bed(mood)[R:self.TW - R]
                self.assertGreater(lock(x, bpm), lock(x, bpm * 1.25) + .05)

    def test_epic_and_suspense_go_quiet_right_before_the_answer(self):
        for mood in ('epic', 'suspense'):
            with self.subTest(mood=mood):
                x = self.bed(mood)
                before = float(np.sqrt(np.mean(x[self.TW - R // 5:self.TW] ** 2))); body = float(np.sqrt(np.mean(x[R:self.TW - R] ** 2)))
                self.assertLess(before, .75 * body)

    def test_mood_follows_the_script(self):
        self.assertEqual(S.pick_mood('the roman army marched to war and each soldier fought the battle for the king'), 'epic')
        self.assertEqual(S.pick_mood('a secret murder, a ghost, a missing child and a dark mystery'), 'suspense')
        self.assertEqual(S.pick_mood('they died alone and the funeral made everyone cry with tears'), 'sad')
        self.assertEqual(S.pick_mood('study and relax with coffee, a calm morning routine'), 'lofi')
        self.assertEqual(S.pick_mood('why is the sky blue'), 'quirky')
        self.assertEqual(S.pick_mood('why is the sky blue', 'sad'), 'sad')          # an explicit choice wins
        self.assertEqual(S.pick_mood('why is the sky blue', 'nonsense'), 'quirky')  # an unknown choice is ignored, not trusted

    def test_unknown_mood_is_rejected(self):
        with self.assertRaises(ValueError): S.music_bed('nope', R, 0)


class PlanningTests(unittest.TestCase):
    def test_word_triggers_are_whole_words(self):
        for w in ('care', 'carry', 'carpet', 'hornet', 'doorway', 'moneyed'): self.assertNotIn(w, S.WORD_SOUNDS)
        for kind in set(S.WORD_SOUNDS.values()): self.assertIn(kind, S.SFX)

    def test_thinning_never_repeats_inside_the_gap_or_stacks_more_than_two_per_second(self):
        cues = [{'frame': f, 'kind': 'trombone'} for f in (0, 60, 120, 300)] + [{'frame': 10 + i, 'kind': k} for i, k in enumerate(('boing', 'punch', 'pop', 'horn'))]
        out = S.thin_cues(cues)
        self.assertEqual([c['frame'] for c in out if c['kind'] == 'trombone'], [0, 300])   # 8 s gap
        self.assertLessEqual(len([c for c in out if c['frame'] < 40 and c['kind'] != 'trombone']), 2)
        self.assertEqual(len(S.thin_cues([{'frame': 0, 'kind': 'rain', 'end': 90}, {'frame': 3, 'kind': 'rain', 'end': 95}])), 2)   # ambience is never thinned

    def test_ambience_follows_the_place_and_merges_across_cuts(self):
        shots = [{'start': 0, 'end': 90, 'place': {'terrain': 'town_street', 'time': 'day'}}, {'start': 90, 'end': 200, 'place': {'terrain': 'road', 'time': 'day'}},
                 {'start': 200, 'end': 300, 'place': {'terrain': 'forest', 'time': 'night'}}, {'start': 300, 'end': 400, 'place': {'terrain': 'plain', 'weather': 'rain'}},
                 {'start': 400, 'end': 450, 'world': 'lab'}]
        plan = S.ambience_plan(shots, 450)
        self.assertEqual([(c['kind'], c['frame'], c['end']) for c in plan], [('traffic', 0, 200), ('crickets', 200, 300), ('rain', 300, 400)])
        self.assertEqual(S.ambience_for({'place': {'terrain': 'forest', 'time': 'day'}}), ['birds'])
        self.assertEqual(S.ambience_for({'place': {'terrain': 'desert', 'weather': 'storm'}}), ['rain', 'wind'])
        self.assertEqual(S.ambience_for({'world': 'mine'}), [])
        night_camp = {'place': {'terrain': 'camp', 'time': 'night', 'weather': 'clear', 'dressing': [{'id': 'campfire', 'count': 2}]}}
        self.assertEqual(S.ambience_for(night_camp), ['fire', 'crickets'])
        self.assertEqual(S.ambience_for({'place': {'terrain': 'river_crossing', 'time': 'day'}}), ['water'])


if __name__ == '__main__': unittest.main()
