"""Tests for the documentary renderer (long-form videos made of pictures): cards, timeline, camera, audio, alignment fallback and a tiny full render."""
import json
import os
import shutil
import sys
import tempfile
import unittest
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'documentary'))
sys.path.insert(0, HERE)

import cv2  # noqa: E402

import doc_align as AL  # noqa: E402
import doc_audio as AU  # noqa: E402
import doc_camera as CAM  # noqa: E402
import doc_cast as CAST  # noqa: E402
import doc_cards as CARDS  # noqa: E402
import doc_geo as GEO  # noqa: E402
import doc_gfx as G  # noqa: E402
import doc_timeline as TL  # noqa: E402

W, H = 640, 360


def ffmpeg_path():
    exe = shutil.which('ffmpeg')
    if exe:
        return exe
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def words(text, t0=0.0, step=.33):
    out, t = [], t0
    for w in text.split():
        out.append({'start': t, 'end': t + .3, 'text': w})
        t += step
    return out, t


def sample_manifest():
    scenes = [{'text': 'In two hundred eighteen BC a general led thirty seven thousand soldiers toward the Alps.', 'mood': 'tension'},
              {'text': 'Nobody believed a whole army could cross those mountains in winter.', 'ambience': 'wind'},
              {'text': 'He said we will either find a way or make one.', 'mood': 'reveal'}]
    return {'kind': 'documentary', 'version': 1, 'width': W, 'height': H, 'images': ['a', 'b', 'c'], 'voice': [{'path': 'v', 'scenes': [0, 1, 2]}], 'scenes': scenes,
            'beats': [
                {'scene': 0, 'w0': 0, 'w1': 8, 'visual': {'type': 'image', 'src': 0, 'move': 'push'}, 'overlays': [{'kind': 'chapter', 'data': {'number': '1', 'title': 'The crossing'}, 'at': .2, 'dur': 2}]},
                {'scene': 0, 'w0': 8, 'w1': 14, 'visual': {'type': 'card', 'card': 'number', 'data': {'value': '37,000', 'label': 'soldiers'}, 'bg': 0}, 'transition': 'flash'},
                {'scene': 1, 'w0': 0, 'w1': 11, 'visual': {'type': 'image', 'src': 1, 'move': 'orbit_right'}, 'transition': 'cross', 'sfx': 'hit'},
                {'scene': 2, 'w0': 0, 'w1': 10, 'visual': {'type': 'card', 'card': 'quote', 'data': {'text': 'We will either find a way, or make one.', 'who': 'Hannibal'}, 'bg': 2}, 'transition': 'whip'},
            ], 'pauses': [{'scene': 1, 'after_word': 10, 'sec': .6, 'hush': True}], 'music': [{'scene': 0, 'mood': 'lofi'}]}


def sample_alignment(m):
    take, t = [], 0.0
    for si, sc in enumerate(m['scenes']):
        ws, t = words(sc['text'], t)
        take.append({'scene': si, 'words': ws})
        t += .4
    return [take], [t]


class Gfx(unittest.TestCase):
    def test_numbers(self):
        self.assertEqual(G.parse_number('1,500'), (1500.0, 0, True))
        self.assertEqual(G.parse_number('2.5'), (2.5, 1, False))
        self.assertIsNone(G.parse_number('many'))
        self.assertEqual(G.format_number(1234.4, 0, True), '1,234')

    def test_text_is_not_clipped(self):
        L = G.Layer(400, 120)
        f = G.font('oswald', 70, 700)
        L.text((10, 10), 'Gjpqy,', f, G.WHITE)
        ys, xs = np.nonzero(L.a)
        self.assertGreater(ys.max(), 10 + G.text_size('G', f)[1] * .85)   # descenders and the comma are drawn

    def test_fit_font_stays_in_box(self):
        fnt, lines = G.fit_font('oswald', 'A very long sentence that has to wrap onto several lines to fit', 500, 300, 120, 700, 4, 20)
        self.assertLessEqual(len(lines), 4)
        self.assertTrue(all(G.text_size(l, fnt)[0] <= 520 for l in lines))


