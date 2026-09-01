# SCD Visualizer V2

**Live app:** https://gridtech-is.github.io/scd-visualizer/

A local-first web application for parsing, validating, and visualizing IEC 61850 SCL/SCD configuration files. All processing happens in the browser — no server required. Works offline and can be installed as a desktop app (PWA).

Also includes a standalone **Python CLI** for validation and CSV/Excel export.

---

## Features

| Mode | Description |
|------|-------------|
| **Dashboard** | Health gauge, bandwidth donut chart, top IED traffic bars, revision timeline |
| **Network Graph** | Publisher → subscriber graph for GOOSE, SV, and Report signals |
| **Addresses** | IP addresses, GOOSE, Sampled Values, and Report control block tables |
| **Issues** | 30-check validation matrix (LNET_001–019 + IEC_001–015) + schema validation |
| **Statistics** | IED traffic charts, dataset histogram, revision history |
| **IED Explorer** | Two-pane IED tree: LDevice → LN0 → DataSets / GOOSE / SV / Reports |
| **Single Line Diagram** | IEC 60617 substation diagram with pan/zoom and IED chips per equipment |
| **Version** | SCL header info and full revision history |
| **Compare** | Load two SCD files (A/B), see added/modified/removed changes with graph decorations |

**Export options:** Excel workbook (IP, GOOSE, SV, Report sheets), CSV matrix, Landsnet compliance JSON, validation report.

---

## Requirements

### Web app
- [Node.js](https://nodejs.org/) 18 or later
- npm (comes with Node.js)

### Python CLI (optional)
- Python 3.9 or later

---

## Quick start — Web app

```bash
# 1. Install dependencies
npm install

# 2. Start the development server
npm run dev
```

Open the URL shown by Vite (e.g. `http://localhost:5173`) in your browser.

Use **Load File** or drag-and-drop a `.scd`, `.cid`, `.icd`, `.iid`, or `.ssd` file onto the window.

### Build for production

```bash
npm run build
```

Output goes to `dist/`. Serve with any static file server.

### Run tests

```bash
npm run test          # run all tests once
npm run test:watch    # watch mode
```

---

## Python CLI

The Python CLI parses SCD files, runs all 26 validation checks, and exports CSV reports — no browser needed.

### Install dependencies

```bash
pip install -r requirements-dev.txt
```

### Run the validator

```bash
# Explicit input and output directory (recommended)
python3 scd_validator.py --input path/to/file.scd --out-dir ./out

# Auto-detect: uses the single .scd/.xml/.cid/.icd file in the current directory
python3 scd_validator.py
```

**Exit codes:** `0` = OK, `1` = validation errors found, `2` = parse/IO error.

**Output files written to `--out-dir`:**
- `validation_results.csv` — all issues with code, severity, path, message
- `out_MMS.csv`, `out_goose.csv`, `out_sv.csv` — signal matrices
- Dataset and template exports

### Run Python tests

```bash
python3 -m pytest tests/ -v
```

---

## Validation checks

| Prefix | Range | Scope |
|--------|-------|-------|
| `SCL_XSD_001` | — | XML schema validity (IEC 61850-6 XSD, Ed2/Ed2.1 auto-detected) |
| `LNET_` | 001–019 | Landsnet site-specific rules (VLAN, APPID, timing, naming, …) |
| `IEC_` | 001–015 | General IEC 61850 structural checks |

Issues include severity (`error` / `warn`), affected IED/path, and an actionable fix hint.

---

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` / `Ctrl+K` | Command palette — jump to any IED, LN, DataSet, or control block |
| Double-click canvas (SLD) | Fit diagram to screen |

---

## Project structure

```
src/
  components/     React UI components
  model/          TypeScript domain types (SclModel, …)
  parser/         SCD XML → SclModel
  sld/            Single Line Diagram parser + layout + symbols
  state/          React context stores (UI, validation, file loading)
  validation/     30-check validation pipeline + schema validator
  diff/           Compare/diff engine for two SCD files
  utils/          CSV, Excel, and JSON export helpers
  workers/        Web Worker for off-thread parsing

scd_parser.py       Python SCD parser
scd_validations.py  Python validation checks
scd_validator.py    Python CLI entry point
scd_export.py       Python CSV export
validation_config.json  GOOSE/SV VLAN and timing thresholds
tests/              Python integration tests
```

---

## Browser compatibility

Tested on Chrome and Firefox (latest). Requires a browser with WebAssembly support (for XSD schema validation).

No backend, no tracking, no data leaves your machine.
