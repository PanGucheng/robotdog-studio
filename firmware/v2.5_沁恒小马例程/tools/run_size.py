#!/usr/bin/env python3
"""Run a size tool and capture its output."""

from __future__ import annotations

import argparse
import re
import subprocess
from pathlib import Path


SIZE_ROW = re.compile(
    r"^\s*(?P<text>\d+)\s+(?P<data>\d+)\s+(?P<bss>\d+)\s+(?P<dec>\d+)\s+(?P<hex>[0-9a-fA-F]+)\s+(?P<file>.+)$",
    re.MULTILINE,
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tool", required=True)
    parser.add_argument("--elf", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--flash-bytes", type=int, required=True)
    parser.add_argument("--minimum-flash-free", type=int, default=4096)
    parser.add_argument("--ram-bytes", type=int, required=True)
    args = parser.parse_args()

    result = subprocess.run(
        [args.tool, "--format=berkeley", str(args.elf)],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    if result.returncode != 0:
        args.output.write_text(result.stdout, encoding="utf-8")
        return result.returncode

    match = SIZE_ROW.search(result.stdout)
    if match is None:
        args.output.write_text(result.stdout + "\nERROR: unable to parse size output\n", encoding="utf-8")
        return 2

    text_bytes = int(match.group("text"))
    data_bytes = int(match.group("data"))
    bss_bytes = int(match.group("bss"))
    flash_used = text_bytes + data_bytes
    flash_free = args.flash_bytes - flash_used
    ram_used = data_bytes + bss_bytes
    report = (
        result.stdout.rstrip()
        + "\n\n"
        + f"flash_used_bytes={flash_used}\n"
        + f"flash_total_bytes={args.flash_bytes}\n"
        + f"flash_free_bytes={flash_free}\n"
        + f"minimum_flash_free_bytes={args.minimum_flash_free}\n"
        + f"ram_used_bytes={ram_used}\n"
        + f"ram_total_bytes={args.ram_bytes}\n"
    )

    errors: list[str] = []
    if flash_free < args.minimum_flash_free:
        errors.append(
            f"Flash reserve {flash_free} bytes is below required {args.minimum_flash_free} bytes"
        )
    if ram_used > args.ram_bytes:
        errors.append(f"RAM usage {ram_used} bytes exceeds {args.ram_bytes} bytes")

    if errors:
        report += "status=FAIL\n" + "\n".join(f"ERROR: {error}" for error in errors) + "\n"
        args.output.write_text(report, encoding="utf-8")
        return 3

    report += "status=PASS\n"
    args.output.write_text(report, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
