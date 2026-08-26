#!/usr/bin/env python3
"""Create the allowlisted, scan-clean static publication artefact."""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

if __package__:
    from .publication_privacy import scan_artifact
else:
    from publication_privacy import scan_artifact


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "build" / "publication"

ROOT_FILES = (
    ".htaccess",
    "404.html",
    "index.html",
    "cv.html",
    "murmuration.html",
    "LawrenceKnowlesProfessionalProfile.pdf",
)
ASSET_FILES = (
    "cards-DKxM1AoQ.jpg",
    "cv-page.js",
    "cv-popup.js",
    "cv.css",
    "flowers-yU5JYxV5.jpg",
    "hand-sgfIbAv9.jpg",
    "index-BDTMFuqh.css",
    "index-qfeM6zl_.js",
    "murmuration.css",
    "murmuration.js",
    "music-player.css",
    "music-player.js",
    "please-calm-my-mind.mp3",
    "project-video.css",
    "project-video.js",
    "spacebike-_U_Kk2gp.jpg",
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


def build(output: Path) -> None:
    output = output.resolve()
    prepare_output(output)
    for name in ROOT_FILES:
        copy_file(Path(name), output)
    for name in ASSET_FILES:
        copy_file(Path("assets") / name, output)
    normalise_public_permissions(output)
    findings = scan_artifact(output)
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
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    try:
        build(args.output)
    except (FileNotFoundError, RuntimeError, ValueError) as error:
        print(error, file=sys.stderr)
        raise SystemExit(1)
