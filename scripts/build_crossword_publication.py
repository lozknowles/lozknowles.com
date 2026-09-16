#!/usr/bin/env python3
"""Build the exact pinned Crossword Studio revision into the public artefact."""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def build_crossword(output: Path, source: Path | None = None) -> None:
    spec = json.loads((ROOT / 'config/crossword-studio.json').read_text(encoding='utf-8'))
    source = source or Path(os.environ.get('CROSSWORD_BUILDER_REPO', ROOT / 'build/dependencies/crossword-studio'))
    source = source.resolve()
    if not source.exists():
        source.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(['git', 'clone', spec['repository'], str(source)], check=True)
        subprocess.run(['git', 'checkout', '--detach', spec['commit']], cwd=source, check=True)
    actual = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=source, text=True).strip()
    if actual != spec['commit'] or subprocess.check_output(['git', 'status', '--porcelain'], cwd=source).strip():
        raise ValueError('Crossword source must be clean and match config/crossword-studio.json; do not reset an existing checkout.')
    pnpm = os.environ.get('PNPM', 'pnpm.cmd' if os.name == 'nt' else 'pnpm')
    env = dict(os.environ)
    env.pop('VITE_ARTICLE_API', None)  # Website always uses its own endpoint.
    for args in [('install', '--frozen-lockfile'), ('run', 'build:website')]:
        subprocess.run([pnpm, *args], cwd=source, env=env, check=True)
    destination = output / 'crossword'
    if destination.exists():
        raise ValueError('Crossword output already exists; use a fresh publication directory.')
    destination.mkdir(parents=True)
    for path in (source / 'dist').rglob('*'):
        if path.is_dir():
            continue
        relative = path.relative_to(source / 'dist')
        if relative.as_posix() == 'github-hero.svg':
            continue  # README artwork belongs in the source repository only.
        allowed = relative.as_posix() in ('index.html', 'crossword-workshop.svg') or (relative.parts[0] == 'assets' and path.suffix in ('.js', '.mjs', '.css'))
        if path.is_symlink() or not allowed:
            raise ValueError(f'Unexpected Crossword publication file: {relative}')
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, target)
    # Provenance is kept outside the public artefact.
    manifest = {'builder_commit': actual, 'files': {p.relative_to(output).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in destination.rglob('*') if p.is_file()}}
    (ROOT / 'build/crossword-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
