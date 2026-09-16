#!/usr/bin/env python3
"""Install a reviewed, hash-checked crossword release on the website host.

Run with the explicit host paths in the operator's release manifest. Only the
crossword route, its reader, its nav CSS and the homepage may be changed.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import time
import urllib.request
from pathlib import Path

SERVICE = 'loz-crossword-article.service'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def install(stage: Path, web: Path, backup: Path, vhost: Path, route: Path, service_root: Path):
    manifest = json.loads((stage / 'release.json').read_text())
    commit = manifest['builder_commit']
    if not re.fullmatch('[a-f0-9]{40}', commit):
        raise ValueError('Invalid builder revision')
    web = web.resolve()
    for private in (backup, service_root):
        if private.resolve() == web or web in private.resolve().parents:
            raise ValueError('Backups and service source must remain outside the web root')
    if backup.exists():
        raise ValueError('Use a new backup directory for each release')
    files = manifest['files']
    if not {'index.html', 'assets/crossword-nav.css', 'crossword/index.html'} <= files.keys():
        raise ValueError('Incomplete crossword release')
    for name, expected in files.items():
        relative = Path(name)
        if relative.is_absolute() or '..' in relative.parts or not (name in ('index.html', 'assets/crossword-nav.css') or name.startswith('crossword/')):
            raise ValueError('Out-of-scope publication file')
        target = (web / relative).resolve()
        if web not in target.parents or digest(stage / 'public' / relative) != expected:
            raise ValueError('Publication path or hash mismatch')
    for name, expected in manifest['baseline'].items():
        if digest(web / name) != expected:
            raise ValueError(f'Live baseline changed: {name}')
    if digest(vhost) != manifest['vhost_sha256']:
        raise ValueError('Apache virtual host changed since review')
    reader = stage / 'article_service.py'
    if digest(reader) != manifest['service_sha256']:
        raise ValueError('Article reader does not match the release')
    # This installer makes the first integration explicit; later service/route
    # upgrades require a separately reviewed manifest and deployment procedure.
    unit = Path('/etc/systemd/system') / SERVICE
    if route.exists() or unit.exists() or (web / 'crossword').exists():
        raise ValueError('Crossword is already installed; review an upgrade instead')
    backup.mkdir(parents=True)
    snapshots = {}
    for target in [vhost, route, unit, *(web / name for name in files)]:
        if target.exists():
            saved = backup / str(len(snapshots))
            shutil.copy2(target, saved)
            snapshots[str(target)] = str(saved)
        else:
            snapshots[str(target)] = None
    (backup / 'restore.json').write_text(json.dumps(snapshots, indent=2))
    shutil.copyfile(stage / 'release.json', backup / 'release.json')

    def atomic(target, content):
        target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
        # The host's restrictive umask otherwise makes new public directories
        # inaccessible to Apache. Normalise only directories within this route.
        directory = target.parent
        while web in directory.parents and directory != web:
            directory.chmod(0o755)
            directory = directory.parent
        temporary = target.with_name(target.name + '.crossword-new')
        temporary.write_bytes(content)
        temporary.chmod(0o644)
        os.replace(temporary, target)

    started = False
    try:
        version = service_root / 'releases' / commit
        version.mkdir(parents=True, mode=0o755)
        for directory in (service_root, service_root / 'releases', version):
            directory.chmod(0o755)
        atomic(version / 'article_service.py', reader.read_bytes())
        atomic(unit, f'''[Unit]
Description=Crossword Studio public article reader
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
DynamicUser=yes
ExecStart=/usr/bin/python3 -B {version}/article_service.py --port 8793
Restart=on-failure
RestartSec=3
NoNewPrivileges=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectSystem=strict
ProtectHome=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
MemoryMax=192M
TasksMax=64
UMask=0077

[Install]
WantedBy=multi-user.target
'''.encode())
        atomic(route, b'''# Only the public article form is proxied. Documents stay in the browser.
ProxyPassMatch "^/crossword/api/(article)$" "http://127.0.0.1:8793/$1" connectiontimeout=5 timeout=30
ProxyPassReverse "/crossword/api/article" "http://127.0.0.1:8793/article"
<LocationMatch "^/crossword/api/article$">
    LimitRequestBody 4096
    RequestHeader set X-Crossword-Client "expr=%{REMOTE_ADDR}"
</LocationMatch>
''')
        original = vhost.read_text()
        lines = original.splitlines(keepends=True)
        matches = [i for i, line in enumerate(lines) if 'DocumentRoot ' in line and str(web) in line]
        if len(matches) != 1:
            raise ValueError('Cannot identify the reviewed virtual host DocumentRoot')
        lines.insert(matches[0] + 1, f'    Include {route}\n')
        atomic(vhost, ''.join(lines).encode())
        subprocess.run(['apache2ctl', 'configtest'], check=True)
        subprocess.run(['systemctl', 'daemon-reload'], check=True)
        started = True
        subprocess.run(['systemctl', 'enable', '--now', SERVICE], check=True)
        for attempt in range(20):
            try:
                with urllib.request.urlopen('http://127.0.0.1:8793/health', timeout=2) as response:
                    if json.load(response).get('ok') is True:
                        break
            except OSError:
                time.sleep(.2)
        else:
            raise RuntimeError('Article reader failed its health check')
        for name in sorted(files, key=lambda n: (n.endswith('index.html'), n)):
            if name != 'index.html':
                atomic(web / name, (stage / 'public' / name).read_bytes())
        subprocess.run(['systemctl', 'reload', 'apache2'], check=True)
        atomic(web / 'index.html', (stage / 'public/index.html').read_bytes())
        for name, expected in files.items():
            if digest(web / name) != expected:
                raise RuntimeError(f'Installed hash mismatch: {name}')
        print(json.dumps({'installed': True, 'builder_commit': commit, 'files': len(files), 'backup': str(backup)}))
    except BaseException:
        if started:
            subprocess.run(['systemctl', 'disable', '--now', SERVICE], check=False)
        for target_name, saved in reversed(list(snapshots.items())):
            target = Path(target_name)
            if saved:
                shutil.copy2(saved, target)
            else:
                target.unlink(missing_ok=True)
        subprocess.run(['systemctl', 'daemon-reload'], check=False)
        if subprocess.run(['apache2ctl', 'configtest']).returncode == 0:
            subprocess.run(['systemctl', 'reload', 'apache2'], check=False)
        raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ('stage', 'web', 'backup', 'vhost', 'route', 'service-root'):
        parser.add_argument('--' + key, required=True, type=Path)
    args = parser.parse_args()
    install(args.stage, args.web, args.backup, args.vhost, args.route, args.service_root)
