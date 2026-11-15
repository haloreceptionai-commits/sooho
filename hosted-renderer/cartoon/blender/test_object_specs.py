import unittest
from object_specs import OBJECTS,validate_object,holes,mechanism


class ObjectsTest(unittest.TestCase):
    def test_ten_reference_grounded_objects(self):
        self.assertEqual(len(OBJECTS),11)
        self.assertEqual(set(s['source'] for s in OBJECTS.values()),{'cart','mine','rail'})

    def test_cart_has_exactly_82_unique_apertures(self):
        self.assertEqual(len(set(holes())),82)

    def test_untrusted_shapes_scripts_and_paths_rejected(self):
        for extra in [{'script':'print(1)'},{'path':'/tmp/x'},{'kind':'invented'}]:
            with self.assertRaises(ValueError):validate_object({'kind':'gold_pan','pos':[0,0,0],**extra})

    def test_only_drawable_actions_allowed(self):
        with self.assertRaises(ValueError):validate_object({'kind':'gold_pan','pos':[0,0,0],'action':'drill'})
        self.assertEqual(validate_object({'kind':'gold_pan','pos':[0,0,0],'action':'pour'})['action'],'pour')

    def test_mechanisms_move(self):
        for action,key in [('open','open'),('drill','spin'),('fire','travel'),('pour','tilt'),('load','load'),('explode','burst'),('swing','swing')]:
            self.assertNotEqual(mechanism(action,0)[key],mechanism(action,.2)[key])

    def test_nonfinite_and_extreme_transforms_rejected(self):
        for extra in [{'scale':float('nan')},{'pos':[0,float('inf'),0]},{'scale':100}]:
            with self.assertRaises(ValueError):validate_object({'kind':'gold_pan','pos':[0,0,0],**extra})