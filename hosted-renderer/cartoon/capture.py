"""Offline, atomic frame capture for a prepared trusted worker scene.
Only a hash-compatible checkpoint can resume. No remote asset serving.
"""
import argparse
import asyncio
import hashlib
import json
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
from PIL import Image
from playwright.async_api import async_playwright

def fingerprint(root):
    digest = hashlib.sha256()
    for p in sorted(root.rglob('*')):
        if p.is_symlink():
            raise ValueError('Scene symlinks are forbidden')
        if p.is_file():
            digest.update(str(p.relative_to(root)).encode()); digest.update(p.read_bytes())
    return digest.hexdigest()

def valid_frame(path, metadata):
    if not path.is_file() or not metadata:
        return False
    try:
        with Image.open(path) as image:
            image.load()
            if image.size != (1080, 1920): return False
        return hashlib.sha256(path.read_bytes()).hexdigest() == metadata.get('sha256')
    except Exception:
        return False

def atomic_json(path, value):
    tmp = path.with_suffix('.tmp'); tmp.write_text(json.dumps(value, indent=2)); tmp.replace(path)

async def capture(args):
    root, out = Path(args.web).resolve(), Path(args.out).resolve()
    if not root.is_dir() or out == root or root in out.parents:
        raise ValueError('Use a separate output directory')
    signature = fingerprint(root)
    out.mkdir(parents=True, exist_ok=True)
    checkpoint = out / 'checkpoint.json'
    saved = json.loads(checkpoint.read_text()) if checkpoint.exists() else {'input_hash': signature, 'frames': {}}
    if saved['input_hash'] != signature: raise ValueError('Inputs changed; stale frames cannot resume')
    class Assets(SimpleHTTPRequestHandler):
        def log_message(self, *unused): pass
        def do_GET(self):
            try:
                name = unquote(urlsplit(self.path).path).lstrip('/') or 'index.html'
                path = (root / name).resolve()
                if not path.is_relative_to(root) or not path.is_file() or path.suffix not in ('.html', '.js', '.json'):
                    self.send_error(404); return
                self.path = '/' + str(path.relative_to(root))
                super().do_GET()
            except Exception: self.send_error(400)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Assets, directory=str(root)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
            try:
                page = await browser.new_page(viewport={'width': 1280, 'height': 1800})
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                await page.goto(f'http://localhost:{server.server_port}', wait_until='load')
                await page.wait_for_function('window.ready || window.err', timeout=60000)
                total = await page.evaluate('window.TOTAL')
                if not isinstance(total, int) or total < 1 or args.first < 0 or args.last < args.first or args.last >= total:
                    raise ValueError('Invalid frame range')
                for frame in range(args.first, args.last + 1):
                    if (out / 'CANCEL').exists(): raise ValueError('Cancelled')
                    file = out / f'f{frame:06d}.jpg'
                    if valid_frame(file, saved['frames'].get(str(frame))): continue
                    encoded = await page.evaluate('(f) => { window.renderFrame(f); if (window.err) throw Error(window.err); return document.querySelector("canvas").toDataURL("image/jpeg", .95).split(",")[1]; }', frame)
                    if errors: raise ValueError('; '.join(errors))
                    import base64
                    tmp = file.with_suffix('.tmp'); tmp.write_bytes(base64.b64decode(encoded))
                    metadata = {'sha256': hashlib.sha256(tmp.read_bytes()).hexdigest()}
                    if not valid_frame(tmp, metadata): raise ValueError('Invalid captured image')
                    tmp.replace(file); saved['frames'][str(frame)] = metadata
                    atomic_json(checkpoint, saved)
                    print(json.dumps({'frame': frame, 'total': total}), flush=True)
            finally: await browser.close()
    finally:
        server.shutdown(); server.server_close()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--web', required=True); parser.add_argument('--out', required=True)
    parser.add_argument('--first', type=int, required=True); parser.add_argument('--last', type=int, required=True)
    asyncio.run(capture(parser.parse_args()))