import unittest
from camera_fit import fit_camera_keys

class CameraFitTests(unittest.TestCase):
    def test_close_camera_backs_off_for_full_card_bounds(self):
        key={'pos':[0,1.5,1], 'look':[0,1.2,0], 'fov':38}
        fitted=fit_camera_keys([key],[{'pos':[0,0,0]}],9/16)[0]
        self.assertGreater(fitted['pos'][2],3)
        self.assertEqual(fitted['look'],key['look'])
        self.assertEqual(key['pos'],[0,1.5,1])

    def test_wide_camera_is_unchanged(self):
        key={'pos':[0,1.8,10], 'look':[0,1.2,0], 'fov':42}
        self.assertEqual(fit_camera_keys([key],[{'pos':[0,0,0]}],9/16),[key])

    def test_each_endpoint_is_fitted(self):
        keys=[{'pos':[0,1.5,z], 'look':[0,1.2,0], 'fov':38} for z in [1,2]]
        fitted=fit_camera_keys(keys,[{'pos':[0,0,0]}],9/16)
        self.assertTrue(all(k['pos'][2]>3 for k in fitted))