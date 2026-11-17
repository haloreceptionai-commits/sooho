"""Caption templates and UI elements: planning rules, determinism, safe screen areas and the camera projection used by highlights."""
import unittest
import numpy as np
from PIL import Image, ImageChops
import ui_overlays as U

W, H = 1080, 1920


def frame(color=(70, 110, 160)): return Image.new('RGB', (W, H), color)


def changed_box(a, b):
    return ImageChops.difference(a, b).getbbox()


def words(text, start=0.0, step=.4):
    ws = []
    for i, t in enumerate(text.split()):
        ws.append({'text': t.lower().strip('.,!?'), 'start': start + i * step, 'end': start + i * step + step * .9})
    return {'words': ws, 'caption_words': text.split()}


class PlanTests(unittest.TestCase):
    def test_trigger_words_make_the_right_elements(self):
        kinds = lambda s: [e['kind'] for e in U.plan(words(s))]
        self.assertEqual(kinds('please subscribe now'), ['subscribe'])
        self.assertEqual(kinds('he texted me the answer fast'), ['chat'])
        self.assertEqual(kinds('this will level up your game'), ['levelup'])
        self.assertEqual(kinds('the damage was huge'), ['health'])
        self.assertEqual(kinds('you unlocked a hidden room'), ['achievement', 'highlight'][:1])
        self.assertEqual(kinds('the dead king'), ['sticker'])
        self.assertEqual(kinds('nothing special happens here at all'), [])

    def test_chat_shows_the_words_that_follow_the_trigger(self):
        ev = U.plan(words('Then he texted I can not believe it worked at all'))[0]
        self.assertEqual(ev['kind'], 'chat'); self.assertTrue(ev['text'].startswith('I can not believe'))

    def test_one_element_at_a_time_and_minimum_gaps_and_a_single_subscribe(self):
        m = words('dead dead dead dead subscribe please subscribe again dead rich', step=.3)
        ev = U.plan(m)
        for a, b in zip(ev, ev[1:]): self.assertLessEqual(a['end'], b['start'])
        self.assertEqual(len([e for e in ev if e['kind'] == 'subscribe']), 1)
        st = [e for e in ev if e['kind'] == 'sticker']
        for a, b in zip(st, st[1:]): self.assertGreaterEqual(b['start'] - a['start'], U.GAP['sticker'] * U.FPS)

    def test_subscribe_cuts_a_long_running_element_short_but_never_the_other_way_round(self):
        ev = U.plan(words('level up now please subscribe', step=.5))     # level up starts at 0.0 s, subscribe at 1.5 s
        self.assertEqual([e['kind'] for e in ev], ['levelup', 'subscribe']); self.assertEqual(ev[0]['end'], ev[1]['start'])
        ev = U.plan(words('please subscribe now level up', step=.5))
        self.assertEqual([e['kind'] for e in ev], ['subscribe'])          # subscribe is already on screen: the lesser element waits

    def test_stickers_alternate_sides(self):
        m = words('dead ' + 'x ' * 12 + 'fire ' + 'x ' * 12 + 'rich', step=.3)
        self.assertEqual([e['side'] for e in U.plan(m) if e['kind'] == 'sticker'], [-1, 1, -1])

    def test_every_word_trigger_points_at_a_known_element(self):
        for w, icon in U.STICKER_FOR.items(): self.assertIn(icon, U.STICKERS)


