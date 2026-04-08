# Getting Started

## Browser application

### Requirements

- Node.js 18+
- npm 9+

### Install and run

```bash
git clone https://github.com/gridtech-is/scd-visualizer.git
cd scd-visualizer
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### Build for production

```bash
npm run build
```

Output is placed in `dist/`.

---

## Python CLI

### Requirements

- Python 3.10+
- No external pip packages required (standard library only)

### Run validation

```bash
python3 scd_validator.py --input path/to/file.scd --out-dir ./out
```

#### Exit codes

| Code | Meaning |
|------|---------|
| `0` | No validation errors |
| `1` | One or more validation errors found |
| `2` | Parse or I/O error |

#### Output files (written to `--out-dir`)

| File | Contents |
|------|----------|
| `goose_matrix.csv` | GOOSE publisher/subscriber matrix |
| `sv_matrix.csv` | Sampled Values matrix |
| `flows_detail.csv` | Detailed flow list |
| `validation_report.csv` | All validation issues |

---

## Loading a file in the browser

1. Launch the app (`npm run dev`)
2. Drag and drop an SCD/SCL file onto the startup screen, **or** click **Open** and select a file
3. The app parses the file in a background worker and opens the Dashboard view

### Compare mode

To compare two versions of a file:
1. Click **Compare** on the startup screen or the top bar
2. Load the old file (slot A) and the new file (slot B)
3. The diff panel highlights added, modified, and removed elements

---

## Configuring validation thresholds

Edit `validation_config.json` to adjust GOOSE/SV VLAN and timing thresholds:

```json
{
  "goose": {
    "vlan_priority_min": 4,
    "min_time_ms": 2,
    "max_time_ms": 1000
  },
  "sv": {
    "vlan_priority_min": 4
  }
}
```

This file is used by both the Python CLI and the TypeScript frontend validation pipeline.
