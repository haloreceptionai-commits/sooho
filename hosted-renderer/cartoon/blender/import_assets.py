"""Build an offline, checksum-pinned CC0 subset for the Blender set kits.

Existing Kenney GLBs are copied without changing the legacy library. Poly Haven
maps are downloaded to temporary staging, then included in this worker image.
Run from project root: python3 hosted-renderer/cartoon/blender/import_assets.py
"""
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
import subprocess

HERE = Path(__file__).resolve().parent
LIBRARY = HERE.parent / 'assets' / 'library'
OUT = HERE / 'assets'


def fetch(url):
    return subprocess.check_output(['curl', '-fsSL', '--retry', '3', '--max-time', '90', url])


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build(spec):
    OUT.mkdir(exist_ok=True)
    entries = []
    # Verify the publisher's license now, not only a remembered license.
    license_page = fetch('https://polyhaven.com/license').decode()
    if 'CC0' not in license_page:
        raise RuntimeError('Poly Haven CC0 license could not be verified')
    for pack in sorted({m.split('/')[0] for m in spec['models']}):
        # Kenney blocks automated page requests. The publisher-supplied license
        # shipped with each original pack is authoritative and retained verbatim.
        license_file = LIBRARY / pack / 'License.txt'
        page = license_file.read_text()
        if 'CC0' not in page:
            raise RuntimeError(f'{pack}: CC0 could not be verified')
        dest = OUT / 'licenses' / f'{pack}.txt'; dest.parent.mkdir(exist_ok=True)
        shutil.copyfile(license_file, dest)
    for model in spec['models']:
        source = LIBRARY / f'{model}.glb'
        if source.read_bytes()[:4] != b'glTF':
            raise RuntimeError(f'{model}: invalid GLB')
        target = OUT / 'models' / f'{model}.glb'
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        entries.append({'id': model, 'kind': 'model', 'path': str(target.relative_to(OUT)),
                        'sha256': digest(target), 'source': f'https://kenney.nl/assets/{model.split("/")[0]}', 'license': 'CC0-1.0'})
    with tempfile.TemporaryDirectory(prefix='blender-cc0-') as temp:
        for name, asset in spec['textures'].items():
            files = json.loads(fetch(f'https://api.polyhaven.com/files/{asset}'))
            for key, role in [('Diffuse', 'color'), ('Rough', 'roughness'), ('nor_gl', 'normal')]:
                data = files.get(key, {}).get('1k', {})
                data = data.get('jpg') or data.get('png')
                if not data:
                    raise RuntimeError(f'{asset}: missing 1k {key}')
                suffix = Path(data['url']).suffix
                stage = Path(temp) / f'{name}-{role}{suffix}'
                stage.write_bytes(fetch(data['url']))
                target = OUT / 'textures' / stage.name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(stage, target)
                entries.append({'id': name, 'role': role, 'kind': 'texture', 'path': str(target.relative_to(OUT)),
                                'sha256': digest(target), 'source': f'https://polyhaven.com/a/{asset}', 'license': 'CC0-1.0'})
        for name, asset in spec['skies'].items():
            data = json.loads(fetch(f'https://api.polyhaven.com/files/{asset}'))['hdri']['1k']['hdr']
            stage = Path(temp) / f'{name}.hdr'; stage.write_bytes(fetch(data['url']))
            target = OUT / 'skies' / stage.name; target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(stage, target)
            entries.append({'id': name, 'kind': 'sky', 'path': str(target.relative_to(OUT)), 'sha256': digest(target),
                            'source': f'https://polyhaven.com/a/{asset}', 'license': 'CC0-1.0'})
    (OUT / 'manifest.json').write_text(json.dumps(entries, indent=2) + '\n')
    (OUT / 'CREDITS.md').write_text('# Offline Blender assets\n\nAll entries are CC0-1.0; licenses checked at import.\n\n' +
        '\n'.join(f'- {e["path"]}: {e["source"]} — {e["license"]}, SHA-256 `{e["sha256"]}`' for e in entries) + '\n')
    print(f'Imported {len(entries)} pinned offline files.')


if __name__ == '__main__':
    build(json.loads((HERE / 'asset-spec.json').read_text()))