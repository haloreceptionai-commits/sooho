import importlib.util, tempfile, wave, unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('manifest_builder',Path(__file__).with_name('build-manifest.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class ManifestBuilderTests(unittest.TestCase):
 def test_exact_clock_and_invalid_alignment(self):
  with tempfile.TemporaryDirectory() as d:
   voice=Path(d)/'voice.wav'
   with wave.open(str(voice),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(48000);w.writeframes(b'\0\0'*48000)
   request={'videoId':'test','script':'pour','narration':['pour'],'sfx':True,'direction':{'cast':[{'id':'hero','seed':3,'outfit':'sailor'}],'scenes':[{'world':'ship','light':'day','action':'pour','expression':'neutral','actor':'hero','wide':False}]}}
   alignment={'words':[{'text':'pour','start':.2,'end':.5,'confidence':.4}]}
   manifest=module.build(request,alignment,voice)
   self.assertEqual(manifest['shots'][-1]['end'],30);self.assertEqual(manifest['words'][0]['confidence'],.4)
   alignment['words'][0]['end']=1.1
   with self.assertRaisesRegex(ValueError,'timing'):module.build(request,alignment,voice)
 def test_mismatched_spoken_words_block(self):
  with tempfile.TemporaryDirectory() as d:
   voice=Path(d)/'voice.wav'
   with wave.open(str(voice),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(48000);w.writeframes(b'\0\0'*48000)
   with self.assertRaisesRegex(ValueError,'differs'):module.build({'script':'pour','narration':['pour'],'direction':{'scenes':[{}]}},{'words':[{'text':'crash','start':.2,'end':.5,'confidence':.9}]},voice)
if __name__=='__main__':unittest.main()