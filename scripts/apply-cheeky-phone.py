"""Apply one reviewed Cheeky Phone runtime, with drift guards and scoped rollback."""
import hashlib
import json
import os
import shutil
import sys
from pathlib import Path

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None

def apply(root, stage):
    root, stage = root.resolve(), stage.resolve()
    if not root.is_dir() or not (root / 'index.html').is_file():
        raise RuntimeError('Verified document root and existing homepage required.')
    if stage == root or root in stage.parents:
        raise RuntimeError('Staging and backups must be outside the public tree.')
    manifest = json.loads((stage / 'runtime.json').read_text())
    permitted = {'cheeky-phone.html', 'assets/cheeky-phone.css', 'assets/cheeky-phone.js', 'assets/cheeky-water.js', 'assets/cheeky-scene.js', 'assets/cheeky-lines.js', 'assets/cheeky-clips.js', 'assets/cheeky-audio.js', 'assets/cheeky-george.mp3'}
    if {entry['path'] for entry in manifest} != permitted or len(manifest) != len(permitted):
        raise RuntimeError('Exactly the reviewed nine runtime files are required.')
    for entry in manifest:
        target, source = root / entry['path'], stage / 'new' / entry['path']
        if target.is_symlink() or target.parent.is_symlink() or not target.parent.is_dir():
            raise RuntimeError('Unexpected target directory or symlink: ' + entry['path'])
        if digest(source) != entry['sha256']:
            raise RuntimeError('Staged payload differs from reviewed manifest: ' + entry['path'])
        if digest(target) not in (entry['baseline'], entry['sha256']):
            raise RuntimeError('Live runtime drift; nothing replaced: ' + entry['path'])
        entry['before'] = digest(target)
    backup = stage / 'backup'; backup.mkdir()
    for entry in manifest:
        if entry['before'] is not None:
            dest = backup / entry['path']; dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(root / entry['path'], dest)
    (stage / 'rollback.json').write_text(json.dumps(manifest, indent=2))
    applied = []
    try:
        # Dependencies first; the HTML reference is the final switch.
        for entry in sorted(manifest, key=lambda item: item['path'] == 'cheeky-phone.html'):
            target = root / entry['path']
            if digest(target) != entry['before']:
                raise RuntimeError('Live runtime changed during transfer: ' + entry['path'])
            temporary = target.with_name(target.name + '.cheeky-upload')
            if temporary.exists() or temporary.is_symlink():
                raise RuntimeError('Unexpected temporary upload path.')
            try:
                shutil.copyfile(stage / 'new' / entry['path'], temporary)
                temporary.chmod(0o644); os.replace(temporary, target)
            finally:
                temporary.unlink(missing_ok=True)
            applied.append(entry)
        for entry in manifest:
            if digest(root / entry['path']) != entry['sha256']:
                raise RuntimeError('Installed hash mismatch: ' + entry['path'])
    except Exception:
        for entry in reversed(applied):
            target = root / entry['path']
            # Do not overwrite an independent change made after our replacement.
            if digest(target) != entry['sha256']:
                continue
            if entry['before'] is None:
                target.unlink()
            else:
                temporary = target.with_name(target.name + '.cheeky-rollback')
                shutil.copyfile(backup / entry['path'], temporary); temporary.chmod(0o644); os.replace(temporary, target)
        raise
    print('Installed nine runtime files; rollback retained at ' + str(stage))

if __name__ == '__main__':
    apply(Path(sys.argv[1]), Path(sys.argv[2]))