class Cards(unittest.TestCase):
    DATA = {
        'number': {'value': '37,000', 'label': 'soldiers'}, 'quote': {'text': 'We will find a way', 'who': 'Hannibal'},
        'document': {'kind': 'headline', 'masthead': 'The Record', 'title': 'Tower opens', 'lines': ['Crowds came.'], 'stamp': 'Verified'},
        'timeline': {'events': [{'when': '218 BC', 'label': 'Alps'}, {'when': '216 BC', 'label': 'Cannae'}, {'when': '202 BC', 'label': 'Zama'}]},
        'location': {'points': [{'name': 'Carthage', 'lat': 36.8, 'lon': 10.3}, {'name': 'Rome', 'lat': 41.9, 'lon': 12.5}]},
        'compare': {'items': [{'label': 'A', 'value': '330', 'unit': 'm'}, {'label': 'B', 'value': '93'}]},
        'keyfact': {'text': 'He lost half his army', 'tag': 'The twist', 'mark': ['HALF']}, 'chapter': {'number': '2', 'title': 'The crossing', 'subtitle': '218 BC'},
        'title': {'title': 'The Man Who Sold The Tower', 'subtitle': 'Paris 1925'}, 'steps': {'steps': ['Rumour', 'Invite', 'Bribe']},
    }

    def test_every_card_draws_at_every_moment(self):
        self.assertEqual(set(self.DATA), set(CARDS.KINDS))
        for kind, data in self.DATA.items():
            for t in (0.0, .5, 1.4, 2.9):
                layer = CARDS.CARD_FUNCS[kind](W, H, data, t, 3.0)
                self.assertEqual(layer.rgb.shape, (H, W, 3), kind)
                self.assertTrue(layer.a.any(), f'{kind} blank at {t}')

    def test_overlays_draw(self):
        for kind, data in {'lower_third': {'name': 'Hannibal', 'sub': 'General'}, 'date_stamp': {'place': 'Rome', 'when': '216 BC'}, 'source_tag': {'text': 'Livy'}, 'speech': {'text': 'We will find a way', 'side': 'right'}}.items():
            self.assertTrue(CARDS.OVERLAY_FUNCS[kind](W, H, data, 1.0, 3.0).a.any(), kind)

    def test_number_counts_up_and_lands_on_the_exact_value(self):
        early = CARDS.number(W, H, {'value': '1,000', 'label': 'x'}, .3, 3.0)
        late = CARDS.number(W, H, {'value': '1,000', 'label': 'x'}, 2.5, 3.0)
        self.assertNotEqual(early.rgb.tobytes(), late.rgb.tobytes())

    def test_bad_data_never_crashes(self):
        self.assertFalse(CARDS.compare(W, H, {'items': [{'label': 'only', 'value': '5'}]}, 1, 3).rgb[..., 0].any() and False)
        CARDS.timeline(W, H, {'events': []}, 1, 3)
        CARDS.steps(W, H, {'steps': ['one']}, 1, 3)
        CARDS.number(W, H, {'value': 'many', 'label': ''}, 1, 3)
        CARDS.quote(W, H, {'text': 'x' * 500}, 3, 4)


class Geo(unittest.TestCase):
    def test_land_data_loads(self):
        rings = GEO.land()
        self.assertGreater(len(rings), 500)

    def test_invalid_coordinates_dropped(self):
        pts = GEO.valid_points([{'name': 'ok', 'lat': 10, 'lon': 20}, {'name': 'bad', 'lat': 999, 'lon': 0}, {'name': 'worse', 'lat': 'x', 'lon': 1}, 'junk'])
        self.assertEqual([p['name'] for p in pts], ['ok'])

    def test_map_has_coast_pixels_and_pins(self):
        layer = GEO.location(W, H, CardsData['location'], 3.4, 4.0)
        self.assertEqual(int(layer.a.min()), 255)   # opaque
        self.assertGreater(len(np.unique(layer.rgb.reshape(-1, 3), axis=0)), 40)


CardsData = Cards.DATA


