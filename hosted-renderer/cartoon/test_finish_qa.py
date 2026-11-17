import unittest
from finish import qa_verdict

OK = {'input_i': '-14.5', 'input_tp': '-2.8'}
BLACK = '[blackdetect @ 0x1] black_start:16.6 black_end:17.23 black_duration:0.633333'


class QaTests(unittest.TestCase):
    def test_the_failed_video_would_now_ship_with_a_note(self):        # 0.63 s of black in a 46 s video, loudness -14.5
        hard, notes = qa_verdict(BLACK, OK, 46.36)
        self.assertEqual(hard, []); self.assertTrue(any('black_start' in n for n in notes))

    def test_long_black_or_frozen_stretches_still_stop_it(self):
        self.assertTrue(qa_verdict('black_duration:9.0', OK, 40)[0])
        self.assertTrue(qa_verdict('lavfi.freezedetect.freeze_duration: 20.0', OK, 40)[0])
        self.assertEqual(qa_verdict('lavfi.freezedetect.freeze_duration: 1.0', OK, 40)[0], [])

    def test_loudness_off_target_is_a_note_not_a_failure(self):
        hard, notes = qa_verdict('', {'input_i': '-17.2', 'input_tp': '-0.2'}, 30)
        self.assertEqual(hard, []); self.assertEqual(len(notes), 2)


if __name__ == '__main__': unittest.main()
