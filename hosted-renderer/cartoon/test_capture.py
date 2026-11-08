import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from PIL import Image
from capture import fingerprint, valid_frame
from finish import validate_frames

class CheckpointTests(unittest.TestCase):
    def test_valid_frame_requires_matching_checksum_and_dimensions(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'f000000.jpg'
            Image.new('RGB', (1080, 1920), 'red').save(p)
            record = {'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
            self.assertTrue(valid_frame(p, record))
            self.assertFalse(valid_frame(p, {'sha256': 'wrong'}))
            p.write_bytes(b'partial')
            self.assertFalse(valid_frame(p, record))

    def test_incomplete_frames_cannot_encode(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / 'checkpoint.json').write_text(json.dumps({'frames': {}}))
            with self.assertRaisesRegex(ValueError, 'Missing'):
                validate_frames(root, 1800)

    def test_changed_scene_invalidates_fingerprint(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d); p = root / 'story.js'; p.write_text('one')
            before = fingerprint(root); p.write_text('two')
            self.assertNotEqual(before, fingerprint(root))

if __name__ == '__main__': unittest.main()

class GlBackendTest(unittest.TestCase):
    def test_forced_backends(self):
        from capture import gl_args
        self.assertIn('--use-angle=swiftshader', gl_args({'CARTOON_GL': 'swiftshader'}))
        self.assertIn('--use-angle=vulkan', gl_args({'CARTOON_GL': 'vulkan'}))

    def test_auto_uses_vulkan_only_with_a_driver(self):
        from capture import gl_args
        with tempfile.TemporaryDirectory() as d:
            icd = Path(d) / 'lvp.json'; icd.write_text('{}')
            self.assertIn('--use-angle=vulkan', gl_args({'VK_ICD_FILENAMES': str(icd)}))
        missing = gl_args({'VK_ICD_FILENAMES': '/nonexistent.json'})
        if not Path('/usr/share/vulkan/icd.d/lvp_icd.x86_64.json').exists():
            self.assertIn('--use-angle=swiftshader', missing)
