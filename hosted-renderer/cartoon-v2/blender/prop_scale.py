"""How big a library model is drawn: the requested height, unless that would make the prop absurdly wide."""

MAX_FOOTPRINT = 24.0    # metres: no prop may be wider than this unless it is also tall (a building, a train, a ship: up to 7x its height)


def fit_scale(requested_height, natural_height, foot):
    """(scale, clamped). Models are scaled to their requested height, so a flat model (a pipe 0.2 m thick and 2.4 m long) asked to be 4 m 'tall'
    would otherwise grow 19x into a 46 m monster that engulfs the camera."""
    f = requested_height / natural_height; cap = max(MAX_FOOTPRINT, 7.0 * requested_height)
    if foot * f > cap: return cap / foot, True
    return f, False
