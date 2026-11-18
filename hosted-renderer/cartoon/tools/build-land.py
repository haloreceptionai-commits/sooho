"""Builds documentary/land.json (coastlines for the animated map cards) from Natural Earth 1:50m land (public domain).

Usage: python tools/build-land.py ne_50m_land.geojson documentary/land.json
Rings are simplified (0.03 degrees) and stored as flat integer arrays in hundredths of a degree: [lon0, lat0, lon1, lat1, ...].
"""
import json
import sys

import cv2
import numpy as np

src, out = sys.argv[1], sys.argv[2]
data = json.load(open(src, encoding='utf8'))
rings = []
for feature in data['features']:
    geometry = feature['geometry']
    polygons = geometry['coordinates'] if geometry['type'] == 'MultiPolygon' else [geometry['coordinates']]
    for polygon in polygons:
        ring = np.array(polygon[0], np.float32)
        if len(ring) < 4:
            continue
        simple = cv2.approxPolyDP((ring * 100).astype(np.float32).reshape(-1, 1, 2), 3.0, True).reshape(-1, 2)
        if len(simple) < 3:
            continue
        rings.append([int(round(v)) for v in simple.reshape(-1)])
json.dump({'unit': 100, 'rings': rings}, open(out, 'w'), separators=(',', ':'))
print(len(rings), 'rings', sum(len(r) // 2 for r in rings), 'points')
