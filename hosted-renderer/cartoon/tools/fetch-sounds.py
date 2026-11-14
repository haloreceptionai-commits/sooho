"""Materialize immutable sound pointers before the offline worker image is built."""
import json, urllib.request, hashlib, zipfile, io, subprocess, tempfile
from pathlib import Path
root=Path(__file__).resolve().parent.parent/'assets'/'sound'
sources=[('https://opengameart.org/sites/default/files/tinysized.zip',{'footstep':'sfx-cc0/boots-leather-step-01.wav','impact':'sfx-cc0/metal-hammer-hit-01.wav','handling':'sfx-cc0/keyhole-lockbox-insert-01.wav'}),('https://opengameart.org/sites/default/files/sfx_100_v2.zip',{'tap':'sfx100v2_switch_01.ogg','stone':'sfx100v2_stones_01.ogg'}),('https://opengameart.org/sites/default/files/100-CC0-SFX_0.zip',{'splash':'splash_01.ogg'})]
for url,names in sources:
    archive=zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(url,timeout=60).read()))
    for name,member in names.items():
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/Path(member).name;source.write_bytes(archive.read(member))
            target=root/(name+'.wav')
            subprocess.run(['ffmpeg','-v','error','-y','-i',str(source),'-ar','48000','-ac','1','-c:a','pcm_s16le',str(target)],check=True)
            expected=json.loads((root/(name+'.wav.asset.json')).read_text())
            if target.stat().st_size!=expected['size']:raise ValueError('Sound source changed')
            print(target.name,target.stat().st_size,hashlib.sha256(target.read_bytes()).hexdigest())