#!/usr/bin/env python3
"""Run host-side RobotDog tests where local tooling is available."""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PYTHON = sys.executable


def run(cmd: list[str], **kwargs) -> subprocess.CompletedProcess[str]:
    print("+", " ".join(str(part) for part in cmd))
    return subprocess.run(cmd, cwd=ROOT, text=True, check=True, **kwargs)


def run_config_tests() -> None:
    work = ROOT / "build" / "host-tests" / "config"
    work.mkdir(parents=True, exist_ok=True)
    good_yaml = work / "good.yaml"
    good_header = work / "student_config.generated.h"
    good_yaml.write_text("turn_strength: 1\nline_target: 127\n", encoding="utf-8")
    run([PYTHON, "tools/generate_student_config.py", str(good_yaml), str(good_header)])
    generated = good_header.read_text(encoding="utf-8")
    assert "STUDENT_CONFIG_TURN_STRENGTH 1U" in generated
    assert "STUDENT_CONFIG_LINE_TARGET 127U" in generated

    bad_cases = {
        "missing.yaml": "turn_strength: 18\n",
        "duplicate.yaml": "turn_strength: 18\nturn_strength: 19\nline_target: 64\n",
        "nonnumeric.yaml": "turn_strength: fast\nline_target: 64\n",
        "range.yaml": "turn_strength: 31\nline_target: 64\n",
    }
    for name, content in bad_cases.items():
        path = work / name
        path.write_text(content, encoding="utf-8")
        result = subprocess.run(
            [PYTHON, "tools/generate_student_config.py", str(path), str(work / f"{name}.h")],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        assert result.returncode != 0, name
    print("config generator tests passed")


def find_c_compiler() -> str | None:
    env_cc = os.environ.get("CC")
    if env_cc:
        return env_cc
    for name in ("gcc", "clang", "cc"):
        found = shutil.which(name)
        if found:
            return found
    return None


def run_c_tests(cc_override: str | None, require_compiler: bool) -> None:
    cc = cc_override or find_c_compiler()
    if cc is None:
        message = "C compiler not found; install LLVM/MinGW GCC or pass --cc <compiler>"
        if require_compiler:
            raise RuntimeError(message)
        print(message + "; skipping host C tests")
        return

    out_dir = ROOT / "build" / "host-tests"
    out_dir.mkdir(parents=True, exist_ok=True)
    exe = out_dir / ("host_tests.exe" if os.name == "nt" else "host_tests")
    cmd = [
        cc,
        "-std=c99",
        "-Wall",
        "-Wextra",
        "-IUser",
        "-ICore/Inc",
        "tests/host_tests.c",
        "User/robotdog_protocol.c",
        "User/robotdog_text.c",
        "User/robotdog_tx_queue.c",
        "User/robotdog_telemetry.c",
        "User/robotdog_types.c",
        "User/robotdog_safety.c",
        "User/robotdog_student_bridge.c",
        "Core/Src/student_control.c",
        "-o",
        str(exe),
    ]
    run(cmd)
    run([str(exe)])


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cc", help="Desktop C compiler executable (gcc, clang, or cc)")
    parser.add_argument(
        "--require-c-compiler",
        action="store_true",
        help="Fail instead of skipping when no desktop C compiler is available",
    )
    args = parser.parse_args()

    run_config_tests()
    run_c_tests(args.cc, args.require_c_compiler)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
