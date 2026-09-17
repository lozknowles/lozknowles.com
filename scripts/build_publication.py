#!/usr/bin/env python3
"""Create the allowlisted, scan-clean static publication artefact."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

if __package__:
    from .publication_privacy import scan_artifact, load_allowlist, split_allowed
    from .build_crossword_publication import build_crossword
    from .build_monocular_publication import build_monocular
    from .site_shell import apply_site_shell
else:
    from publication_privacy import scan_artifact, load_allowlist, split_allowed
    from build_crossword_publication import build_crossword
    from build_monocular_publication import build_monocular
    from site_shell import apply_site_shell


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "build" / "publication"

ROOT_FILES = (
    ".htaccess",
    "404.html",
    "index.html",
    "cv.html",
    "references.html",
    "murmuration.html",
    "arcade.html",
    "cheeky-phone.html",
    "agent-control.html",
    "cartoon-collingham.html",
    "LawrenceKnowlesProfessionalProfile.pdf",
)
ASSET_FILES = (
    "cards-DKxM1AoQ.jpg",
    "cv-page.js",
    "cv-popup.js",
    "cv.css",
    "agent-control.css",
    "cartoon-view.css",
    "references-page.js",
    "flowers-yU5JYxV5.jpg",
    "hand-sgfIbAv9.jpg",
    "index-BDTMFuqh.css",
    "index-qfeM6zl_.js",
    "murmuration.css",
    "arcade.css",
    "arcade.js",
    "arcade-cube.js",
    "arcade-cube.css",
    "arcade-games.js",
    "three-0.160.0.module.min.js",
    "three-LICENSE.txt",
    "arcade-centipede.js",
    "arcade-nav.css",
    "crossword-nav.css",
    "site-shell.css",
    "site-shell.js",
    "arcade-sequence.css",
    "arcade-scene.html",
    "cheeky-phone.css",
    "cheeky-phone.js",
    "cheeky-water.js",
    "cheeky-scene.js",
    "cheeky-lines.js",
    "cheeky-clips.js",
    "cheeky-audio.js",
    "cheeky-george.mp3",
    "cheeky-nav.css",
    "murmuration.js",
    "music-player.css",
    "music-player.js",
    "please-calm-my-mind.mp3",
    "project-video.css",
    "project-video.js",
    "spacebike-_U_Kk2gp.jpg",
    "space-bike-gameplay.jpg",
    "wisteria-CwTjyfrc.jpg",
    "ww1-BRtzddHk.jpg",
)


def make_public_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    path.chmod(0o755)


def normalise_public_permissions(output: Path) -> None:
    for path in (output, *output.rglob("*")):
        path.chmod(0o755 if path.is_dir() else 0o644)


def copy_file(relative: Path, output: Path) -> None:
    source = ROOT / relative
    if not source.is_file():
        raise FileNotFoundError(f"Required publication file is missing: {relative.as_posix()}")
    destination = output / relative
    make_public_directory(destination.parent)
    shutil.copyfile(source, destination)
    destination.chmod(0o644)


def prepare_output(output: Path) -> None:
    output = output.resolve()
    safe_default = DEFAULT_OUTPUT.resolve()
    if output == ROOT.resolve() or output in ROOT.resolve().parents:
        raise ValueError("Refusing to use the repository or one of its parents as the build output")
    if output.exists():
        if output != safe_default:
            raise ValueError(f"Refusing to replace non-default output directory: {output}")
        shutil.rmtree(output)
    make_public_directory(output)


def copy_arcade_media(source: Path, output: Path) -> None:
    """Include only the reviewed gameplay edit from external media storage."""
    spec = json.loads((ROOT / "config" / "arcade-media.json").read_text(encoding="utf-8"))
    relative = Path(spec["path"])
    if len(relative.parts) != 3 or relative.parts[:2] != ("assets", "videos"):
        raise ValueError("Unexpected arcade media destination")
    data = source.read_bytes()
    if len(data) != spec["bytes"] or hashlib.sha256(data).hexdigest() != spec["sha256"]:
        raise ValueError("Arcade media does not match the reviewed gameplay edit")
    target = output / relative
    make_public_directory(target.parent)
    target.write_bytes(data)
    target.chmod(0o644)


def build(output: Path, arcade_media: Path | None = None) -> None:
    output = output.resolve()
    prepare_output(output)
    for name in ROOT_FILES:
        copy_file(Path(name), output)
    for name in ASSET_FILES:
        copy_file(Path("assets") / name, output)
    if arcade_media is not None:
        copy_arcade_media(arcade_media, output)
    # The reviewed scene-only derivative is pinned independently of the full app.
    cartoon = json.loads((ROOT / 'config/cartoon-view.json').read_text(encoding='utf-8'))
    for name, expected in cartoon['files'].items():
        relative = Path(name)
        if not relative.is_relative_to('cartoon-view') or '..' in relative.parts:
            raise ValueError('Unexpected Cartoon Collingham publication path')
        if hashlib.sha256((ROOT / relative).read_bytes()).hexdigest() != expected:
            raise ValueError(f'Cartoon Collingham artifact changed: {name}')
        copy_file(relative, output)
    build_crossword(output)
    apply_site_shell(output)
    build_monocular(output)
    # The embedded header changes the built entry page; record the shipped bytes.
    manifest_path = ROOT / 'build/crossword-manifest.json'
    crossword_manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    crossword_manifest['files']['crossword/index.html'] = hashlib.sha256((output / 'crossword/index.html').read_bytes()).hexdigest()
    manifest_path.write_text(json.dumps(crossword_manifest, indent=2) + '\n', encoding='utf-8')
    normalise_public_permissions(output)
    findings, _ = split_allowed(scan_artifact(output), load_allowlist(ROOT / 'config/publication-privacy-allowlist.json'))
    if findings:
        for finding in findings:
            print(f"FAIL {finding.code}: {finding.path} ({finding.detail})", file=sys.stderr)
        raise RuntimeError(f"Publication artefact failed privacy scan with {len(findings)} finding(s)")

    files = [path for path in output.rglob("*") if path.is_file()]
    total_bytes = sum(path.stat().st_size for path in files)
    print(f"Built scan-clean publication artefact: {output} ({len(files)} files, {total_bytes} bytes)")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--arcade-media", type=Path, help="Reviewed gameplay MP4 from external media storage")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    try:
        build(args.output, args.arcade_media)
    except (FileNotFoundError, RuntimeError, ValueError) as error:
        print(error, file=sys.stderr)
        raise SystemExit(1)
