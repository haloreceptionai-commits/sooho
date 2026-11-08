import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parent

class WorkflowTests(unittest.TestCase):
    def test_changed_voice_is_rejected_before_render(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);voice=root/'voice.wav';voice.write_bytes(b'changed')
            manifest=root/'manifest.json';manifest.write_text(json.dumps({'narration':{'sha256':'a'*64}}))
            result=subprocess.run([sys.executable,str(ROOT/'workflow.py'),'--manifest',str(manifest),'--voice',str(voice),'--work',str(root/'work'),'--mode','finish','--twist-frame','0'],capture_output=True,text=True)
            self.assertNotEqual(result.returncode,0)
            self.assertIn('Locked narration checksum changed',result.stderr)
            self.assertFalse((root/'work'/'frames').exists())

    def test_changed_immutable_manifest_is_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);voice=root/'voice.wav';voice.write_bytes(b'voice')
            manifest=root/'manifest.json';manifest.write_text(json.dumps({'narration':{'sha256':hashlib.sha256(b'voice').hexdigest()}}))
            work=root/'work';work.mkdir();(work/'workflow.json').write_text(json.dumps({'input_hash':'old','stages':{}}))
            result=subprocess.run([sys.executable,str(ROOT/'workflow.py'),'--manifest',str(manifest),'--voice',str(voice),'--work',str(work),'--mode','finish','--twist-frame','0'],capture_output=True,text=True)
            self.assertNotEqual(result.returncode,0)
            self.assertIn('Immutable job inputs changed',result.stderr)

if __name__=='__main__':unittest.main()