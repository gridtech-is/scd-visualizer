#!/usr/bin/env python3
"""
IEC 61850 SCD parser + validator + CSV exporter.

Behavior:
- By default, finds exactly one IEC file in the script directory.
- Parses Devices/Communication, MMS, GOOSE, and SV structures.
- Runs validation checks #1-#18 as requested.
- Exports:
  - validation_results.csv
  - out_MMS.csv
  - out_MMS_datasets.csv
  - out_goose.csv
  - out_goose_datasets.csv
  - out_sv.csv
  - IEDs_SW_filter_template.csv

Exit codes:
  0 – success, all validation checks passed
  1 – validation errors found (parse succeeded, outputs written)
  2 – parse/IO error (no outputs written)
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path
from typing import Sequence

from scd_export import write_outputs
from scd_parser import parse_scd
from scd_validations import run_validations


logger = logging.getLogger(__name__)

IEC_SUFFIXES = {".scd", ".ssd", ".cid", ".icd", ".sed", ".xml"}


def find_single_iec_file(script_dir: Path) -> Path:
    candidates = sorted(p for p in script_dir.iterdir() if p.is_file() and p.suffix.lower() in IEC_SUFFIXES)
    if len(candidates) == 0:
        raise FileNotFoundError(
            f"No IEC file found in script directory: {script_dir}. "
            f"Expected exactly one file with suffix in {sorted(IEC_SUFFIXES)}."
        )
    if len(candidates) > 1:
        names = ", ".join(p.name for p in candidates)
        raise RuntimeError(
            f"Found multiple IEC files in script directory ({len(candidates)}): {names}. "
            "Keep only one file or use --input."
        )
    return candidates[0]


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="IEC 61850 SCD parser/validator and CSV exporter.")
    parser.add_argument(
        "--input",
        type=Path,
        default=None,
        help="Optional path to SCD/IEC XML file. If omitted, script auto-detects exactly one IEC file in script directory.",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help="Output directory for CSV files (default: script directory).",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable verbose (DEBUG) logging.",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str]) -> int:
    args = parse_args(argv)
    log_level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(level=log_level, format="%(levelname)s: %(message)s")

    script_dir = Path(__file__).resolve().parent

    if args.input:
        input_path = args.input.resolve()
    else:
        try:
            input_path = find_single_iec_file(script_dir)
        except (FileNotFoundError, RuntimeError) as exc:
            logger.error("%s", exc)
            return 2

    out_dir = args.out_dir.resolve() if args.out_dir else script_dir

    logger.info("Parsing %s", input_path)
    try:
        parsed = parse_scd(input_path)
    except Exception as exc:
        logger.error("Failed to parse %s: %s", input_path, exc)
        return 2

    logger.debug("Parsed %d IED(s), %d GOOSE, %d SV, %d MMS controls",
                 len(parsed.ied_names), len(parsed.goose_controls),
                 len(parsed.sv_controls), len(parsed.mms_controls))

    validation = run_validations(parsed)
    write_outputs(parsed, validation, out_dir)

    failures = [s for s in validation.summaries if s.status == "FAIL"]
    if failures:
        logger.warning("%d validation check(s) FAILED:", len(failures))
        for s in failures:
            logger.warning("  [%s] %s – %s", s.check_id, s.check_name, s.summary)
    else:
        logger.info("All %d validation checks passed.", len(validation.summaries))

    logger.info("Input file:       %s", input_path)
    logger.info("Output directory: %s", out_dir)
    logger.debug("Generated: validation_results.csv, out_MMS.csv, out_MMS_datasets.csv, "
                 "out_goose.csv, out_goose_datasets.csv, out_sv.csv, IEDs_SW_filter_template.csv")

    return 1 if failures else 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except Exception as exc:
        logging.basicConfig(level=logging.ERROR, format="%(levelname)s: %(message)s")
        logger.error("Unexpected error: %s", exc)
        sys.exit(2)
