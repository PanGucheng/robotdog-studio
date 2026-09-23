#!/usr/bin/env python3
"""Compute a deterministic source-input hash for RobotDog firmware builds."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


EXCLUDED_DIRS = {".git", "build", "obj", "out", "bin", ".vscode", ".eide", ".mrs"}
EXCLUDED_SUFFIXES = {".o", ".d", ".elf", ".hex", ".bin", ".map", ".lst"}


def iter_files(root: Path):
    for path in sorted(root.rglob("*")):
        rel = path.relative_to(root)
        if any(part in EXCLUDED_DIRS for part in rel.parts):
            continue
        if not path.is_file():
            continue
        if path.suffix.lower() in EXCLUDED_SUFFIXES:
            continue
        yield rel, path


def compute_hash(root: Path) -> tuple[str, list[str]]:
    digest = hashlib.sha256()
    files: list[str] = []

    for rel, path in iter_files(root):
        rel_text = rel.as_posix()
        files.append(rel_text)
        digest.update(rel_text.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")

    return digest.hexdigest(), files


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    source_hash, files = compute_hash(args.root.resolve())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(
            {
                "algorithm": "sha256(path + nul + contents + nul)",
                "sourceInputHash": source_hash,
                "fileCount": len(files),
                "files": files,
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
