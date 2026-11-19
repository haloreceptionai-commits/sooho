import unittest
import numpy as np
from acoustic_windows import acoustic_emissions, RATE, STRIDE, RECEPTIVE


class AcousticWindowTests(unittest.TestCase):
    def test_ninety_second_short_keeps_original_inference(self):
        wave = np.zeros(RATE * 90, dtype=np.float32)
        calls = []
        expected = np.array([[1., 2.]])
        def predict(samples):
            calls.append(len(samples))
            return expected
        self.assertIs(acoustic_emissions(wave, predict), expected)
        self.assertEqual(calls, [RATE * 90])

    def test_five_minute_take_has_no_missing_or_duplicate_frames(self):
        wave = np.arange(RATE * 300, dtype=np.float32)
        calls = []
        def predict(samples):
            calls.append(len(samples))
            frames = (len(samples) - RECEPTIVE) // STRIDE + 1
            return (samples[0] / STRIDE + np.arange(frames))[:, None]
        result = acoustic_emissions(wave, predict)
        frames = (len(wave) - RECEPTIVE) // STRIDE + 1
        np.testing.assert_array_equal(result[:, 0], np.arange(frames))
        self.assertGreater(len(calls), 1)
        self.assertLessEqual(max(calls), RATE * 23)

    def test_partial_final_window_keeps_exact_audio_clock(self):
        wave = np.arange(RATE * 91 + 157, dtype=np.float32)
        def predict(samples):
            n = (len(samples) - RECEPTIVE) // STRIDE + 1
            return (samples[0] / STRIDE + np.arange(n))[:, None]
        result = acoustic_emissions(wave, predict)
        np.testing.assert_array_equal(result[:, 0], np.arange((len(wave) - RECEPTIVE) // STRIDE + 1))

    def test_bad_window_shape_stops_instead_of_guessing(self):
        with self.assertRaisesRegex(ValueError, 'frame count'):
            acoustic_emissions(np.zeros(RATE * 91), lambda samples: np.zeros((1, 2)))


if __name__ == '__main__':
    unittest.main()