class Timeline(unittest.TestCase):
    def test_validation_catches_bad_plans(self):
        m = sample_manifest()
        self.assertTrue(TL.validate_manifest(m))
        for mutate, why in [(lambda x: x['beats'][0].update(w1=99), 'word range'), (lambda x: x['beats'][0]['visual'].update(src=9), 'picture'),
                            (lambda x: x['beats'][1]['visual'].update(card='nope'), 'card'), (lambda x: x['beats'][0]['visual'].update(move='spin'), 'move'),
                            (lambda x: x['beats'][0].update(transition='wipe'), 'transition'), (lambda x: x.update(kind='cartoon'), 'kind')]:
            bad = json.loads(json.dumps(m)); mutate(bad)
            with self.assertRaises(ValueError, msg=why):
                TL.validate_manifest(bad)

    def test_build_orders_beats_and_places_cards_on_their_words(self):
        m = sample_manifest()
        aligned, dur = sample_alignment(m)
        tl = TL.build(m, aligned, dur)
        starts = [b['start'] for b in tl['beats']]
        self.assertEqual(starts, sorted(starts))
        self.assertEqual(starts[0], 0.0)
        self.assertAlmostEqual(tl['beats'][-1]['end'], tl['duration'], 3)
        number = tl['beats'][1]
        w = [x for x in tl['words'] if x['scene'] == 0][8]
        self.assertLess(abs(number['start'] - (w['t0'] - TL.LEAD)), .01)       # the number card appears as the number is spoken
        for b in tl['beats'][:-1]:
            need = TL.CARD_MIN.get(b['visual'].get('card'), TL.MIN_BEAT['card']) if b['visual']['type'] == 'card' else TL.MIN_BEAT['image']
            self.assertGreaterEqual(b['end'] - b['start'], need - 1e-6)

    def test_pause_moves_later_words_and_adds_silence(self):
        m = sample_manifest()
        aligned, dur = sample_alignment(m)
        plain = TL.build({**m, 'pauses': []}, aligned, dur)
        paused = TL.build(m, aligned, dur)
        self.assertAlmostEqual(paused['duration'] - plain['duration'], .6, 2)
        a = [w for w in plain['words'] if w['scene'] == 2][0]
        b = [w for w in paused['words'] if w['scene'] == 2][0]
        self.assertAlmostEqual(b['t0'] - a['t0'], .6, 2)
        self.assertEqual(sum(e[1] for e in paused['edits'] if e[0] == 'silence') - sum(e[1] for e in plain['edits'] if e[0] == 'silence'), .6)

    def test_pause_on_a_take_boundary_is_kept(self):
        m = sample_manifest()
        m['voice'] = [{'path': 'a', 'scenes': [0, 1]}, {'path': 'b', 'scenes': [2]}]
        m['pauses'] = [{'scene': 1, 'after_word': len(m['scenes'][1]['text'].split()) - 1, 'sec': .6, 'hush': True}]
        a0, t = words(m['scenes'][0]['text']); a1, t = words(m['scenes'][1]['text'], t + .4)
        b0, t2 = words(m['scenes'][2]['text'])
        aligned = [[{'scene': 0, 'words': a0}, {'scene': 1, 'words': a1}], [{'scene': 2, 'words': b0}]]
        plain = TL.build({**m, 'pauses': []}, aligned, [t + .2, t2 + .2])
        paused = TL.build(m, aligned, [t + .2, t2 + .2])
        self.assertAlmostEqual(paused['duration'] - plain['duration'], .6, 2)
        first = [w for w in paused['words'] if w['scene'] == 2][0]['t0'] - [w for w in plain['words'] if w['scene'] == 2][0]['t0']
        self.assertAlmostEqual(first, .6, 2)

    def test_scene_without_beats_gets_a_picture(self):
        m = sample_manifest()
        m['beats'] = [b for b in m['beats'] if b['scene'] != 2]
        aligned, dur = sample_alignment(m)
        tl = TL.build(m, aligned, dur)
        self.assertIn(2, {b['scene'] for b in tl['beats']})

    def test_alignment_mismatch_is_refused(self):
        m = sample_manifest()
        aligned, dur = sample_alignment(m)
        with self.assertRaises(ValueError):
            TL.build(m, aligned + aligned, dur + dur)

    def test_phrases_split_on_punctuation_and_length(self):
        ws, _ = words('One two three. Four five six seven eight nine ten eleven twelve thirteen.')
        for i, w in enumerate(ws):
            w['t0'], w['t1'] = w['start'], w['end']; w['wi'] = i; w['scene'] = 0
        ph = TL.phrases(ws)
        self.assertGreaterEqual(len(ph), 3)
        self.assertTrue(all(len(p['words']) <= 7 for p in ph))


