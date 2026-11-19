"""Spoken word -> sound effect tables for the Advanced pipeline (pure python: the manifest builder imports this without numpy)."""

# Spoken words that trigger a sound in the Advanced pipeline. Whole words only: "care" must never ring as a car horn.
WORD_SOUNDS = {
    'door': 'door', 'doors': 'door', 'slam': 'slam', 'slams': 'slam', 'slammed': 'slam',
    'engine': 'engine', 'engines': 'engine', 'revved': 'engine', 'driving': 'engine', 'drove': 'engine',
    'horn': 'horn', 'honk': 'horn', 'honked': 'horn', 'honking': 'horn',
    'skid': 'screech', 'skidded': 'screech', 'brakes': 'screech', 'screech': 'screech', 'screeched': 'screech',
    'punch': 'punch', 'punched': 'punch', 'punches': 'punch', 'kicked': 'punch', 'slapped': 'punch',
    'sword': 'clash', 'swords': 'clash', 'clash': 'clash', 'clashed': 'clash', 'blade': 'clash', 'duel': 'clash',
    'heartbeat': 'heartbeat', 'heartbeats': 'heartbeat', 'pounding': 'heartbeat',
    'gasp': 'gasp', 'gasped': 'gasp', 'shocked': 'gasp', 'shocking': 'gasp', 'surprised': 'gasp',
    'twist': 'drop', 'unbelievable': 'drop',
    'text': 'ding', 'texted': 'ding', 'message': 'ding', 'messaged': 'ding', 'notification': 'ding', 'notifications': 'ding', 'ping': 'ding',
    'buzzed': 'buzz', 'buzzing': 'buzz', 'vibrated': 'buzz',
    'photo': 'shutter', 'photos': 'shutter', 'selfie': 'shutter', 'camera': 'shutter', 'paparazzi': 'shutter',
    'cash': 'cash', 'money': 'cash', 'dollars': 'cash', 'rich': 'cash', 'paid': 'cash',
    'applause': 'applause', 'clapped': 'applause', 'clap': 'applause', 'claps': 'applause', 'cheered': 'applause',
    'typed': 'typing', 'typing': 'typing', 'keyboard': 'typing',
    'bounce': 'boing', 'bounced': 'boing', 'boing': 'boing', 'jumped': 'boing', 'spring': 'boing',
    'oops': 'trombone', 'failed': 'trombone', 'fail': 'trombone', 'mistake': 'trombone', 'blunder': 'trombone', 'awkward': 'trombone',
    'wow': 'sparkle', 'sparkle': 'sparkle', 'magic': 'sparkle', 'magical': 'sparkle', 'shiny': 'sparkle', 'glitter': 'sparkle',
    'squeak': 'squeak', 'squeaked': 'squeak', 'squeaky': 'squeak',
    'bonk': 'bonk', 'bonked': 'bonk', 'thump': 'bonk',
    'click': 'click', 'clicked': 'click', 'pop': 'pop', 'popped': 'pop',
    'wait': 'scratch', 'freeze': 'scratch', 'rewind': 'scratch',
    'breeze': 'gust', 'gust': 'gust', 'whoosh': 'whoosh', 'swoosh': 'whoosh', 'zoomed': 'whoosh',
}
MIN_GAP = {'trombone': 8.0, 'scratch': 8.0, 'cash': 4.0, 'ding': 3.0, 'sparkle': 3.0, 'drop': 6.0, 'gasp': 3.0, 'shutter': 3.0, 'applause': 5.0}