class DrawTests(unittest.TestCase):
    def test_every_sticker_is_a_clean_transparent_square(self):
        for icon in U.STICKERS:
            with self.subTest(icon=icon):
                im = U.sticker(icon, 200); self.assertEqual(im.size, (200, 200)); a = np.array(im.getchannel('A'))
                self.assertGreater(a.mean(), 25); self.assertEqual(int(a[0, 0]), 0)    # drawn, and the corner stays transparent
        with self.assertRaises(ValueError): U.sticker('nope', 100)

    def test_elements_stay_in_the_top_half_clear_of_captions_and_the_shorts_buttons(self):
        events = [{'kind': 'sticker', 'icon': 'shock', 'side': 1, 'start': 0, 'end': 60}, {'kind': 'subscribe', 'start': 0, 'end': 90},
                  {'kind': 'chat', 'text': 'a longer message that wraps onto a second line okay', 'incoming': True, 'start': 0, 'end': 90},
                  {'kind': 'health', 'start': 0, 'end': 80}, {'kind': 'levelup', 'start': 0, 'end': 60}, {'kind': 'achievement', 'text': 'Crossed the Alps', 'start': 0, 'end': 90},
                  {'kind': 'xp', 'text': '+100 XP', 'start': 0, 'end': 50}]
        for ev in events:
            for f in (12, 30, 50):
                if f >= ev['end']: continue
                with self.subTest(kind=ev['kind'], f=f):
                    base = frame(); img = U.draw(base.copy(), [ev], f); box = changed_box(base, img)
                    self.assertIsNotNone(box); self.assertLess(box[3], H * .45)         # nothing near the caption row (70%) or the bottom controls
                    self.assertGreaterEqual(box[0], 0); self.assertLessEqual(box[2], W)

    def test_drawing_is_deterministic_and_fades_to_nothing_at_both_ends(self):
        ev = {'kind': 'sticker', 'icon': 'love', 'side': -1, 'start': 10, 'end': 70}
        a, b = U.draw(frame(), [ev], 40), U.draw(frame(), [ev], 40)
        self.assertEqual(ImageChops.difference(a, b).getbbox(), None)
        self.assertIsNone(changed_box(frame(), U.draw(frame(), [ev], 5)))             # before it starts
        self.assertIsNone(changed_box(frame(), U.draw(frame(), [ev], 70)))            # after it ends
        self.assertIsNone(changed_box(frame(), U.draw(frame(), [ev], 10)))            # first frame: scale 0, opacity 0

    def test_subscribe_turns_grey_once_clicked(self):
        ev = {'kind': 'subscribe', 'start': 0, 'end': 90}
        before, after = U.draw(frame(), [ev], 25), U.draw(frame(), [ev], 70)
        px = lambda im: np.array(im.crop((int(W * .45), int(H * .22), int(W * .6), int(H * .26)))).reshape(-1, 3).mean(0)
        self.assertGreater(px(before)[0] - px(before)[1], 50)                           # red button
        self.assertLess(abs(px(after)[0] - px(after)[1]), 40)                           # grey after the click

    def test_health_bar_drains_and_changes_colour(self):
        ev = {'kind': 'health', 'start': 0, 'end': 80}
        bar = lambda f: np.array(U.draw(frame((0, 0, 0)), [ev], f).crop((int(W * .1), int(H * .1), int(W * .6), int(H * .13)))).astype(int)
        early, late = bar(10), bar(70)
        green = lambda a: int(((a[:, :, 1] > 180) & (a[:, :, 0] < 120)).sum()); self.assertGreater(green(early), 3 * max(1, green(late)) or 1)

    def test_highlight_without_a_target_draws_nothing_and_with_one_draws_around_it(self):
        ev = {'kind': 'highlight', 'style': 'circle', 'start': 0, 'end': 60}
        self.assertIsNone(changed_box(frame(), U.draw(frame(), [ev], 30, None)))
        box = changed_box(frame(), U.draw(frame(), [ev], 30, (540, 800, 400)))
        cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
        self.assertLess(abs(cx - 540), 60); self.assertLess(abs(cy - 800), 60)


class CaptionTests(unittest.TestCase):
    LINE = [{'text': 'the', 'key': False, 'live': False, 'shown': True, 'age': 40}, {'text': '217', 'key': False, 'live': False, 'shown': True, 'age': 12},
            {'text': 'army', 'key': True, 'live': True, 'shown': True, 'age': 20}]

    def test_every_template_draws_inside_the_caption_row_and_never_off_screen(self):
        for style in U.STYLES:
            with self.subTest(style=style):
                base = frame(); img = U.burn_caption(base.copy(), self.LINE, style); box = changed_box(base, img)
                self.assertIsNotNone(box); self.assertGreater(box[1], H * .6); self.assertLess(box[3], H * .8)
                self.assertGreaterEqual(box[0], W * .03); self.assertLessEqual(box[2], W * .97)

    def test_long_words_shrink_to_fit_the_frame(self):
        line = [{'text': w, 'key': False, 'live': False, 'shown': True, 'age': 40} for w in ('extraordinarily', 'uncharacteristically', 'incomprehensible')]
        base = frame(); img = U.burn_caption(base.copy(), line, 'bold'); box = changed_box(base, img)
        self.assertGreaterEqual(box[0], 0); self.assertLessEqual(box[2], W)

    def test_key_numbers_and_danger_words_get_their_own_colours(self):
        self.assertEqual(U._word_color('army', True), U.YELLOW); self.assertEqual(U._word_color('217', False), U.GREEN)
        self.assertEqual(U._word_color('War', False), U.RED); self.assertEqual(U._word_color('the', False), U.WHITE)

    def test_pop_template_grows_a_new_word_and_settles(self):
        def width(age):
            line = [dict(self.LINE[2], age=age)]; base = frame(); img = U.burn_caption(base.copy(), line, 'pop'); b = changed_box(base, img); return b[2] - b[0]
        self.assertLess(width(1), width(8)); self.assertAlmostEqual(width(30), width(60), delta=3)

    def test_style_choice_is_validated(self):
        self.assertEqual(U.caption_style({'caption_style': 'neon'}), 'neon'); self.assertEqual(U.caption_style({'caption_style': 'evil'}), 'bold'); self.assertEqual(U.caption_style({}), 'bold')

    def test_nothing_shown_draws_nothing(self):
        base = frame(); self.assertIsNone(changed_box(base, U.burn_caption(base.copy(), [dict(w, shown=False) for w in self.LINE], 'bold')))


