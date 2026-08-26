#!/usr/bin/env python3
"""Package only the Course Match browser runtime needed in production."""

from __future__ import annotations

import argparse
import re
import shutil
from pathlib import Path


ROOT_FILES = ("index.html", "styles.css", "app.js", "matcher-core.js", "courses.js")
TESSERACT_FILES = (
    "tesseract.min.js",
    "tesseract.min.js.LICENSE.txt",
    "worker.min.js",
    "worker.min.js.LICENSE.txt",
)
PDFJS_FILES = ("pdf.mjs", "pdf.worker.mjs")
SOURCE_MAP_DIRECTIVE = re.compile(
    rb"(?m)^\s*(?://[#@]\s*sourceMappingURL=.*|/\*[#@]\s*sourceMappingURL=.*?\*/)\s*(?:\r?\n|$)"
)


def make_public_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    path.chmod(0o755)


def normalise_public_permissions(output: Path) -> None:
    for path in (output, *output.rglob("*")):
        path.chmod(0o755 if path.is_dir() else 0o644)


def copy(source: Path, destination: Path) -> None:
    if not source.is_file():
        raise FileNotFoundError(f"Required Course Match runtime file is missing: {source}")
    make_public_directory(destination.parent)
    shutil.copyfile(source, destination)
    destination.chmod(0o644)


def strip_source_map_directive(path: Path) -> None:
    data = path.read_bytes()
    cleaned = SOURCE_MAP_DIRECTIVE.sub(b"", data)
    if cleaned != data:
        path.write_bytes(cleaned)


def build(source_root: Path, output: Path) -> None:
    source_root = source_root.resolve()
    output = output.resolve()
    if not source_root.is_dir():
        raise ValueError(f"Course Match source directory does not exist: {source_root}")
    if output.exists() and any(output.iterdir()):
        raise ValueError(f"Course Match output directory is not empty: {output}")
    make_public_directory(output)

    for name in ROOT_FILES:
        copy(source_root / name, output / name)
    for name in TESSERACT_FILES:
        copy(source_root / "vendor" / "tesseract" / name, output / "vendor" / "tesseract" / name)
    for name in PDFJS_FILES:
        copy(source_root / "vendor" / "pdfjs" / name, output / "vendor" / "pdfjs" / name)

    core_root = source_root / "vendor" / "tesseract-core"
    core_files = sorted(
        path
        for path in core_root.iterdir()
        if path.is_file() and (path.name == "LICENSE" or path.suffix in {".js", ".wasm"})
    )
    if not core_files:
        raise FileNotFoundError(f"Tesseract core runtime is missing: {core_root}")
    for path in core_files:
        copy(path, output / "vendor" / "tesseract-core" / path.name)

    tessdata = sorted((source_root / "vendor" / "tessdata").glob("*.traineddata*"))
    if not tessdata:
        raise FileNotFoundError("English Tesseract trained data is missing")
    for path in tessdata:
        copy(path, output / "vendor" / "tessdata" / path.name)

    for path in output.rglob("*"):
        if path.is_file() and path.suffix.lower() in {".js", ".mjs", ".css"}:
            strip_source_map_directive(path)
    normalise_public_permissions(output)

    files = [path for path in output.rglob("*") if path.is_file()]
    print(f"Built Course Match publication runtime: {len(files)} files")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_root", type=Path)
    parser.add_argument("output", type=Path)
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    try:
        build(args.source_root, args.output)
    except (FileNotFoundError, OSError, ValueError) as error:
        raise SystemExit(str(error))
