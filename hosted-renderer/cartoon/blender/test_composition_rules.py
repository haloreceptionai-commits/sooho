import unittest
from composition_rules import emotion_line,budget_ceiling,preview_frames
from shot_schema import validate_shot

class Rules(unittest.TestCase):
    def test_budget_25_percent(self):
        self.assertEqual(budget_ceiling(.8),1.0)
    def test_emotion_requires_spoken_emotion(self):
        self.assertFalse(emotion_line('But its owner blamed anarchists.'))
        self.assertFalse(emotion_line('An anarchist bomb had destroyed the tank.'))
        self.assertTrue(emotion_line('The owner felt terrified.'))
    def test_stills_not_full_render(self):
        self.assertEqual(preview_frames(90),[45])
        self.assertEqual(preview_frames(90,True),[68])
    def test_limits_reject_looser_values(self):
        base={'set':'neutral','duration':1,'camera':{'from':[0,-3,2],'look_at':[0,0,1]}}
        validate_shot({**base,'composition':{'face_max':.4,'wave_min':.25,'emotion':False}})
        for changes in ({'face_max':.5},{'wave_min':.2}):
            with self.assertRaises(ValueError):validate_shot({**base,'composition':{'face_max':.4,'wave_min':.25,'emotion':False,**changes}})