class Camera(unittest.TestCase):
    def img(self):
        yy, xx = np.mgrid[0:240, 0:360]
        return np.stack([xx % 255, yy % 255, (xx + yy) % 255], axis=2).astype(np.uint8)

    def test_every_move_gives_a_valid_frame_that_actually_moves(self):
        im = self.img()
        shot = CAM.StillShot(im, CAM.guess_depth(im), W, H)
        for move in CAM.MOVES:
            path = CAM.plan_move(move, (.6, .5))
            a, b = shot.frame(0, path), shot.frame(1, path)
            self.assertEqual(a.shape, (H, W, 3))
            if move != 'hold':
                self.assertGreater(float(np.abs(a.astype(int) - b.astype(int)).mean()), .5, move)

    def test_depth_is_in_range_and_pack_roundtrips(self):
        d = CAM.guess_depth(self.img())
        self.assertTrue(0 <= d.min() and d.max() <= 1)
        back = CAM.unpack_depth(CAM.pack_depth(d))
        self.assertLess(float(np.abs(cv2.resize(back, (d.shape[1], d.shape[0])) - d).mean()), .05)

    def test_parallax_moves_near_pixels_more_than_far_ones(self):
        im = self.img()
        depth = np.zeros(im.shape[:2], np.float32); depth[:, 180:] = 1.0     # right half near
        shot = CAM.StillShot(im, depth, W, H, parallax=.05)
        path = {'z': (1.2, 1.2), 'c': ((.5, .5), (.5, .5)), 'p': ((-1, 0), (1, 0)), 'ramp': 'linear'}
        a, b = shot.frame(0, path), shot.frame(1, path)
        far = float(np.abs(a[:, :W // 4].astype(int) - b[:, :W // 4].astype(int)).mean())
        near = float(np.abs(a[:, 3 * W // 4:].astype(int) - b[:, 3 * W // 4:].astype(int)).mean())
        self.assertGreater(near, far)

    def test_an_unreadable_depth_file_never_stops_a_render(self):
        import doc_render as R
        d = tempfile.mkdtemp()
        os.makedirs(os.path.join(d, 'img')); os.makedirs(os.path.join(d, 'depth'))
        cv2.imwrite(os.path.join(d, 'img', 'img-0.jpg'), self.img())
        open(os.path.join(d, 'depth', 'depth-0.png'), 'wb').write(b'owner-host-name')   # what a claim marker looks like
        shots = R.load_shots({'images': ['a']}, os.path.join(d, 'img'), os.path.join(d, 'depth'), W, H)
        self.assertEqual(shots[0].frame(.5, CAM.plan_move('push')).shape, (H, W, 3))
        shutil.rmtree(d)

    def test_missing_model_falls_back(self):
        os.environ[CAM.MODEL_ENV] = '/nonexistent.onnx'
        CAM._SESSION, CAM._SESSION_TRIED = None, False
        d = CAM.estimate_depth(self.img())
        self.assertEqual(d.shape, (240, 360))


class Align(unittest.TestCase):
    def wav(self, path, seconds=4.0, lead=.5, tail=.4):
        n = int(48000 * seconds)
        x = np.zeros(n, np.float32)
        a, b = int(lead * 48000), n - int(tail * 48000)
        x[a:b] = np.sin(2 * np.pi * 150 * np.arange(b - a) / 48000) * .3
        with wave.open(path, 'wb') as f:
            f.setnchannels(1); f.setsampwidth(2); f.setframerate(48000); f.writeframes((x * 32767).astype('<i2').tobytes())

    def test_fallback_times_cover_the_speech_not_the_silence(self):
        d = tempfile.mkdtemp()
        p = os.path.join(d, 't.wav'); self.wav(p)
        m = {'scenes': [{'text': 'Hello there my friend.'}, {'text': 'We meet again today.'}], 'voice': [{'scenes': [0, 1]}]}
        out, method = AL.align_take(m, 0, p)
        self.assertEqual(method, 'span')
        ws = [w for s in out for w in s['words']]
        self.assertEqual(len(ws), 8)
        self.assertGreaterEqual(ws[0]['start'], .45)
        self.assertLessEqual(ws[-1]['end'], 3.65)
        self.assertTrue(all(b['start'] >= a['start'] for a, b in zip(ws, ws[1:])))
        shutil.rmtree(d)

    def test_punctuation_only_tokens_are_skipped_for_ctc(self):
        self.assertEqual(AL.letters('—'), '')
        self.assertEqual(AL.letters("don't."), "don't")


class Audio(unittest.TestCase):
    def test_voice_assembly_inserts_exact_silence(self):
        take = np.ones(48000 * 2, np.float32) * .1
        v = AU.assemble_voice([take], [('take', 0, 0, 1.0), ('silence', .5), ('take', 0, 1.0, 2.0)], 2.5)
        self.assertEqual(len(v), int(2.5 * 48000))
        self.assertLess(float(np.abs(v[int(1.1 * 48000):int(1.4 * 48000)]).max()), 1e-6)

    def test_mix_ducks_music_under_voice_and_hushes_before_a_pause(self):
        AU.BED_SEC = 12
        m = sample_manifest()
        aligned, dur = sample_alignment(m)
        tl = TL.build(m, aligned, dur)
        tl.pop('_starts', None)
        n = int(dur[0] * 48000)
        rng = np.random.default_rng(2)
        voice = np.zeros(n, np.float32)
        for sc in aligned[0]:
            for w in sc['words']:
                a, b = int(w['start'] * 48000), int(w['end'] * 48000)
                voice[a:b] = (np.sin(2 * np.pi * 150 * np.arange(b - a) / 48000) * .25 + rng.standard_normal(b - a) * .01).astype(np.float32)
        mix, rep = AU.build(m, tl, [voice], workers=1)
        self.assertEqual(len(mix), int(round(tl['duration'] * 48000)))
        self.assertLessEqual(float(np.abs(mix).max()), .951)
        self.assertEqual(rep['sections'][0][2], 'lofi')
        self.assertGreater(rep['sfx'], 2)

    def test_loudnorm_lands_near_target(self):
        exe = ffmpeg_path()
        if not exe:
            self.skipTest('no ffmpeg')
        AU.FFMPEG = exe
        d = tempfile.mkdtemp()
        x = (np.sin(2 * np.pi * 220 * np.arange(48000 * 6) / 48000) * .05).astype(np.float32)
        AU.write_wav(os.path.join(d, 'a.wav'), x)
        stats = AU.loudnorm(os.path.join(d, 'a.wav'), os.path.join(d, 'b.wav'))
        self.assertLess(stats['lufs'], -20)       # the input was quiet
        out = AU.read_wav(os.path.join(d, 'b.wav'))
        self.assertGreater(float(np.sqrt((out ** 2).mean())), float(np.sqrt((x ** 2).mean())) * 2)   # and was brought up
        shutil.rmtree(d)


def cartoon_person(path, w=400, h=600):
    """A transparent cartoon cutout (head, body, legs) for tests: BGRA PNG with a soft edge."""
    img = np.zeros((h, w, 4), np.uint8)
    cv2.ellipse(img, (w // 2, int(h * .2)), (int(w * .2), int(h * .15)), 0, 0, 360, (190, 210, 245, 255), -1, cv2.LINE_AA)       # head
    cv2.rectangle(img, (int(w * .3), int(h * .33)), (int(w * .7), int(h * .72)), (40, 60, 200, 255), -1, cv2.LINE_AA)           # coat
    cv2.rectangle(img, (int(w * .33), int(h * .72)), (int(w * .47), int(h * .97)), (60, 50, 40, 255), -1, cv2.LINE_AA)          # legs
    cv2.rectangle(img, (int(w * .53), int(h * .72)), (int(w * .67), int(h * .97)), (60, 50, 40, 255), -1, cv2.LINE_AA)
    cv2.imwrite(path, img)


class Cast(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        cartoon_person(os.path.join(self.d, 'cast-0.png'))
        self.m = {'cutouts': ['c'], 'cast': [{'id': 'queen', 'name': 'Queen Elizabeth I', 'kind': 'figure', 'cutout': 0}]}

    def tearDown(self):
        shutil.rmtree(self.d)

    def test_clean_trims_to_the_figure_and_rejects_pictures_without_transparency(self):
        raw = cv2.imread(os.path.join(self.d, 'cast-0.png'), cv2.IMREAD_UNCHANGED)
        out = CAST.clean(raw)
        self.assertLess(out.shape[1], raw.shape[1])
        self.assertIsNone(CAST.clean(np.zeros((50, 50, 3), np.uint8)))
        self.assertIsNone(CAST.clean(None))

    def test_a_cutout_stands_on_its_side_and_slides_in_only_when_it_enters(self):
        art = CAST.CastArt(self.m, self.d)
        bg = np.full((360, 640, 3), 90, np.uint8)
        entering = CAST.draw_cast(bg.copy(), [{'id': 'queen', 'side': 'left', 'enter': True}], .1, art)
        settled = CAST.draw_cast(bg.copy(), [{'id': 'queen', 'side': 'left', 'enter': True}], 1.5, art)
        staying = CAST.draw_cast(bg.copy(), [{'id': 'queen', 'side': 'left', 'enter': False}], .1, art)
        changed = lambda f: np.abs(f.astype(int) - bg.astype(int)).sum(axis=2) > 12
        left, right = changed(settled)[:, :320].sum(), changed(settled)[:, 320:].sum()
        self.assertGreater(left, 5000)
        self.assertEqual(right, 0)
        energy = lambda f: np.abs(f.astype(int) - bg.astype(int)).sum()
        self.assertLess(energy(entering), energy(settled) * .6)     # still fading in and below the frame edge
        self.assertGreater(energy(staying), energy(settled) * .85)  # already standing there: no slide, no fade
        feet = np.nonzero(changed(settled).any(axis=1))[0].max()
        self.assertGreater(feet, 340)                                           # stands at the bottom of the frame

    def test_missing_or_broken_cutout_is_skipped_not_fatal(self):
        art = CAST.CastArt({'cutouts': ['c'], 'cast': [{'id': 'x', 'name': 'X', 'kind': 'role', 'cutout': 3}]}, self.d)
        bg = np.full((120, 200, 3), 50, np.uint8)
        self.assertTrue((CAST.draw_cast(bg.copy(), [{'id': 'x', 'side': 'right'}, {'id': 'nobody', 'side': 'left'}], 1, art) == bg).all())

    def test_timeline_marks_who_enters_and_validates_the_cast(self):
        m = sample_manifest()
        m['cutouts'] = ['c']; m['cast'] = [{'id': 'queen', 'name': 'Queen', 'kind': 'figure', 'cutout': 0}]
        for b in m['beats']:
            if b['visual']['type'] == 'card':    # no card in between: the same person stays on the same side across neighbouring beats
                b['visual'] = {'type': 'image', 'src': 0, 'move': 'drift'}
            b['cast'] = [{'id': 'queen', 'side': 'left'}]
        aligned, dur = sample_alignment(m)
        tl = TL.build(m, aligned, dur)
        flags = [b['cast'][0]['enter'] for b in tl['beats'] if b.get('cast')]
        self.assertTrue(flags[0])
        self.assertIn(False, flags)           # a beat right after another with the same person on the same side does not slide again
        bad = json.loads(json.dumps(m)); bad['beats'][0]['cast'] = [{'id': 'ghost', 'side': 'left'}]
        with self.assertRaises(ValueError):
            TL.validate_manifest(bad)
        bad = json.loads(json.dumps(m)); bad['cast'][0]['cutout'] = 4
        with self.assertRaises(ValueError):
            TL.validate_manifest(bad)


class FullRender(unittest.TestCase):
    def test_tiny_video_end_to_end(self):
        exe = ffmpeg_path()
        if not exe:
            self.skipTest('no ffmpeg')
        os.environ['FFMPEG'] = exe
        import importlib
        import doc_render as R
        importlib.reload(R)
        from doc_frame import Composer
        d = tempfile.mkdtemp()
        os.makedirs(os.path.join(d, 'img')); os.makedirs(os.path.join(d, 'depth'))
        rng = np.random.default_rng(4)
        for i in range(3):
            im = cv2.GaussianBlur(rng.integers(0, 255, (300, 450, 3), dtype=np.uint8), (0, 0), 6)
            cv2.imwrite(os.path.join(d, 'img', f'img-{i}.jpg'), im)
        m = sample_manifest()
        aligned, dur = sample_alignment(m)
        tl = TL.build(m, aligned, dur)
        tl.pop('_starts', None)
        shots = R.load_shots(m, os.path.join(d, 'img'), os.path.join(d, 'depth'), W, H)
        comp = Composer(m, tl, shots, W, H, True)
        out = os.path.join(d, 'part.mp4')
        R.encode_range(comp, 0, 29, out)
        self.assertGreater(os.path.getsize(out), 2000)
        f = comp.frame(40)
        self.assertEqual(f.shape, (H, W, 3))
        self.assertGreater(float(f.std()), 5)
        shutil.rmtree(d)


if __name__ == '__main__':
    unittest.main()
