import unittest
from script_picture import check, judge_accepts


class ScriptPictureTest(unittest.TestCase):
    def draft(self):
        return {'sentences': [{'text': 'Steel rails grow when hot and push hard against the joint.',
                               'fact_ids': ['heat'], 'picture': ['obj:rail_joint:expand']}
                              for _ in range(17)]}

    def test_every_sentence_requires_real_drawable_identity(self):
        draft = self.draft(); draft['sentences'][3]['picture'] = ['obj:magic_train']
        self.assertIn('s3: picture needs existing drawable concepts', check(draft, {'facts': [{'id': 'heat'}]}))

    def test_every_sentence_requires_supplied_fact(self):
        draft = self.draft(); draft['sentences'][0]['fact_ids'] = ['invented']
        self.assertIn('s0: missing or invented evidence id', check(draft, {'facts': [{'id': 'heat'}]}))

    def test_unknown_noun_cannot_be_accepted_by_empty_judge_response(self):
        self.assertFalse(judge_accepts({}, {'candidate': 'A', 'benchmark': 'B'}, 17))

    def vote(self):
        score = {'clarity': 8, 'cause_effect': 8, 'engagement': 8, 'kid_clear': True, 'opening': True}
        return {'scores': {'A': score.copy(), 'B': score.copy()}, 'unsupported': [], 'undrawable': [],
                'candidate_sentences': [{'index': i, 'evidence_ok': True, 'picture_ok': True} for i in range(17)]}

    def test_acceptance_requires_benchmark_parity_not_self_score(self):
        result = self.vote(); result['scores']['B']['engagement'] = 9
        self.assertFalse(judge_accepts(result, {'candidate': 'A', 'benchmark': 'B'}, 17))

    def test_subject_and_action_in_first_three_words_are_required(self):
        result = self.vote(); result['scores']['A']['opening'] = False
        self.assertFalse(judge_accepts(result, {'candidate': 'A', 'benchmark': 'B'}, 17))

    def test_eight_year_old_comprehension_is_required(self):
        result = self.vote(); result['scores']['A']['kid_clear'] = False
        self.assertFalse(judge_accepts(result, {'candidate': 'A', 'benchmark': 'B'}, 17))

    def test_missing_or_duplicate_sentence_identity_rejected(self):
        result = self.vote(); result['candidate_sentences'][-1]['index'] = 0
        self.assertFalse(judge_accepts(result, {'candidate': 'A', 'benchmark': 'B'}, 17))

    def test_shuffled_complete_sentence_reviews_accepted(self):
        result = self.vote(); result['candidate_sentences'].reverse()
        self.assertTrue(judge_accepts(result, {'candidate': 'A', 'benchmark': 'B'}, 17))

    def test_unsupported_outcome_rejected(self):
        result = self.vote(); result['unsupported'] = ['There was real gold behind the wall']
        self.assertFalse(judge_accepts(result, {'candidate': 'A', 'benchmark': 'B'}, 17))