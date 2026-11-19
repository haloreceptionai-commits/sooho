"""Bound model attention for long takes without splitting or estimating the script clock."""
import numpy as np

RATE = 16000
STRIDE = 320
RECEPTIVE = 400


def acoustic_emissions(waveform, predict):
    # Preserve the existing Shorts inference exactly. Long recordings use overlapping
    # windows on the model's original frame grid; context is discarded, not duplicated.
    if len(waveform) <= RATE * 90:
        return predict(waveform)
    frames = (len(waveform) - RECEPTIVE) // STRIDE + 1
    parts = []
    for first in range(0, frames, 1000):
        last = min(frames, first + 1000)
        left = max(0, first - 50)
        right = min(frames, last + 50)
        emissions = predict(waveform[left * STRIDE:(right - 1) * STRIDE + RECEPTIVE])
        if len(emissions) != right - left:
            raise ValueError('Acoustic window has an unexpected frame count')
        parts.append(emissions[first - left:last - left])
    return np.concatenate(parts, axis=0)