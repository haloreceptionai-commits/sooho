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
class VisualDirectorTests(unittest.TestCase):
 def build(self,scene,words,seconds=6):
  d=tempfile.mkdtemp();voice=Path(d)/'voice.wav'
  with wave.open(str(voice),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(48000);w.writeframes(b'\0\0'*48000*seconds)
  script=' '.join(words);al={'words':[{'text':t,'start':.2+i*.5,'end':.6+i*.5,'confidence':.9} for i,t in enumerate(words)]}
  base={'world':'ship','light':'day','action':'idle','expression':'neutral','actor':'hero','wide':False}
  req={'videoId':'t','script':script,'narration':[script],'sfx':True,'captions':True,'direction':{'cast':[{'id':'hero','seed':3,'outfit':'sailor'},{'id':'cap','seed':9,'outfit':'captain'}],'scenes':[{**base,**scene}]}}
  return module.build(req,al,voice)
 def test_two_actors_both_fit_the_vertical_frame(self):
  import math
  m=self.build({'shot':'medium','actors':[{'actor':'cap','action':'grab','expression':'stern','slot':'left','facing':1},{'actor':'hero','action':'react','expression':'shock','slot':'right','facing':-1}]},['his','captain','grabs','him'],3)
  k=m['shots'][0]['camera'][0];hfov=2*math.atan(math.tan(math.radians(k['fov'])/2)*9/16)
  for a in m['shots'][0]['actors']:
   self.assertLess(abs(a['pos'][0]-k['look'][0]),math.tan(hfov/2)*abs(k['pos'][2])-.3)
 def test_long_sentence_gets_a_second_angle_on_a_word(self):
  m=self.build({'shot':'wide'},['a','very','long','line','that','keeps','going','on','and','on'],6)
  self.assertEqual(len(m['shots']),2);self.assertEqual(m['shots'][1]['shot'],'close')
  self.assertIn(m['shots'][1]['start'],[module.jsround(w['start']*30) for w in m['words']])
 def test_reveal_keyword_and_director_cues(self):
  m=self.build({'mood':'reveal','keyword':'Calm','cues':[{'word':1,'kind':'bell'}]},['oil','can','calm','waves'],3)
  s=m['shots'][0];kinds={e['kind'] for e in s['events']}
  self.assertEqual(s['keyword'],2);self.assertTrue({'reveal','bell'}<=kinds);self.assertTrue(m['captions'])
if __name__=='__main__':unittest.main()