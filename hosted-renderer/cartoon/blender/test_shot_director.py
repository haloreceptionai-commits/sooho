import unittest
import shot_director as D

STORY={'words':[{'w':w,'t':i*0.5} for i,w in enumerate('He loaded the shotgun and fired it. His buddy laughs.'.split())]}
CAST=[{'id':'miner','outfit':'worker','hat':'beanie'},{'id':'buddy','outfit':'worker','hat':'none'}]


def good():
    return {'cast':CAST,'worlds':['mine_tunnel','castle'],'sentences':[
        {'index':0,'mentions':[{'word':'shotgun','kind':'thing','concept':'obj:gold_shotgun'}],'shots':[
            {'set':'mine_tunnel','lighting':'day','framing':'insert','cast':[{'id':'miner','action':'load'}],'objects':[{'kind':'gold_shotgun','action':'load'}]},
            {'start_word':5,'set':'castle','lighting':'day','framing':'insert','cast':[],'objects':[{'kind':'gold_shotgun','action':'fire'}]}]},
        {'index':1,'mentions':[],'shots':[{'set':'mine_tunnel','lighting':'night','framing':'medium','cast':[{'id':'buddy','action':'cheer','expression':'happy'}],'objects':[]}]}]}


class ShotDirectorTest(unittest.TestCase):
    def errs(self,plan,concrete=None):
        e,_=D.validate_plan(plan,STORY,concrete);return [x for x in e if 'set changes' not in x and 'mean shot' not in x]

    def test_complete_plan_has_no_coverage_errors(self):
        self.assertEqual(self.errs(good()),[])

    def test_spoken_object_action_must_be_on_screen(self):
        p=good();p['sentences'][0]['shots'][1]['objects']=[{'kind':'gold_shotgun','action':'hold'}]
        self.assertIn('s0: spoken obj:gold_shotgun:fire not shown',self.errs(p))

    def test_invented_mentions_rejected(self):
        p=good();p['sentences'][1]['mentions']=[{'word':'dynamite','kind':'thing','concept':'obj:dynamite'}]
        self.assertTrue(any('invented mention' in e for e in self.errs(p)))

    def test_undrawable_concrete_thing_fails_but_abstract_does_not(self):
        p=good();p['sentences'][1]['mentions']=[{'word':'buddy','kind':'thing','concept':None}]
        self.assertTrue(any('no drawable concept' in e for e in self.errs(p)))
        p['sentences'][1]['mentions']=[{'word':'laughs','kind':'abstract','concept':None}]
        self.assertEqual(self.errs(p),[])

    def test_one_or_two_shots_per_sentence(self):
        p=good();p['sentences'][1]['shots']*=3
        self.assertIn('s1: needs 1-2 shots, got 3',self.errs(p))

    def test_independent_reader_words_must_be_shown(self):
        self.assertTrue(any('word:buddy' in e for e in self.errs(good(),{1:['buddy']}))==False)
        p=good();p['sentences'][1]['shots'][0]['cast']=[]
        self.assertTrue(any('word:buddy' in e for e in self.errs(p,{1:['buddy']})))

    def test_compiled_shots_are_schema_valid_and_cover_the_audio(self):
        shots=D.compile_plan(good(),STORY)
        self.assertEqual(len(shots),3)
        self.assertAlmostEqual(sum(s['duration'] for s in shots),STORY['words'][-1]['t']+.45)
        self.assertEqual(shots[1]['_words'],'fired it.')

    def test_pacing_band_matches_benchmark(self):
        _,r=D.validate_plan(good(),STORY)
        self.assertEqual(r['set_changes_per_min'],round(2/4.95*60,2))
        self.assertEqual(D.PACE['set_changes_per_min'],(12.0,22.0))


class RelevanceTest(unittest.TestCase):
    def test_unspoken_props_are_rejected(self):
        p=good();p['sentences'][1]['shots'][0]['objects']=[{'kind':'dynamite','action':'hold'}]
        e,_=D.validate_plan(p,STORY);self.assertTrue(any('dynamite is not spoken' in x for x in e))

    def test_sets_outside_story_worlds_are_rejected(self):
        p=good();p['sentences'][1]['shots'][0]['set']='ship_deck'
        e,_=D.validate_plan(p,STORY);self.assertTrue(any('set ship_deck is not a story world' in x for x in e))
        p['worlds']=['a','b','c'];e,_=D.validate_plan(good()|{'worlds':['mine_tunnel','castle','room']},STORY)
        self.assertIn('at most 2 extra worlds',e)

    def test_zone_changes_count_as_backdrop_changes(self):
        p=good();shots=D.compile_plan(p,STORY);self.assertEqual([s['_zone'] for s in shots],['entrance','center','entrance'])
        with self.assertRaises(ValueError):D.compile_one({'set':'mine_tunnel','zone':'moon','framing':'wide'},p,1)


class TimingTest(unittest.TestCase):
    def test_estimated_timing_spans_measured_length_and_is_monotonic(self):
        w=D.estimated_timing(STORY['words'],10)
        self.assertEqual(w[0]['t'],0);self.assertTrue(all(a['t']<b['t'] for a,b in zip(w,w[1:])))
        self.assertLess(w[-1]['t'],10);self.assertGreater(w[-1]['t'],9)
        self.assertEqual(D.syllables('shotgun'),2);self.assertEqual(D.syllables('82'),2)
