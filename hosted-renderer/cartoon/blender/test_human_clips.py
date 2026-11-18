import unittest
from human_clips import MODELS, resolve_clip, clip_frame


class UploadedHumans(unittest.TestCase):
    def test_selected_files(self):
        self.assertEqual(MODELS, {'uploaded-woman': 'Casual.fbx', 'uploaded-man': 'Casual_Hoodie.fbx', 'ual-mannequin': 'ual_mannequin.glb'})

    def test_walk_uses_walk(self):
        self.assertEqual(resolve_clip('walk', ['rig|Walk', 'rig|Run']), 'rig|Walk')

    def test_no_fake_carry(self):
        with self.assertRaises(ValueError):
            resolve_clip('carry', ['rig|Interact', 'rig|Idle_Neutral'])

    def test_fall_holds_last_frame(self):
        self.assertEqual(clip_frame('fall', 9, 1, 33), 33)

    def test_unknown_models_not_selected(self):
        self.assertNotIn('ship', MODELS)
        self.assertNotIn('city', MODELS)