import numpy as np
import measure, scorecard


def _lab(i, **kw):
    base = {'i': i, 'shot_type': 'medium', 'camera': 'static', 'distinct_framings': 1, 'set': 'classroom', 'set_detail': '',
            'objects': [], 'spoken_visible': 'no', 'action': 'none', 'effects': [], 'characters': 3, 'lighting': 'flat',
            'depth': 2, 'environment_richness': 2, 'character_quality': 2, 'render_quality': 2, 'note': ''}
    return {**base, **kw}


def _measure(n, length):
    return {'duration': n * length, 'audio': {'lufs': -14.0, 'transients_per_min': 30},
            'shots': [{'len': length, 'sharpness': 1000, 'colorfulness': 50} for _ in range(n)]}


RICH = [_lab(i, shot_type=t, camera='tracking', distinct_framings=2, set=f'place {i % 9}', spoken_visible='yes',
             action='he lights the rope', effects=['sparks'], lighting=['day_sun', 'night', 'sunset'][i % 3],
             depth=8, environment_richness=9, character_quality=8, render_quality=9)
        for i, t in enumerate(['wide', 'object_insert', 'action', 'crowd', 'character_closeup', 'effect'] * 5)]


def test_benchmark_matches_its_own_target():
    m = scorecard.metrics(_measure(30, 2.0), RICH)
    assert scorecard.score(m, scorecard.targets([m]))['overall'] == 100.0


def test_one_flat_room_scores_far_below_benchmark():
    target = scorecard.targets([scorecard.metrics(_measure(30, 2.0), RICH)])
    flat = scorecard.metrics(_measure(15, 4.0), [_lab(i) for i in range(15)])
    s = scorecard.score(flat, target)
    assert s['overall'] < 40
    assert s['parts']['set_changes_per_min'] == 0 and s['parts']['spoken_visible_rate'] == 0


def test_longer_shots_lower_the_rhythm_score():
    target = {k: 1 for k, _, _ in scorecard.WEIGHTS} | {'median_shot_len': 2.0}
    m = scorecard.metrics(_measure(10, 4.0), RICH[:10])
    assert scorecard.score(m, target)['parts']['median_shot_len'] == 50.0


def test_filtered_shots_are_excluded_not_counted_as_failures():
    m = scorecard.metrics(_measure(3, 2.0), RICH[:2] + [{'i': 2, 'error': 'filtered'}])
    assert m['labelled_shots'] == 2 and m['unlabelled_shots'] == 1 and m['spoken_visible_rate'] == 1.0


def test_loudness_off_target_loses_points():
    m = scorecard.metrics(_measure(30, 2.0), RICH)
    quiet = {**m, 'lufs': -18.0}
    assert scorecard.score(quiet, scorecard.targets([m]))['parts']['loudness'] == 0.0


def test_transcript_words_get_times_from_caption_anchors():
    caps = [{'t': 1.0, 'text': 'loaded'}, {'t': 3.0, 'text': 'gold'}]
    timed = measure.time_transcript('He loaded the shotgun with gold', caps, 4.0)
    t = {w['w']: w['t'] for w in timed}
    assert t['loaded'] == 1.0 and t['gold'] == 3.0
    assert 1.0 < t['the'] < t['shotgun'] < t['with'] < 3.0


def test_cut_detector_finds_hard_cut_and_ignores_static():
    a = np.zeros((20, measure.LOW_H, measure.LOW_W, 3), np.uint8) + 40
    b = np.zeros((20, measure.LOW_H, measure.LOW_W, 3), np.uint8); b[..., 0] = 220; b[..., 1] = 180
    cuts = measure.detect_cuts(np.concatenate([a, b]))
    assert cuts == [0, 20]