class ProjectionTests(unittest.TestCase):
    SHOT = {'duration': 2.0, 'camera': {'from': [0, -6, 1.5], 'to': [0, -6, 1.5], 'look_at': [0, 2, 1.5], 'lens': 35}, 'cast': []}

    def test_the_aim_point_lands_in_the_middle_of_the_frame(self):
        x, y, s = U.project(self.SHOT, 1, [0, 2, 1.5]); self.assertAlmostEqual(x, 540, delta=1); self.assertAlmostEqual(y, 960, delta=1)

    def test_right_and_up_move_the_right_way_and_depth_scales_size(self):
        x, y, s = U.project(self.SHOT, 1, [1, 2, 2.5]); self.assertGreater(x, 540); self.assertLess(y, 960)
        near = U.project(self.SHOT, 1, [0, -2, 1.5])[2]; far = U.project(self.SHOT, 1, [0, 6, 1.5])[2]; self.assertGreater(near, far)

    def test_behind_the_camera_or_off_screen_is_none(self):
        self.assertIsNone(U.project(self.SHOT, 1, [0, -9, 1.5])); self.assertIsNone(U.project(self.SHOT, 1, [30, 2, 1.5]))

    def test_the_camera_move_is_eased_like_the_renderer(self):
        moving = {**self.SHOT, 'camera': {**self.SHOT['camera'], 'to': [3, -6, 1.5]}}
        n = round(2.0 * 30); xs = [U.project(moving, k, [0, 2, 1.5])[0] for k in (1, n // 2, n)]
        self.assertTrue(all(abs(x - 540) < 1 for x in xs))                 # the aim point stays in the middle of the frame however the camera slides
        side = [U.project(moving, k, [.8, -1, 1.5])[0] for k in (1, 15, 30, 45, 60)]
        self.assertTrue(all(a > b for a, b in zip(side, side[1:])))        # a point near the camera sweeps left as the camera slides right
        self.assertGreater(side[1] - side[2], side[0] - side[1])           # eased: slow start, fast middle (smoothstep, as the renderer keys it)

    def test_a_running_head_travels_with_the_character(self):
        c = {'id': 'a', 'pos': [0, 2.6], 'yaw': 90.0, 'action': 'run'}
        a, b = U.head_position(c, 1), U.head_position(c, 31)
        self.assertGreater(b[0], a[0] + .5); self.assertAlmostEqual(a[1], b[1], delta=.01)    # yaw 90: runs along +x
        self.assertGreater(a[2], 1.5)
        s = U.head_position({'id': 'a', 'pos': [0, 0], 'action': 'stand'}, 1); self.assertAlmostEqual(s[2], 1.735, delta=.02)

    def test_target_prefers_a_prop_then_the_head(self):
        shot = {**self.SHOT, 'objects': [{'kind': 'x', 'pos': [1, 2, 0]}], 'cast': [{'id': 'a', 'pos': [0, 2], 'action': 'stand'}]}
        self.assertEqual(U.target_point(shot)[:2], [1, 2]); shot['objects'] = []; self.assertEqual(U.target_point(shot)[:2], [0, 2]); self.assertIsNone(U.target_point(self.SHOT))


if __name__ == '__main__': unittest.main()
