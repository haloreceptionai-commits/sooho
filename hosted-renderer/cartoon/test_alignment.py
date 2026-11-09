import unittest
import numpy as np
from alignment import align_ctc,align_words

class AlignmentTests(unittest.TestCase):
    def test_repeated_letters_require_blank(self):
        p=np.log(np.array([[.01,.99],[.99,.01],[.01,.99]]))
        result=align_ctc(p,[1,1])
        self.assertEqual(result[0]['start_frame'],0)
        self.assertEqual(result[1]['start_frame'],2)

    def test_impossible_alignment_stops(self):
        with self.assertRaises(ValueError): align_ctc(np.log(np.array([[.1,.9]])),[1,1])

    def test_exact_word_clock_and_confidence(self):
        p=np.log(np.array([[.01,.99,.0001],[.01,.99,.0001],[.99,.01,.0001]]))
        result=align_words(p,'A',{'A':1,'|':2},.3)
        self.assertAlmostEqual(result['words'][0]['end'],.2)
        self.assertFalse(result['review_required'])

    def test_uncertain_audio_is_not_certified(self):
        p=np.log(np.array([[.4,.6],[.4,.6]]))
        self.assertTrue(align_words(p,'A',{'A':1},.2)['review_required'])

    def test_numbers_never_guessed(self):
        with self.assertRaisesRegex(ValueError,'spoken'):
            align_words(np.zeros((3,2)),'30',{'A':1},.3)

    def test_raw_logits_rejected(self):
        with self.assertRaisesRegex(ValueError,'normalized'):
            align_ctc(np.array([[2.,3.],[3.,2.]]),[1])

    def test_vectorized_matches_scalar_paths_and_ties(self):
        def scalar(p,tokens):
            states=[0]
            for t in tokens: states.extend([t,0])
            previous=np.full(len(states),-np.inf);previous[0]=p[0,0];previous[1]=p[0,tokens[0]]
            back=np.full((len(p),len(states)),-1,dtype=int)
            for f in range(1,len(p)):
                current=np.full(len(states),-np.inf)
                for s,t in enumerate(states):
                    choices=[s]+([s-1] if s else [])+([s-2] if s>1 and t!=0 and t!=states[s-2] else [])
                    best=max(choices,key=lambda x:previous[x]);current[s]=previous[best]+p[f,t];back[f,s]=best
                previous=current
            s=max([len(states)-1,len(states)-2],key=lambda x:previous[x]);path=[]
            for f in range(len(p)-1,-1,-1):
                path.append(s)
                if f:s=int(back[f,s])
            path=path[::-1];out=[]
            for i,t in enumerate(tokens):
                fs=[f for f,s in enumerate(path) if s==2*i+1]
                out.append({'start_frame':fs[0],'end_frame':fs[-1]+1,'confidence':float(np.exp(np.mean(p[fs,t])))})
            return out
        rng=np.random.default_rng(42)
        for trial in range(25):
            raw=rng.random((60,4)) if trial else np.ones((60,4))
            p=np.log(raw/raw.sum(axis=1,keepdims=True));tokens=[1,1,2,3,2]
            self.assertEqual(align_ctc(p,tokens),scalar(p,tokens))

if __name__ == '__main__': unittest.main()