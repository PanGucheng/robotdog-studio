#!/usr/bin/env python3
"""Generate the RobotDog student configuration header from a tiny YAML subset."""

from __future__ import annotations

import argparse
from pathlib import Path


RANGES = {
    "turn_strength": (1, 30),
    "line_target": (0, 127),
}


def parse_config(path: Path) -> dict[str, int]:
    values: dict[str, int] = {}

    for line_no, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw_line.split("#", 1)[0].strip()
        if not line:
            continue
        if ":" not in line:
            raise ValueError(f"{path}:{line_no}: expected 'key: value'")

        key, raw_value = [part.strip() for part in line.split(":", 1)]
        if key not in RANGES:
            raise ValueError(f"{path}:{line_no}: unknown key '{key}'")
        if key in values:
            raise ValueError(f"{path}:{line_no}: duplicate key '{key}'")
        if not raw_value or not raw_value.isdigit():
            raise ValueError(f"{path}:{line_no}: '{key}' must be an integer")

        value = int(raw_value, 10)
        low, high = RANGES[key]
        if value < low or value > high:
            raise ValueError(f"{path}:{line_no}: '{key}' must be in range {low}..{high}")
        values[key] = value

    for key in RANGES:
        if key not in values:
            raise ValueError(f"{path}: missing required key '{key}'")

    return values


def write_header(values: dict[str, int], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        "\n".join(
            [
                "#ifndef STUDENT_CONFIG_GENERATED_H",
                "#define STUDENT_CONFIG_GENERATED_H",
                "",
                f"#define STUDENT_CONFIG_TURN_STRENGTH {values['turn_strength']}U",
                f"#define STUDENT_CONFIG_LINE_TARGET {values['line_target']}U",
                "",
                "#if (STUDENT_CONFIG_TURN_STRENGTH < 1U) || (STUDENT_CONFIG_TURN_STRENGTH > 30U)",
                '#error "STUDENT_CONFIG_TURN_STRENGTH must be in range 1..30"',
                "#endif",
                "",
                "#if (STUDENT_CONFIG_LINE_TARGET > 127U)",
                '#error "STUDENT_CONFIG_LINE_TARGET must be in range 0..127"',
                "#endif",
                "",
                "#endif /* STUDENT_CONFIG_GENERATED_H */",
                "",
            ]
        ),
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("config", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    try:
        write_header(parse_config(args.config), args.output)
    except ValueError as exc:
        parser.exit(2, f"error: {exc}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
