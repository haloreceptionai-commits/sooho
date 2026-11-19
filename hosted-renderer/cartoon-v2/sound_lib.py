"""Procedural sound library: sound effects, ambient loops and music beds, synthesized deterministically with numpy.

Nothing is downloaded and nothing is licensed: every sample comes from arithmetic on a seeded generator, so the same
(kind, seed) always gives the same bytes and the offline worker never depends on a network pin.
Used by stems.sound_design on the narration's own 48 kHz sample clock.
"""
import re
import numpy as np

RATE = 48000


# ----------------------------------------------------------------------------- helpers
def _t(n):
    return np.arange(n) / RATE


def _noise(n, seed):
    return np.random.default_rng(seed).standard_normal(n)


def _filt(x, lo=None, hi=None, order=2):
    """Zero-phase band limiting in the frequency domain (smooth roll-off, no python loops)."""
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / RATE); g = np.ones_like(f)
    if lo: g = g / (1 + (lo / np.maximum(f, 1e-9)) ** (2 * order))
    if hi: g = g / (1 + (f / hi) ** (2 * order))
    return np.fft.irfft(X * g, len(x))


def _norm(x, peak=.9):
    m = float(np.max(np.abs(x))) if len(x) else 0.0
    return x * (peak / m) if m > 0 else x


