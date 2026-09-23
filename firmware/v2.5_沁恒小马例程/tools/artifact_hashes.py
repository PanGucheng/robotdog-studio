#!/usr/bin/env python3
"""Write SHA-256 hashes for firmware artifacts."""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("artifacts", type=Path, nargs="+")
    args = parser.parse_args()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    lines = []
    for artifact in args.artifacts:
        lines.append(f"{file_hash(artifact)}  {artifact.name}")
    args.output.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
