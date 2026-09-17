"""Build the pinned browser-only photo and camera demo into its own route."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

if __package__:
    from .site_shell import render_page
else:
    from site_shell import render_page

ROOT = Path(__file__).resolve().parents[1]
CREDITS = {
    'code-LICENSE.txt', 'typegpu-LICENSE.txt', 'third-party-notices.txt',
    'photo-NOTICE.txt', 'model-LICENSE.txt', 'model-NOTICE.txt', 'model-card.txt',
}


def build_monocular(output: Path, source: Path | None = None) -> None:
    spec = json.loads((ROOT / 'config/monocular-demo.json').read_text(encoding='utf-8'))
    source = source or Path(os.environ.get('MONOCULAR_REPO', ROOT / 'build/dependencies/monocular'))
    source = source.resolve()
    if not source.exists():
        source.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(['git', 'clone', spec['repository'], str(source)], check=True)
        subprocess.run(['git', 'checkout', '--detach', spec['commit']], cwd=source, check=True)
    actual = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=source, text=True).strip()
    if actual != spec['commit'] or subprocess.check_output(['git', 'status', '--porcelain'], cwd=source).strip():
        raise ValueError('Monocular source must be clean and match config/monocular-demo.json.')
    pnpm = os.environ.get('PNPM', 'pnpm.cmd' if os.name == 'nt' else 'pnpm')
    for args in [('install', '--frozen-lockfile'), ('run', 'models:fetch'), ('run', 'build:website')]:
        subprocess.run([pnpm, *args], cwd=source, check=True)

    destination = output / 'monocular'
    destination.mkdir(parents=True, exist_ok=False)
    required = {'index.html', '.htaccess', 'favicon.svg', 'demo.jpg'}
    required.update('credits/' + name for name in CREDITS)
    required.update('models/' + name for name in spec['models'])
    seen = set()
    for path in (source / 'dist').rglob('*'):
        if path.is_dir():
            continue
        relative = path.relative_to(source / 'dist')
        name = relative.as_posix()
        asset = len(relative.parts) == 2 and relative.parts[0] == 'assets' and path.suffix in {'.js', '.css'}
        if path.is_symlink() or not (name in required or asset):
            raise ValueError(f'Unexpected Monocular publication file: {name}')
        data = path.read_bytes()
        expected = spec['photo_sha256'] if name == 'demo.jpg' else spec['models'].get(relative.name)
        if expected and hashlib.sha256(data).hexdigest() != expected:
            raise ValueError(f'Monocular asset does not match its reviewed pin: {name}')
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, target)
        seen.add(name)
    if required - seen:
        raise ValueError(f'Missing Monocular files: {sorted(required - seen)}')
    entry = destination / 'index.html'
    entry.write_text(render_page(entry.read_text(encoding='utf-8'), 'monocular'), encoding='utf-8', newline='\n')
    manifest = {
        'source_commit': actual,
        'files': {p.relative_to(output).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
                  for p in destination.rglob('*') if p.is_file()},
    }
    (ROOT / 'build/monocular-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
