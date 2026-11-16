"""Read access to the full CC0 object library (5,000+ GLB models) that ships in the worker image under assets/library.

The Advanced renderer may place any library model by id ("pack/name") without a hand-written registry entry. Only ids that are in
the library catalog resolve; nothing is fetched and no caller-chosen path is ever opened. LIBRARY_DIR overrides the location (tests).
"""
import json, os
from functools import lru_cache
from pathlib import Path

HERE = Path(__file__).resolve().parent
LIB_DIR = Path(os.environ.get('LIBRARY_DIR') or HERE.parent / 'assets' / 'library')


@lru_cache(maxsize=1)
def catalog():
    f = LIB_DIR / 'catalog.json'
    if not f.exists(): return {}
    return {o['id']: o for o in json.loads(f.read_text()) if o.get('type') == 'model'}


def known(model_id):
    """True when the id is a real library model whose file is present."""
    return isinstance(model_id, str) and model_id in catalog() and (LIB_DIR / f'{model_id}.glb').exists()


def path(model_id):
    if not known(model_id): raise ValueError(f'Unknown library model {model_id!r}')
    return str(LIB_DIR / f'{model_id}.glb')
