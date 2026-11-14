"""Materialize immutable sound pointers before the offline worker image is built."""
import json, urllib.request, hashlib
from pathlib import Path
root=Path(__file__).resolve().parent.parent/'assets'/'sound'
for pointer in root.glob('*.wav.asset.json'):
    data=json.loads(pointer.read_text())
    url='https://sooha.io'+data['url'] if data['url'].startswith('/') else data['url']
    raw=urllib.request.urlopen(url,timeout=60).read()
    if len(raw)!=data['size'] or raw[:4]!=b'RIFF':raise ValueError('Invalid sound asset')
    target=pointer.with_suffix('').with_suffix('')
    target.write_bytes(raw)
    print(target.name,len(raw),hashlib.sha256(raw).hexdigest())