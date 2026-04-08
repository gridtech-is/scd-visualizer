# Python CLI

The Python CLI provides headless validation and CSV/report export, suitable for CI/CD pipelines.

## Requirements

- Python 3.10+
- No external packages (standard library only)

## Usage

```bash
python3 scd_validator.py --input <file.scd> --out-dir <output_directory>
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--input` | Yes | Path to the SCD/SCL file to validate |
| `--out-dir` | No | Directory for output files (default: `./out`) |

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | Validation passed — no errors |
| `1` | One or more validation errors found |
| `2` | Parse error or I/O error |

---

## Output files

All output files are written to `--out-dir`:

| File | Contents |
|------|----------|
| `goose_matrix.csv` | GOOSE publisher × subscriber matrix |
| `sv_matrix.csv` | Sampled Values publisher × subscriber matrix |
| `flows_detail.csv` | Detailed flow list with source/destination datasets |
| `protocol_summary.csv` | Per-protocol counts |
| `validation_report.csv` | All validation issues with code, severity, IED, and fix hint |

---

## Running tests

```bash
python3 -m pytest tests/ -v
```

Run a specific test:

```bash
python3 -m pytest tests/test_integration.py::test_iec001 -v
```

The test suite contains **38 integration tests** covering parse → validate → export end-to-end.

---

## Module overview

| Module | Responsibility |
|--------|---------------|
| `scd_validator.py` | CLI entry point; argument parsing; orchestration |
| `scd_parser.py` | XML parsing; produces `ParseOutput` dataclass |
| `scd_validations.py` | 26 validation checks; loads thresholds from `validation_config.json` |
| `scd_export.py` | Writes CSV output files |
| `scd_utils.py` | IP address, MAC address, and APPID helpers |

---

## Example: CI/CD step

```yaml
- name: Validate SCD file
  run: |
    python3 scd_validator.py --input substation.scd --out-dir ./reports
  # exits with code 1 if errors found, failing the pipeline
```
