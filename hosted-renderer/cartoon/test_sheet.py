import importlib.util
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('contact_sheet',Path(__file__).with_name('contact-sheet.py'))
if spec is None or spec.loader is None: raise RuntimeError('Missing sheet module')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class SheetTests(unittest.TestCase):
    def test_full_duration_and_action_boundaries(self):
        frames=module.preflight_frames([{'start':0,'end':900,'events':[]},{'start':900,'end':1800,'events':[{'word':0,'lead':3}]}],[{'start':45}],1800)
        self.assertIn(1799,frames)
        self.assertIn(1347,frames)
        self.assertIn(1346,frames)
        self.assertIn(1348,frames)
        self.assertIn(900,frames)

if __name__=='__main__':unittest.main()