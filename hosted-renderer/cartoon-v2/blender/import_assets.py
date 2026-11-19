"""Build an offline, checksum-pinned CC0 subset for the Blender set kits.

Existing Kenney GLBs are copied without changing the legacy library. Poly Haven
maps are downloaded to temporary staging, then included in this worker image.
Run from project root: python3 hosted-renderer/cartoon/blender/import_assets.py
"""
import hashlib
import json
from pathlib import Path
import shutil
import struct
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
        if pack.startswith('q-'):
            publisher_page = fetch(f'https://quaternius.com/packs/{pack[2:]}.html').decode()
            if 'CC0' not in publisher_page: raise RuntimeError(f'{pack}: publisher license unavailable')
        dest = OUT / 'licenses' / f'{pack}.txt'; dest.parent.mkdir(exist_ok=True)
        shutil.copyfile(license_file, dest)
    for model in spec['models']:
        source = LIBRARY / f'{model}.glb'
        if source.read_bytes()[:4] != b'glTF':
            raise RuntimeError(f'{model}: invalid GLB')
        target = OUT / 'models' / f'{model}.glb'
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        pack = model.split('/')[0]
        source_url = f'https://quaternius.com/packs/{pack[2:]}.html' if pack.startswith('q-') else f'https://kenney.nl/assets/{pack}'
        entries.append({'id': model, 'kind': 'model', 'path': str(target.relative_to(OUT)),
                        'sha256': digest(target), 'source': source_url, 'license': 'CC0-1.0'})
        data = source.read_bytes()
        gltf = json.loads(data[20:20 + struct.unpack_from('<I', data, 12)[0]])
        for image in gltf.get('images', []):
            uri = image.get('uri')
            if not uri or uri.startswith('data:'): continue
            src_image = (source.parent / uri).resolve()
            if not src_image.is_relative_to(LIBRARY.resolve()): raise ValueError('external model image')
            dst_image = target.parent / uri; dst_image.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src_image, dst_image)
            if not any(e['path'] == str(dst_image.relative_to(OUT)) for e in entries):
                entries.append({'id': model.split('/')[0] + '/' + uri, 'kind': 'model-texture', 'path': str(dst_image.relative_to(OUT)),
                                'sha256': digest(dst_image), 'source': source_url, 'license': 'CC0-1.0'})
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

def add_models(ids):
    """Additive import (no network): copy more library GLBs into the pinned subset and append their entries.
    Only packs whose shipped License.txt says CC0 are accepted."""
    entries = json.loads((OUT / 'manifest.json').read_text()); have = {e['id'] for e in entries}
    for model in ids:
        if model in have: continue
        pack = model.split('/')[0]
        lic = LIBRARY / pack / 'License.txt'
        if 'CC0' not in lic.read_text(errors='ignore'): raise RuntimeError(f'{pack}: CC0 could not be verified')
        dest = OUT / 'licenses' / f'{pack}.txt'; dest.parent.mkdir(exist_ok=True); shutil.copyfile(lic, dest)
        source = LIBRARY / f'{model}.glb'
        if source.read_bytes()[:4] != b'glTF': raise RuntimeError(f'{model}: invalid GLB')
        target = OUT / 'models' / f'{model}.glb'; target.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(source, target)
        url = f'https://quaternius.com/packs/{pack[2:]}.html' if pack.startswith('q-') else f'https://kenney.nl/assets/{pack}'
        entries.append({'id': model, 'kind': 'model', 'path': str(target.relative_to(OUT)), 'sha256': digest(target), 'source': url, 'license': 'CC0-1.0'})
        data = source.read_bytes(); gltf = json.loads(data[20:20 + struct.unpack_from('<I', data, 12)[0]])
        for image in gltf.get('images', []):
            uri = image.get('uri')
            if not uri or uri.startswith('data:'): continue
            src_image = (source.parent / uri).resolve()
            if not src_image.is_relative_to(LIBRARY.resolve()): raise ValueError('external model image')
            dst = target.parent / uri; dst.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(src_image, dst)
            rel = str(dst.relative_to(OUT))
            if not any(e['path'] == rel for e in entries):
                entries.append({'id': pack + '/' + uri, 'kind': 'model-texture', 'path': rel, 'sha256': digest(dst), 'source': url, 'license': 'CC0-1.0'})
        print('added', model)
    (OUT / 'manifest.json').write_text(json.dumps(entries, indent=2) + '\n')
    spec = json.loads((HERE / 'asset-spec.json').read_text())
    spec['models'] = spec['models'] + [m for m in ids if m not in spec['models']]
    (HERE / 'asset-spec.json').write_text(json.dumps(spec, indent=2) + '\n')
    (OUT / 'CREDITS.md').write_text('# Offline Blender assets\n\nAll entries are CC0-1.0; licenses checked at import.\n\n' +
        '\n'.join(f'- {e["path"]}: {e["source"]} — {e["license"]}, SHA-256 `{e["sha256"]}`' for e in entries) + '\n')