def _edge(x, ms=4):
    """Short fade in/out so no sound can click at its boundaries."""
    k = min(len(x) // 2, int(RATE * ms / 1000))
    if k > 1:
        x = x.copy(); x[:k] *= np.linspace(0, 1, k); x[-k:] *= np.linspace(1, 0, k)
    return x


def _phase(freq):
    return 2 * np.pi * np.cumsum(freq) / RATE


def _bell(f0, n, partials=((1, 1, 6), (2.01, .45, 9), (2.76, .3, 11), (5.4, .12, 16))):
    t = _t(n)
    return sum(a * np.sin(2 * np.pi * f0 * r * t) * np.exp(-t * d) for r, a, d in partials)


def _place(buf, start, snd, gain=1.0):
    i = int(start * RATE)
    if i >= len(buf) or i < 0: return
    j = min(len(buf), i + len(snd)); buf[i:j] += snd[:j - i] * gain


def _reverb(x, seconds=1.2, wet=.25, seed=11):
    """Convolution with a decaying-noise room; the dry signal is kept intact."""
    n = int(seconds * RATE); t = _t(n)
    ir = _noise(n, seed) * np.exp(-t * (6.9 / seconds)); ir = _filt(ir, lo=200, hi=7000); ir /= np.sqrt(np.sum(ir ** 2)) + 1e-9
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[:len(x)]
    return x + wet * y


# ----------------------------------------------------------------------------- sound effects (one-shots)
def whoosh(seed=1):
    n = int(.55 * RATE); u = _t(n) / .55; w = _noise(n, seed)
    low, mid, high = _filt(w, lo=90, hi=500), _filt(w, lo=600, hi=2500), _filt(w, lo=2500, hi=9000)
    g = lambda c, s: np.exp(-((u - c) / s) ** 2)
    x = low * g(.3, .18) * 2.0 + mid * g(.5, .15) * 1.2 + high * g(.62, .12) * .9
    return _edge(_norm(x * np.sin(np.pi * u) ** 1.2))


def pop(seed=1):
    n = int(.14 * RATE); t = _t(n)
    x = np.sin(_phase(130 + 900 * np.exp(-t * 38))) * np.exp(-t * 34)
    x += .5 * _filt(_noise(n, seed), lo=2500) * np.exp(-t * 600)
    return _edge(_norm(x), 1)


def click(seed=1):
    n = int(.06 * RATE); t = _t(n)
    return _edge(_norm(np.sin(2 * np.pi * 2300 * t) * np.exp(-t * 170) + .8 * _filt(_noise(n, seed), lo=3000) * np.exp(-t * 420)), 1)


def blip(seed=1):
    n = int(.18 * RATE); t = _t(n); x = np.zeros(n)
    for start, f, d in ((0, 1320, .05), (.06, 1760, .07)):
        k = int(d * RATE); tt = _t(k)
        sq = np.sin(2 * np.pi * f * tt) + np.sin(6 * np.pi * f * tt) / 3 + np.sin(10 * np.pi * f * tt) / 5
        _place(x, start, sq * np.sin(np.pi * np.arange(k) / k) ** .6)
    return _edge(_norm(x), 2)


def boing(seed=1):
    n = int(.85 * RATE); t = _t(n)
    f = 250 + 420 * np.exp(-t * 2.6) * np.sin(2 * np.pi * 6.5 * t)   # springy pitch wobble that settles
    ph = _phase(f); x = (np.sin(ph) + .35 * np.sin(2 * ph) + .12 * np.sin(3 * ph)) * np.exp(-t * 3.0) * (1 - np.exp(-t * 400))
    return _edge(_norm(x))


def bonk(seed=1):
    n = int(.32 * RATE); t = _t(n)
    x = np.sin(2 * np.pi * 420 * t * (1 + .25 * np.exp(-t * 60))) * np.exp(-t * 26) + .4 * np.sin(2 * np.pi * 880 * t) * np.exp(-t * 40)
    x += .3 * _filt(_noise(n, seed), lo=800) * np.exp(-t * 300)
    return _edge(_norm(x), 1)


def squeak(seed=1):
    n = int(.24 * RATE); t = _t(n); u = t / .24
    f = 1000 + 1500 * u + 120 * np.sin(2 * np.pi * 28 * t); ph = _phase(f)
    x = (np.sin(ph) + .5 * np.sin(2 * ph) + .25 * np.sin(3 * ph)) * np.sin(np.pi * u) ** .5
    return _edge(_norm(_filt(x, lo=800, hi=6000)), 3)


def ding(seed=1):
    n = int(.9 * RATE); x = np.zeros(n)
    _place(x, 0, _bell(1046.5, int(.8 * RATE), ((1, 1, 7), (2.0, .4, 10), (3.0, .15, 14))))
    _place(x, .13, _bell(1568.0, int(.75 * RATE), ((1, 1, 7), (2.0, .4, 10), (3.0, .15, 14))), .9)
    return _edge(_norm(x), 2)


def buzz(seed=1):
    n = int(.6 * RATE); t = _t(n); x = np.zeros(n)
    for a, b in ((0, .22), (.3, .52)):
        i, j = int(a * RATE), int(b * RATE); tt = t[i:j] - a
        sq = np.tanh(3 * np.sin(2 * np.pi * 165 * tt)) * (1 + .5 * np.sin(2 * np.pi * 60 * tt))
        x[i:j] = sq * np.minimum(1, np.minimum(tt / .01, (b - a - tt) / .01))
    return _edge(_norm(_filt(x, hi=1400)))


def door(seed=1):
    n = int(.4 * RATE); t = _t(n)
    x = np.sin(2 * np.pi * 95 * t * (1 - .35 * t)) * np.exp(-t * 18) + _filt(_noise(n, seed), hi=350) * np.exp(-t * 22) * 1.5
    x += .35 * _filt(_noise(n, seed + 1), lo=1800, hi=5000) * np.exp(-t * 400)   # latch tick
    return _edge(_norm(x), 1)


def slam(seed=1):
    n = int(.8 * RATE); t = _t(n)
    x = np.sin(2 * np.pi * 70 * t * (1 - .3 * t)) * np.exp(-t * 11) * 1.2 + _filt(_noise(n, seed), hi=500) * np.exp(-t * 14) * 2
    rattle = _filt(_noise(n, seed + 2), lo=600, hi=3500) * np.exp(-t * 7) * (np.sin(2 * np.pi * 38 * t) > .2) * .35
    return _edge(_norm(x + rattle), 1)


def engine(seed=1):
    n = int(1.6 * RATE); t = _t(n); u = t / 1.6
    f0 = 26 + 38 * (1 - np.exp(-t * 2.2)); ph = _phase(f0)
    x = sum(np.sin(h * ph + h) / h ** .8 for h in range(1, 14)) * (1 + .3 * np.sin(ph / 2))
    x = _filt(x, hi=1100) + _filt(_noise(n, seed), hi=220) * 1.8
    return _edge(_norm(x * np.minimum(1, np.minimum(u / .06, (1 - u) / .2))), 10)


def horn(seed=1):
    n = int(.7 * RATE); t = _t(n)
    x = np.tanh(3 * np.sin(2 * np.pi * 392 * t)) + np.tanh(3 * np.sin(2 * np.pi * 494 * t))
    return _edge(_norm(_filt(x, hi=2800) * np.minimum(1, np.minimum(t / .02, (.7 - t) / .08))), 5)


def screech(seed=1):
    n = int(1.0 * RATE); t = _t(n); u = t / 1.0
    bp = _filt(_noise(n, seed), lo=1200, hi=3600) * (.6 + .4 * np.sin(2 * np.pi * 33 * t))
    ph = _phase(2200 - 700 * u + 90 * np.sin(2 * np.pi * 12 * t)); x = bp + .35 * np.sin(ph) + .15 * np.sin(2 * ph)
    return _edge(_norm(x * np.minimum(1, u / .07) * (1 - u) ** .8), 6)


def punch(seed=1):
    n = int(.26 * RATE); t = _t(n)
    x = np.sin(_phase(45 + 110 * np.exp(-t * 18))) * np.exp(-t * 20) + .9 * _filt(_noise(n, seed), lo=800, hi=4000) * np.exp(-t * 70)
    return _edge(_norm(x), 1)


def clash(seed=1):
    n = int(.9 * RATE); t = _t(n)
    parts = ((1650, 1, 7), (2210, .8, 9), (3470, .6, 11), (4890, .45, 14), (6130, .3, 18))
    x = sum(a * np.sin(2 * np.pi * f * t + i) * np.exp(-t * d) for i, (f, a, d) in enumerate(parts))
    x += 1.1 * _filt(_noise(n, seed), lo=2000) * np.exp(-t * 55)
    return _edge(_norm(x), 1)


def heartbeat(seed=1):
    n = int(1.3 * RATE); x = np.zeros(n)
    for start in (0, .85):
        for off, g in ((0, 1), (.26, .72)):
            k = int(.22 * RATE); tt = _t(k)
            thump = np.sin(2 * np.pi * 52 * tt * (1 - .3 * tt)) * np.exp(-tt * 24) + .4 * _filt(_noise(k, seed + int(start * 9)), hi=140) * np.exp(-tt * 26)
            _place(x, start + off, thump, g)
    return _edge(_norm(x), 2)


def gasp(seed=1):
    n = int(.5 * RATE); t = _t(n); u = t / .5; w = _noise(n, seed)
    x = _filt(w, lo=500, hi=1200) * 1.2 + _filt(w, lo=1800, hi=3200) * .8
    return _edge(_norm(x * np.where(u < .62, (u / .62) ** 2, np.exp(-(u - .62) * 22))), 8)


def drop(seed=1):
    n = int(2.0 * RATE); t = _t(n)
    x = np.sin(_phase(26 + 110 * np.exp(-t * 3.4))) * np.exp(-t * 2.0) * (1 - np.exp(-t * 900))
    x += .3 * _filt(_noise(n, seed), hi=900) * np.exp(-t * 30)
    return _edge(_norm(x), 2)


def scratch(seed=1):
    n = int(.55 * RATE); t = _t(n); u = t / .55
    amp = np.abs(np.sin(2 * np.pi * 3.2 * t)) ** .6 * np.minimum(1, (1 - u) * 4)
    ph = _phase(500 + 1100 * np.abs(np.sin(2 * np.pi * 3.2 * t)))
    x = _filt(_noise(n, seed), lo=700, hi=5500) * .8 + (2 * ((ph / (2 * np.pi)) % 1) - 1) * .5
    return _edge(_norm(x * amp), 3)


def trombone(seed=1):
    notes = ((233.1, .4), (220.0, .4), (207.7, .4), (196.0, 1.15)); total = sum(d for _, d in notes) + .1
    out = np.zeros(int(total * RATE)); at = 0.0
    for fnote, d in notes:
        n = int(d * RATE); t = _t(n); u = t / d
        vib = 1 + (0.012 * np.sin(2 * np.pi * 5.2 * t) * np.minimum(1, t / .4) if d > 1 else 0)
        ph = _phase(fnote * vib); ctr = 500 + 1500 * np.exp(-u * 3) * (1 + .5 * np.sin(2 * np.pi * (1.2 if d < 1 else 3) * t))
        x = sum(np.sin(h * ph) * np.exp(-(h * fnote / ctr) ** 2) / h ** .7 for h in range(1, 15))
        _place(out, at, x * np.minimum(1, np.minimum(t / .04, (d - t) / .06)))
        at += d
    return _edge(_norm(out), 5)


def shutter(seed=1):
    n = int(.18 * RATE); x = np.zeros(n)
    for start, g in ((0, 1), (.06, .75)):
        k = int(.07 * RATE); tt = _t(k)
        _place(x, start, _filt(_noise(k, seed + int(start * 99)), lo=900, hi=6000) * np.exp(-tt * 110) + .6 * np.sin(2 * np.pi * 210 * tt) * np.exp(-tt * 90), g)
    return _edge(_norm(x), 1)


def cash(seed=1):
    n = int(1.3 * RATE); x = np.zeros(n)
    for i in range(10):
        k = int(.02 * RATE); _place(x, i * .028, _filt(_noise(k, seed + i), lo=1500) * np.exp(-_t(k) * 250), .5 + .05 * i)
    _place(x, .3, _bell(2637.0, int(.95 * RATE), ((1, 1, 5), (2.4, .5, 7), (4.1, .3, 9))))
    return _edge(_norm(x), 1)


def sparkle(seed=1):
    n = int(1.0 * RATE); x = np.zeros(n); rng = np.random.default_rng(seed)
    for i, f in enumerate((1568, 1976, 2349, 2637, 3136, 3951)):
        k = int(.4 * RATE); tt = _t(k)
        _place(x, i * .06, np.sin(2 * np.pi * f * (1 + rng.uniform(-.002, .002)) * tt) * np.exp(-tt * 9) * (1 + .4 * np.sin(2 * np.pi * 14 * tt)), 1 - .08 * i)
    return _edge(_norm(x), 2)


def typing(seed=1):
    n = int(1.0 * RATE); x = np.zeros(n); rng = np.random.default_rng(seed)
    t = np.sort(rng.uniform(0, .86, 9))
    for i, ts in enumerate(t):
        k = int(.05 * RATE); tt = _t(k)
        _place(x, ts, _filt(rng.standard_normal(k), lo=1500, hi=5000) * np.exp(-tt * 180) + .6 * np.sin(2 * np.pi * 180 * tt) * np.exp(-tt * 120), rng.uniform(.6, 1))
    return _edge(_norm(x), 1)


def applause(seed=1):
    n = int(2.6 * RATE); t = _t(n); rng = np.random.default_rng(seed); x = np.zeros(n)
    density = np.minimum(1, t / .35) * np.where(t < 1.9, 1, np.exp(-(t - 1.9) * 3.5))
    count = 330
    starts = rng.uniform(0, 2.55, count)
    for s in starts:
        if rng.uniform() > density[min(n - 1, int(s * RATE))]: continue
        k = int(.03 * RATE); _place(x, s, _filt(rng.standard_normal(k), lo=1200, hi=5500) * np.exp(-_t(k) * 110), rng.uniform(.3, 1))
    x += .12 * _filt(rng.standard_normal(n), lo=900, hi=4500) * density
    return _edge(_norm(x), 20)


def wind_gust(seed=1):
    n = int(1.8 * RATE); u = _t(n) / 1.8; w = _noise(n, seed)
    return _edge(_norm((_filt(w, hi=700) + .5 * _filt(w, lo=700, hi=1500) * np.sin(np.pi * u)) * np.sin(np.pi * u) ** 1.5), 30)


def crowd_cheer(seed=1):
    n = int(1.8 * RATE); u = _t(n) / 1.8; x = np.zeros(n)
    for i in range(7):
        x += _voice(n, 150 + 22 * i, seed + i, vowel=i % 3, speed=3.2 + .4 * i)
    return _edge(_norm(_filt(x, lo=250, hi=4000) * np.sin(np.pi * u) ** .7), 40)


def _voice(n, f0, seed, vowel=0, speed=4.0):
    """One speech-like voice: a harmonic buzz shaped by vowel formants and gated syllable by syllable."""
    t = _t(n); rng = np.random.default_rng(seed)
    ph = _phase(f0 * (1 + .05 * np.sin(2 * np.pi * (.4 + rng.uniform(0, .5)) * t + rng.uniform(0, 6))))
    buzz_ = sum(np.sin(h * ph) / h for h in range(1, 16))
    formants = ((700, 1100), (500, 1900), (350, 2400))[vowel % 3]
    sp = np.fft.rfft(buzz_); f = np.fft.rfftfreq(n, 1 / RATE)
    sp *= sum(np.exp(-((f - c) / 180) ** 2) for c in formants) + .08
    voiced = np.fft.irfft(sp, n)
    m = int(n / RATE * speed) + 2; gate = np.interp(t, np.arange(m) / speed, rng.uniform(0, 1, m)) ** 2
    return voiced * gate


def thunder(seed=1):
    n = int(2.0 * RATE); t = _t(n)
    rumble = _filt(_noise(n, seed), hi=180) * np.exp(-t * 1.8) * (1 + .6 * np.sin(2 * np.pi * 4 * t + 1)) * 3
    crack = _filt(_noise(n, seed + 1), lo=800, hi=5000) * np.exp(-t * 28)
    return _edge(_norm(rumble + .7 * crack + .6 * np.sin(2 * np.pi * 42 * t) * np.exp(-t * 3)), 3)


def bell(seed=1):
    return _edge(_norm(_bell(660.0, int(1.4 * RATE), ((1, 1, 3.5), (2.0, .6, 5), (2.76, .5, 6.5), (4.07, .25, 9), (5.4, .15, 12)))), 2)


def coin(seed=1):
    n = int(.5 * RATE)
    return _edge(_norm(_bell(2400.0, n, ((1, 1, 18), (1.5, .6, 22), (2.3, .3, 30)))), 1)


def reveal(seed=1):
    n = int(.6 * RATE)
    return _edge(_norm(_bell(523.25, n, ((1, 1, 8), (1.26, .6, 8), (1.5, .45, 9), (2.0, .3, 11)))), 4)


def impact(seed=1):
    n = int(.9 * RATE); t = _t(n)
    return _edge(_norm(np.sin(_phase(45 + 70 * np.exp(-t * 14))) * np.exp(-t * 8) + .4 * _filt(_noise(n, seed), hi=2000) * np.exp(-t * 35)), 1)


# ----------------------------------------------------------------------------- ambient beds (tiled loops)
def _loop(base, n, fade=.6):
    """Tile a seamless base loop to n samples with equal-power crossfades."""
    if n <= len(base): return base[:n].copy()
    cf = int(fade * RATE); step = len(base) - cf; out = np.zeros(n)
    w_in, w_out = np.sin(np.linspace(0, np.pi / 2, cf)), np.cos(np.linspace(0, np.pi / 2, cf))
    pos = 0
    while pos < n:
        seg = base.copy(); seg[:cf] *= w_in
        if pos + len(seg) < n: seg[-cf:] *= w_out
        j = min(n, pos + len(seg)); out[pos:j] += seg[:j - pos]
        pos += step
    return out


_BASES = {}


def _ambient_base(kind, seed):
    if (kind, seed) not in _BASES: _BASES[(kind, seed)] = _ambient_base_uncached(kind, seed)
    return _BASES[(kind, seed)]


def _ambient_base_uncached(kind, seed):
    n = 8 * RATE; t = _t(n); rng = np.random.default_rng(seed); w = _noise(n, seed)
    if kind == 'rain':
        x = _filt(w, lo=700, hi=9000) * .5 + _filt(_noise(n, seed + 1), lo=3000, hi=12000) * .25
        for s in rng.uniform(0, 7.9, 260): _place(x, s, _filt(rng.standard_normal(200), lo=2500) * np.exp(-_t(200) * 500) * rng.uniform(.3, 1.2), .6)
        return x
    if kind == 'wind':
        gust = .55 + .45 * np.abs(np.sin(2 * np.pi * .13 * t + 1) * .6 + np.sin(2 * np.pi * .31 * t + 2) * .4)
        return (_filt(w, hi=550) * 1.6 + .5 * _filt(w, lo=500, hi=1400) * gust) * gust
    if kind == 'traffic':
        x = _filt(w, hi=260) * 2.0 + _filt(_noise(n, seed + 1), lo=250, hi=900) * .25
        for s in (1.2, 4.1, 6.3):
            k = int(2.0 * RATE); tt = _t(k); car = (_filt(_noise(k, seed + int(s * 10)), lo=300, hi=2200) * np.sin(np.pi * tt / 2.0) ** 2) * .6
            _place(x, s, car)
        return x
    if kind == 'chatter':
        x = sum(_voice(n, 105 + 17 * i + 40 * (i % 2), seed + i, vowel=i, speed=3 + .35 * i) for i in range(10))
        return _filt(x, lo=200, hi=3800) + .1 * _filt(w, lo=300, hi=3000)
    if kind == 'crickets':
        x = np.zeros(n)
        for c in range(4):
            f = 4300 + 180 * c; off = rng.uniform(0, .9)
            for burst in np.arange(off, 7.8, .95 + .05 * c):
                for p in range(4):
                    k = int(.014 * RATE); tt = _t(k)
                    _place(x, burst + p * .045, np.sin(2 * np.pi * f * tt) * np.sin(np.pi * np.arange(k) / k), .4)
        return x + .05 * _filt(w, lo=3000)
    if kind == 'birds':
        x = np.zeros(n)
        for s in rng.uniform(0, 7.5, 16):
            for i in range(rng.integers(2, 5)):
                k = int(.09 * RATE); tt = _t(k); f0 = rng.uniform(2200, 4200)
                _place(x, s + i * .11, np.sin(_phase(f0 + 1400 * np.sin(np.pi * tt / .09))) * np.sin(np.pi * np.arange(k) / k) ** 2, rng.uniform(.4, 1))
        return x + .03 * _filt(w, lo=2000, hi=8000)
    if kind == 'fire':
        x = _filt(w, hi=450) * .5 + _filt(_noise(n, seed + 1), lo=200, hi=1500) * .12 * (.6 + .4 * np.abs(np.sin(2 * np.pi * .9 * t)))
        for s_ in rng.uniform(0, 7.95, 420):
            k = int(rng.uniform(.002, .006) * RATE); _place(x, s_, _filt(rng.standard_normal(k), lo=1200) * np.exp(-_t(k) * rng.uniform(400, 1200)), rng.uniform(.1, .8))
        for s_ in rng.uniform(0, 7.5, 9):
            k = int(.03 * RATE); _place(x, s_, _filt(rng.standard_normal(k), lo=500, hi=4000) * np.exp(-_t(k) * 120), 1.1)
        return x
    if kind == 'water':
        burble = np.clip(.5 + .7 * _filt(_noise(n, seed + 2), hi=7), 0, 2)
        x = _filt(w, lo=250, hi=3200) * burble * .6 + _filt(_noise(n, seed + 3), lo=1500, hi=6000) * .12
        for s_ in rng.uniform(0, 7.8, 110):
            k = int(.08 * RATE); tt = _t(k); f0 = rng.uniform(350, 900)
            _place(x, s_, np.sin(_phase(f0 * (1 + 1.4 * tt / .08))) * np.sin(np.pi * np.arange(k) / k) ** 2, rng.uniform(.1, .5))
        return x
    raise ValueError('Unknown ambience')


AMBIENT = ('rain', 'wind', 'traffic', 'chatter', 'crickets', 'birds', 'fire', 'water')


def ambience(kind, n, seed=1):
    base = _norm(_ambient_base(kind, seed), .9)
    x = _loop(base, n); k = min(n // 2, int(.5 * RATE))
    if k > 1: x[:k] *= np.linspace(0, 1, k); x[-k:] *= np.linspace(1, 0, k)
    return x


# ----------------------------------------------------------------------------- registry
# kind -> (generator, relative gain in the sound-effects stem)
SFX = {
    'whoosh': (whoosh, .9), 'pop': (pop, .9), 'click': (click, .7), 'blip': (blip, .55), 'boing': (boing, .9), 'bonk': (bonk, .9),
    'squeak': (squeak, .7), 'ding': (ding, .6), 'buzz': (buzz, .6), 'door': (door, .9), 'slam': (slam, 1.0), 'engine': (engine, .7),
    'horn': (horn, .7), 'screech': (screech, .6), 'punch': (punch, 1.0), 'clash': (clash, .8), 'heartbeat': (heartbeat, 1.0),
    'gasp': (gasp, .7), 'drop': (drop, 1.0), 'scratch': (scratch, .8), 'trombone': (trombone, .75), 'shutter': (shutter, .75),
    'cash': (cash, .65), 'sparkle': (sparkle, .5), 'typing': (typing, .7), 'applause': (applause, .75), 'gust': (wind_gust, .6),
    'cheer': (crowd_cheer, .7), 'thunder': (thunder, 1.0), 'bell': (bell, .6), 'coin': (coin, .5), 'reveal': (reveal, .6), 'impact': (impact, 1.0),
}
# Added to the shared vocabulary (everything that is not a pinned recording or one of the original editorial sounds).
NEW_KINDS = tuple(k for k in SFX if k not in ('whoosh', 'reveal', 'coin', 'thunder', 'bell', 'impact')) + AMBIENT + ('wind', 'crowd')


def render(kind, seed=1, length=None):
    """Mono float samples for one cue. Ambient kinds need `length` in samples."""
    if kind in AMBIENT: return ambience(kind, int(length), seed) * .35
    if kind == 'wind': return ambience('wind', int(length), seed) * .35 if length else wind_gust(seed) * .6
    if kind == 'crowd': return ambience('chatter', int(length), seed) * .4 if length else crowd_cheer(seed) * .7
    fn, gain = SFX[kind]
    return fn(seed) * gain * .8


# ----------------------------------------------------------------------------- music beds
def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def _pluck(f, dur, bright=1.0):
    n = int(dur * RATE); t = _t(n)
    return _edge(sum(np.sin(2 * np.pi * f * h * t) / h ** 1.3 * np.exp(-t * (5 + 2.2 * h / bright)) for h in range(1, 9)), 2)


def _epiano(f, dur):
    n = int(dur * RATE); t = _t(n)
    x = np.sin(2 * np.pi * f * t) * np.exp(-t * 2.4) + .45 * np.sin(4 * np.pi * f * t) * np.exp(-t * 4.5) + .2 * np.sin(2 * np.pi * f * 7.01 * t) * np.exp(-t * 14)
    return _edge(x * (1 + .12 * np.sin(2 * np.pi * 4.7 * t)) * (1 - np.exp(-t * 400)), 4)


def _piano(f, dur):
    n = int(dur * RATE); t = _t(n); x = np.zeros(n)
    for h in range(1, 12):
        fh = f * h * np.sqrt(1 + 4e-4 * h * h)
        if fh > 9000: break
        x += np.sin(2 * np.pi * fh * t) / h ** .95 * np.exp(-t * (1.1 + .55 * h))
    x += .12 * _filt(_noise(n, int(f)), lo=1200, hi=4000) * np.exp(-t * 90)
    return _edge(x * (1 - np.exp(-t * 600)), 3)


def _pad(freqs, dur, attack=.6, release=.8, bright=1500, vib=0.0):
    n = int(dur * RATE); t = _t(n); x = np.zeros(n)
    for f in freqs:
        for det in (-.004, 0, .004):
            ph = _phase(np.full(n, f * (1 + det)) * (1 + vib * np.sin(2 * np.pi * 5.4 * t)))
            x += sum(np.sin(h * ph) / h * np.exp(-(h * f / bright) ** 2) for h in range(1, 13))
    env = np.minimum(1, np.minimum(t / attack, (dur - t) / release))
    return x * np.clip(env, 0, 1) / max(1, len(freqs))


def _bass(f, dur):
    n = int(dur * RATE); t = _t(n)
    return _edge((np.sin(2 * np.pi * f * t) + .3 * np.sin(4 * np.pi * f * t)) * np.exp(-t * 3.2) * (1 - np.exp(-t * 300)), 3)


def _kick(vol=1.0):
    n = int(.22 * RATE); t = _t(n)
    return _edge(np.sin(_phase(48 + 95 * np.exp(-t * 28))) * np.exp(-t * 14) * vol, 1)


def _snare(vol=1.0, seed=3):
    n = int(.2 * RATE); t = _t(n)
    return _edge((_filt(_noise(n, seed), lo=1200, hi=7000) * np.exp(-t * 22) + .4 * np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30)) * vol, 1)


def _hat(vol=1.0, seed=5, open_=False):
    n = int((.16 if open_ else .05) * RATE); t = _t(n)
    return _edge(_filt(_noise(n, seed), lo=6000) * np.exp(-t * (18 if open_ else 90)) * vol, 1)


def _timpani(f=73.4, vol=1.0, seed=9):
    n = int(.9 * RATE); t = _t(n)
    return _edge((np.sin(_phase(f * (1 + .35 * np.exp(-t * 25)))) * np.exp(-t * 4.5) + .25 * _filt(_noise(n, seed), hi=500) * np.exp(-t * 20)) * vol, 2)


def _crash(vol=1.0, seed=7, dur=1.8):
    n = int(dur * RATE); t = _t(n)
    return _edge(_filt(_noise(n, seed), lo=3000, hi=12000) * np.exp(-t * 2.2) * vol, 2)


def _riser(dur, seed=13):
    n = int(dur * RATE); t = _t(n); u = t / dur
    return _filt(_noise(n, seed), lo=500, hi=9000) * u ** 2.2 * .8 + np.sin(_phase(80 + 700 * u ** 2)) * u ** 3 * .25


def _lofi(samples, twist, seed):
    bpm = 76; beat = 60 / bpm; out = np.zeros(samples); rng = np.random.default_rng(seed)
    chords = ((50, 53, 57, 60, 64), (55, 59, 62, 65, 64), (48, 52, 55, 59, 62), (45, 48, 52, 55, 59))   # Dm9 G13 Cmaj9 Am9
    bars = int(samples / RATE / (4 * beat)) + 2
    for bar in range(bars):
        t0 = bar * 4 * beat; ch = chords[bar % 4]; after = t0 * RATE >= twist and twist > 0
        lift = 12 if after else 0
        for k, off in enumerate((0, 1.5, 2.5)):
            for j, m in enumerate(ch[1:]):
                _place(out, t0 + off * beat + j * .018, _epiano(midi(m + lift), 1.6 * beat), .11 * (1 if k != 1 else .8))
        _place(out, t0, _bass(midi(ch[0] - 12), 1.8 * beat), .3); _place(out, t0 + 2 * beat, _bass(midi(ch[0] - 12), 1.5 * beat), .22)
        _place(out, t0, _kick(), .32); _place(out, t0 + 2.5 * beat + .02, _kick(), .22)
        for b in (1, 3): _place(out, t0 + b * beat + .012, _snare(seed=seed + bar + b), .17)
        for e in range(8): _place(out, t0 + e * beat / 2 + (.03 if e % 2 else 0), _hat(seed=seed + e + bar * 8, open_=(e == 7)), .07 if e % 2 else .1)
        if after:
            mel = (72, 74, 76, 79, 76, 74); mm = mel[(bar * 3 + rng.integers(0, 3)) % len(mel)]
            _place(out, t0 + 3 * beat, _pluck(midi(mm), 1.1, .8), .12)
    for s in rng.uniform(0, samples / RATE, int(samples / RATE * 6)): _place(out, s, _filt(rng.standard_normal(60), lo=1500) * np.exp(-_t(60) * 300), .05)   # vinyl crackle
    wob = 1 + .0006 * np.sin(2 * np.pi * .35 * _t(samples)); out = np.interp(np.cumsum(wob) / np.sum(wob) * (samples - 1), np.arange(samples), out)
    return _norm(_filt(out, lo=60, hi=3800), .45)


def _epic(samples, twist, seed):
    bpm = 96; beat = 60 / bpm; out = np.zeros(samples); rng = np.random.default_rng(seed)
    prog = ((50, 57, 62), (46, 53, 58), (53, 60, 65), (48, 55, 60))   # Dm Bb F C
    bars = int(samples / RATE / (4 * beat)) + 2; tw = twist / RATE
    for bar in range(bars):
        t0 = bar * 4 * beat; ch = prog[bar % 4]
        if tw > 0 and t0 > tw - 3 and t0 < tw + .2: continue    # room for the riser and the silence before the answer
        after = tw > 0 and t0 >= tw + .2
        notes = [m + (12 if after and i == 2 else 0) for i, m in enumerate(ch)]
        for e in range(8):
            _place(out, t0 + e * beat / 2, _pad([midi(notes[e % 3] - 12)], .38 * beat * 2 / 2 + .1, .01, .06, 700), .22 * (1.2 if e % 4 == 0 else .8))
        _place(out, t0, _pad([midi(m) for m in notes], 4 * beat, 1.0, 1.0, 1100), .28)
        _place(out, t0, _timpani(midi(ch[0] - 12)), .75); _place(out, t0 + 2 * beat, _timpani(midi(ch[0] - 12)), .5)
        if bar % 4 == 3:
            for r in range(6): _place(out, t0 + 3 * beat + r * beat / 6, _timpani(midi(ch[0] - 12)), .12 + .06 * r)
        if after: _place(out, t0, _pad([midi(m + 12) for m in notes] + [midi(notes[0] + 24)], 4 * beat, .7, .9, 2200, .004), .18)
    if 0 < tw < samples / RATE:
        r = _riser(2.8, seed); _place(out, max(0, tw - 3.0), r, .6)
        out[max(0, int((tw - .22) * RATE)):int(tw * RATE)] *= 0
        _place(out, tw, _timpani(midi(38), 1.0), 1.0); _place(out, tw, _crash(.45, seed), 1.0)
        _place(out, tw, _pad([midi(m) for m in (50, 57, 62, 66, 69)], 3.2, .02, 1.5, 2500), .5)
    return _norm(_reverb(out, 1.4, .2, seed), .45)


def _suspense(samples, twist, seed):
    out = np.zeros(samples); t = _t(samples); rng = np.random.default_rng(seed); tw = twist / RATE
    drone = sum(np.sin(_phase(np.full(samples, f * (1 + .0015 * np.sin(2 * np.pi * (.05 + .03 * i) * t + i))))) / (1 + i) for i, f in enumerate((55.0, 55.8, 82.4, 58.3)))
    out += _filt(drone, hi=900) * (.4 + .18 * np.sin(2 * np.pi * .07 * t))
    out += _filt(drone, lo=150, hi=1400) * .45 * (.5 + .5 * np.sin(2 * np.pi * .05 * t + 2))
    shimmer = (np.sin(2 * np.pi * 2093 * t) + np.sin(2 * np.pi * 2217 * t)) * np.clip(.5 + .5 * np.sin(2 * np.pi * .11 * t + 1.3), 0, 1) ** 3 * (.5 + .5 * np.sin(2 * np.pi * 7 * t))
    out += shimmer * .09
    for k in range(int(samples / RATE / 1.0)):   # slow pulse that tightens toward the end
        sec = k * (1.0 - .35 * k * RATE / max(samples, 1)); _place(out, sec, _kick(1) * np.exp(-np.arange(int(.22 * RATE)) / RATE * 6), .09)
    for s in rng.uniform(2, max(3, samples / RATE - 2), int(samples / RATE / 6.5) + 1):
        _place(out, s, _pad([midi(m + 12) for m in (45, 46, 52)], 2.6, .9, 1.2, 2400, .01), .35)
    if 0 < tw < samples / RATE:
        i1 = int(tw * RATE); i0 = max(0, i1 - int(.35 * RATE)); out[i0:i1] *= np.linspace(1, 0, i1 - i0)
        _place(out, tw, drop(seed), .8); _place(out, tw, _pad([midi(m) for m in (45, 49, 52, 57)], 3.5, .05, 1.5, 2600), .35)
    return _norm(_reverb(out, 1.6, .18, seed), .45)


def _sad(samples, twist, seed):
    bpm = 62; beat = 60 / bpm; out = np.zeros(samples); rng = np.random.default_rng(seed); tw = twist / RATE
    prog = (((45, 52, 57, 60, 64), 69), ((41, 48, 53, 57, 60), 65), ((48, 55, 60, 64, 67), 72), ((43, 50, 55, 59, 62), 67))   # Am F C G
    bars = int(samples / RATE / (4 * beat)) + 2
    for bar in range(bars):
        t0 = bar * 4 * beat; ch, top = prog[bar % 4]; after = tw > 0 and t0 >= tw; sh = 0
        arp = (0, 2, 3, 4, 3, 2, 1, 2)
        for e, ix in enumerate(arp):
            _place(out, t0 + e * beat / 2, _piano(midi(ch[ix] + (12 if after else 0)), 2.0), .24 * (1 if e % 4 == 0 else .7))
        _place(out, t0, _piano(midi(ch[0] - 12), 3.0), .3)
        mel = [m for m in (top, top - 2, top - 5, top - 7)]; m = mel[rng.integers(0, 4)]
        _place(out, t0 + (1 if bar % 2 else 2) * beat, _piano(midi(m), 3.0), .3)
        _place(out, t0, _pad([midi(x + 12) for x in ch[1:4]], 4 * beat, 1.2, 1.4, 2000, .006), .12 + (.1 if after else 0))
    return _norm(_reverb(out, 1.8, .35, seed), .45)


MOODS = {'lofi': _lofi, 'epic': _epic, 'suspense': _suspense, 'sad': _sad}
MUSIC_WORDS = {
    'epic': r'\b(war|wars|battle|battles|army|armies|soldier|soldiers|empire|king|queen|conquer\w*|legion\w*|victory|siege|fight\w*|invad\w*|invasion|general|revolution|dragon|knight|knights|castle|rome|roman|crusade\w*|warrior\w*|sword|swords)\b',
    'suspense': r'\b(mystery|mysterious|secret|secrets|dark|murder\w*|crime|ghost|haunted|horror|scary|disappear\w*|missing|trap|danger\w*|threat\w*|spy|spies|conspiracy|monster|curse\w*|unknown|shadow\w*|killer|poison\w*|escape|vanish\w*)\b',
    'sad': r'\b(died|death|dead|dies|lost|loss|tragic|tragedy|cry|cried|crying|tears|alone|funeral|orphan\w*|goodbye|grief|sorrow|broken|heartbroken|sad|miss|missed)\b',
    'lofi': r'\b(study|studying|relax\w*|chill|sleep\w*|coffee|cozy|calm|routine|habit|habits|productiv\w*|focus|peaceful|morning|rainy)\b',
}


def pick_mood(text, hint=None):
    """The bed that fits the script: 'quirky' (the original score) unless one mood clearly dominates."""
    if hint in MOODS or hint == 'quirky': return hint
    low = (text or '').lower(); score = {k: len(re.findall(rx, low)) for k, rx in MUSIC_WORDS.items()}
    best = max(score, key=lambda k: score[k]); runners = sorted(score.values())[-2]
    return best if score[best] >= 3 and score[best] > runners else 'quirky'


def music_bed(mood, samples, twist_sample, seed=1):
    """Mono bed of exactly `samples` samples (peak 0.45) with a lift at the twist, faded at both edges."""
    if mood not in MOODS: raise ValueError('Unknown music mood')
    x = MOODS[mood](samples, int(twist_sample), int(seed))[:samples]
    if len(x) < samples: x = np.pad(x, (0, samples - len(x)))
    edge = min(samples, int(.05 * RATE)); x = x.copy(); x[:edge] *= np.linspace(0, 1, edge); x[-edge:] *= np.linspace(1, 0, edge)
    return x


# ----------------------------------------------------------------------------- cue planning (words and places -> sounds)
from sound_words import WORD_SOUNDS, MIN_GAP  # noqa: E402,F401  (re-exported)
SYNTH_ONE_SHOTS = tuple(k for k in SFX if k not in ('impact',))


def thin_cues(cues, fps=30):
    """Keeps the mix from turning into noise: the same sound never repeats inside its gap and no more than two effects land per second."""
    out, last, recent = [], {}, []
    for c in sorted(cues, key=lambda c: c['frame']):
        k = c['kind']
        if k in AMBIENT or k not in SYNTH_ONE_SHOTS: out.append(c); continue
        t = c['frame'] / fps
        if k in last and t - last[k] < MIN_GAP.get(k, 1.5): continue
        recent = [r for r in recent if t - r < 1.0]
        if len(recent) >= 2: continue
        last[k] = t; recent.append(t); out.append(c)
    return out


_AMB_RULES = (
    (r'street|town|city|road|highway|freeway|traffic|station|bus_?stop|neon|alley|metro|subway|garage|parking|bridge', 'traffic'),
    (r'school|class|playground|party|market|mall|store|stadium|gym|cafe|square|crowd|festival|hallway|boardroom|cubicle|office', 'chatter'),
    (r'forest|wood|garden|countryside|farm|jungle|meadow|plain|field|village|park|orchard|swamp|camp', 'nature'),
    (r'desert|mountain|cliff|canyon|beach|island|sea|ocean|coast|snow|battlefield|war|castle|sky|ship|cove|harbou?r|tundra|glacier', 'wind'),
)
_OLD_WORLD_AMBIENCE = {'town': 'nature', 'market': 'chatter', 'bridge': 'traffic', 'modern_street': 'traffic', 'night_camp': 'nature', 'landscape': 'wind',
                       'castle': 'wind', 'ship': 'wind', 'storm_sea': 'wind'}


def ambience_for(shot):
    """Ambient beds a shot's place calls for (at most two), e.g. rain on a rainy street or crickets in a night field."""
    p = shot.get('place') or {}; kinds = []
    weather = str(p.get('weather') or ''); fx = shot.get('fx') or []
    night = str(p.get('time') or shot.get('light') or '') in ('night', 'night_bright', 'midnight', 'dusk')
    if weather in ('rain', 'storm', 'thunderstorm') or 'rain' in fx or shot.get('world') == 'storm_sea': kinds.append('rain')
    if weather in ('storm', 'thunderstorm', 'wind', 'windy') or shot.get('world') == 'storm_sea': kinds.append('wind')
    ids = ' '.join(str(d.get('id') or d.get('lib') or '') for d in (p.get('dressing') or []) if isinstance(d, dict)).lower()
    if re.search(r'campfire|bonfire|fireplace|furnace|forge|lava|burning', ids): kinds.append('fire')
    terrain = str(p.get('terrain') or '').lower()
    if re.search(r'river|lake|stream|waterfall|pond|harbou?r|dock|creek', terrain): kinds.append('water')
    if len(kinds) < 2 and not any(k in kinds for k in ('rain', 'wind')):
        hit = None
        for rx, kind in _AMB_RULES:
            if re.search(rx, terrain): hit = kind; break
        if hit is None: hit = _OLD_WORLD_AMBIENCE.get(shot.get('world'))
        if hit == 'nature': hit = 'crickets' if night else 'birds'
        if hit: kinds.append(hit)
    return kinds[:2]


def ambience_plan(shots, total_frames, fps=30):
    """Continuous ambient cues: consecutive shots with the same bed share one cue so the loop never restarts at a cut."""
    runs = {}
    for s in shots:
        for k in ambience_for(s):
            cur = runs.setdefault(k, [])
            if cur and s['start'] - cur[-1][1] <= 3: cur[-1][1] = s['end']
            else: cur.append([s['start'], s['end']])
    out = []
    for k, spans in runs.items():
        for a, b in spans:
            a, b = max(0, int(a)), min(int(total_frames), int(b))
            if b - a >= fps: out.append({'frame': a, 'end': b, 'kind': k, 'gain': 1.0})
    return sorted(out, key=lambda c: (c['frame'], c['kind']))
