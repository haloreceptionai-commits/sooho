"""Add CC0 library models to the offline Blender asset set without needing the whole library checked out.
Run from the repo root: python hosted-renderer/cartoon/blender/add_library_models.py pack/model ...
Reads each GLB (and any external texture it references) with `git show`, copies it under assets/models, pins its SHA-256 in
assets/manifest.json and keeps the pack licence text. Existing entries are left untouched."""
import hashlib, json, struct, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent; OUT = HERE / 'assets'; LIB = 'hosted-renderer/cartoon/assets/library'


def show(path):
    return subprocess.check_output(['git', 'show', f'HEAD:{path}'])


def add(models):
    manifest = json.loads((OUT / 'manifest.json').read_text()); have = {e['path'] for e in manifest}
    for model in models:
        pack = model.split('/')[0]
        src_url = f'https://quaternius.com/packs/{pack[2:]}.html' if pack.startswith('q-') else f'https://kenney.nl/assets/{pack}'
        data = show(f'{LIB}/{model}.glb')
        if data[:4] != b'glTF': raise RuntimeError(f'{model}: invalid GLB')
        lic = show(f'{LIB}/{pack}/License.txt')
        if b'CC0' not in lic: raise RuntimeError(f'{pack}: CC0 licence not confirmed')
        (OUT / 'licenses').mkdir(parents=True, exist_ok=True); (OUT / 'licenses' / f'{pack}.txt').write_bytes(lic)
        target = OUT / 'models' / f'{model}.glb'; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)
        rel = target.relative_to(OUT).as_posix()
        if rel not in have:
            manifest.append({'id': model, 'kind': 'model', 'path': rel, 'sha256': hashlib.sha256(data).hexdigest(), 'source': src_url, 'license': 'CC0-1.0'}); have.add(rel)
        gltf = json.loads(data[20:20 + struct.unpack_from('<I', data, 12)[0]])
        for image in gltf.get('images', []):
            uri = image.get('uri')
            if not uri or uri.startswith('data:'): continue
            img = show(f'{LIB}/{pack}/{uri}'.replace('//', '/')) if '/' not in model.split('/', 1)[1] else show(f'{LIB}/{Path(model).parent.as_posix()}/{uri}')
            dst = target.parent / uri; dst.parent.mkdir(parents=True, exist_ok=True); dst.write_bytes(img)
            irel = dst.relative_to(OUT).as_posix()
            if irel not in have:
                manifest.append({'id': f'{pack}/{uri}', 'kind': 'model-texture', 'path': irel, 'sha256': hashlib.sha256(img).hexdigest(), 'source': src_url, 'license': 'CC0-1.0'}); have.add(irel)
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    credits = (OUT / 'CREDITS.md').read_text().rstrip('\n').split('\n') if (OUT / 'CREDITS.md').exists() else ['# Offline Blender assets', '', 'All entries are CC0-1.0; licenses checked at import.', '']
    known = '\n'.join(credits)
    for e in manifest:
        if e['path'] not in known: credits.append(f'- {e["path"]}: {e["source"]} — {e["license"]}, SHA-256 `{e["sha256"]}`')
    (OUT / 'CREDITS.md').write_text('\n'.join(credits) + '\n')
    print('added', len(models), 'models; manifest now', len(manifest))


if __name__ == '__main__':
    add(sys.argv[1:])
