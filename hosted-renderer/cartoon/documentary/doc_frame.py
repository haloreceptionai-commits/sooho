"""Frame composer: given the timeline it draws any frame of the video on its own, so any machine can render any range.

Order of work for one frame: the beat's picture or card, the transition from the previous beat, the film finish (grade, vignette,
dust, light leak, grain), then crisp overlays and phrase captions on top.
"""
import cv2
import numpy as np

import doc_cards as cards
import doc_fx as fx
from doc_camera import plan_move
from doc_cast import CastArt, draw_cast
from doc_gfx import GOLD, INK, WHITE, Layer, clamp01, font, over, smooth, text_size, window
from doc_fx import TRANSITION_SEC
from doc_timeline import FPS, beat_at, phrases


class Composer:
    def __init__(self, manifest, timeline, shots, W, H, captions=True, cast_dir=None):
        self.m, self.tl, self.shots = manifest, timeline, shots
        self.art = CastArt(manifest, cast_dir) if (manifest.get('cast') and cast_dir) else None
        self.W, self.H = int(W), int(H)
        self.captions = bool(captions)
        self.paths = {}
        self.phrase_list = phrases(timeline['words'])
        self._phrase_starts = [p['t0'] for p in self.phrase_list]
        self._cap_cache = {}
        self._ink = np.empty((self.H, self.W, 3), np.uint8)
        ys = np.linspace(0, 1, self.H, dtype=np.float32)[:, None, None]
        self._ink_bg = np.clip(np.broadcast_to(np.array((26, 30, 42), np.float32) * (1 - ys * .6) + np.array((8, 10, 16), np.float32) * ys * .6, (self.H, self.W, 3)), 0, 255).astype(np.uint8)

    # ------------------------------------------------------------------ visuals
    def _path(self, bi):
        if bi not in self.paths:
            v = self.tl['beats'][bi]['visual']
            move = v.get('move', 'drift') if v['type'] == 'image' else 'drift'
            self.paths[bi] = plan_move(move, v.get('focus') or (.5, .45), v.get('strength', 1.0), v.get('zoom'))
        return self.paths[bi]

    def _elements_for(self, bi):
        """The timed elements of one board beat, scheduled once from the words the beat holds."""
        cache = self.__dict__.setdefault('_elem_cache', {})
        if bi not in cache:
            import doc_elements as elements
            b = self.tl['beats'][bi]
            ws = [w for w in self.tl['words'][b.get('w0', 0):b.get('w1', 0)]]
            cache[bi] = elements.schedule([{'text': w['text'], 't0': w['t0'], 't1': w['t1']} for w in ws], b['start'], b['end'])
        return cache[bi]

    def _picture(self, src, bi, tb, dur):
        shot = self.shots[src]
        return shot.frame(clamp01(tb / max(.1, dur)), self._path(bi))

    def _visual(self, bi, tb):
        b = self.tl['beats'][bi]
        dur = b['end'] - b['start']
        v = b['visual']
        if v['type'] == 'image':
            pic = self._picture(v['src'], bi, tb, dur)
            if b.get('cast') and self.art:
                draw_cast(pic, b['cast'], tb, self.art)
            return pic
        kind = v['card']
        layer = cards.CARD_FUNCS[kind](self.W, self.H, v.get('data') or {}, tb, dur)
        if kind == 'board':   # the animated board: parchment or plaster, with the elements the narration names
            import doc_elements as elements
            pic = layer.rgb.copy()
            ev = self._elements_for(bi)
            return elements.draw(pic, ev, tb, self.W, self.H, (v.get('data') or {}).get('style', 'parchment'))
        if kind == 'location':
            return layer.rgb.copy()
        if v.get('bg') is not None:
            base = self._picture(v['bg'], bi, tb, dur)
            base = cv2.resize(cv2.GaussianBlur(cv2.resize(base, (self.W // 4, self.H // 4), interpolation=cv2.INTER_AREA), (0, 0), 2.2), (self.W, self.H), interpolation=cv2.INTER_LINEAR)
            base = (base.astype(np.float32) * .62).astype(np.uint8)
        else:
            base = self._ink_bg.copy()
        return over(base, layer)

    def _mood(self, bi):
        b = self.tl['beats'][bi]
        if b['visual'].get('type') == 'card' and b['visual'].get('card') == 'board': return 'board'   # boards get their own warm, brown finish
        return b.get('mood') or self.m['scenes'][b['scene']].get('mood') or 'neutral'

    # ------------------------------------------------------------------- frame
    def frame(self, index):
        t = index / FPS
        bi = beat_at(self.tl, t)
        b = self.tl['beats'][bi]
        tb = max(0.0, t - b['start'])
        img = self._visual(bi, tb)
        kind = b.get('transition', 'cut')
        tsec = TRANSITION_SEC.get(kind, 0)
        if bi > 0 and tsec and tb < tsec:
            prev = self.tl['beats'][bi - 1]
            img = fx.transition(kind, self._visual(bi - 1, (prev['end'] - prev['start']) + tb), img, tb / tsec)
        out = fx.finish(img, index, t, self._mood(bi), seed=b['scene'] + 3)
        for o in b.get('overlays') or []:
            at = float(o.get('at', 0))
            dur = float(o.get('dur', (b['end'] - b['start']) - at))
            if at <= tb <= at + dur:
                fn = cards.OVERLAY_FUNCS.get(o['kind']) or cards.CARD_FUNCS.get(o['kind'])
                if fn:
                    over(out, fn(self.W, self.H, o.get('data') or {}, tb - at, dur))
        v = b['visual']
        if self.captions and not (v['type'] == 'card' and v['card'] in ('location', 'chapter', 'title', 'document', 'keyfact', 'quote')):
            self._caption(out, t)
        return out

    # ---------------------------------------------------------------- captions
    def _caption(self, out, t):
        import bisect
        i = bisect.bisect_right(self._phrase_starts, t) - 1
        if i < 0:
            return
        p = self.phrase_list[i]
        if t > p['t1'] + .25:
            return
        active = 0
        for k, w in enumerate(p['words']):
            if t >= w['t0']:
                active = k
        key = (i, active)
        if key not in self._cap_cache:
            if len(self._cap_cache) > 600:
                self._cap_cache.clear()
            self._cap_cache[key] = self._draw_caption(p, active)
        layer, y = self._cap_cache[key]
        over(out, layer, at=(0, y))

    def _draw_caption(self, p, active):
        s = self.H / 1080.0
        fnt = font('inter', 44 * s, 800)
        words = [w['text'] for w in p['words']]
        lines, cur = [], []
        for w in words:
            if cur and text_size(' '.join(cur + [w]), fnt)[0] > self.W * .78:
                lines.append(cur)
                cur = []
            cur.append(w)
        lines.append(cur)
        lh = int(fnt.size * 1.3)
        band_h = lh * len(lines) + int(30 * s)
        layer = Layer(self.W, band_h)
        y0 = int(12 * s)
        k = 0
        for line in lines:
            full = ' '.join(line)
            x = self.W / 2 - text_size(full, fnt)[0] / 2
            for w in line:
                col = GOLD if k == active else WHITE
                layer.text((x, y0), w, fnt, col, 'left', shadow=int(6 * s), stroke=int(5 * s))
                x += fnt.getlength(w + ' ')
                k += 1
            y0 += lh
        return layer, int(self.H * .88 - band_h / 2 + (2 - len(lines)) * 0)
