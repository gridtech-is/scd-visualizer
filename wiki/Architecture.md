# Architecture

SCD Visualizer is a dual-stack project: a React/TypeScript browser application and a Python CLI. Both share the same IEC 61850 domain concepts but are implemented independently.

---

## TypeScript frontend

### Data flow

```
File → parseWorker (Web Worker)
     → parseSclDocument()
     → SclModel
     → React state (uiStore, validationStore)
     → Rendered panels
```

Parsing runs in a background Web Worker (`src/workers/parseWorker.ts`) so the UI remains responsive for large files. The worker serialises Maps to arrays for structured-clone transfer.

### Key modules

| Path | Responsibility |
|------|---------------|
| `src/parser/sclParser.ts` | Parses SCD XML into `SclModel` |
| `src/model/types.ts` | All TypeScript domain types |
| `src/state/uiStore.tsx` | Selection, focus, and filter state (React context) |
| `src/state/validationStore.tsx` | Validation issues and sub-view state |
| `src/state/useModelValidation.ts` | Triggers validation pipeline on model change |
| `src/state/useSclFiles.ts` | File loading state (single / compare) |
| `src/state/useCompareState.ts` | Diff computation |

### Validation pipeline

```
model change
  → runValidation()          (structural rules)
  → runLandsnetValidation()  (LNET + IEC checks)
  → runSchemaValidation()    (XSD via xmllint-wasm)
  → issues stored in validationStore
```

Rule files live under `src/validation/`:

| File | Contents |
|------|----------|
| `validators.ts` | Orchestrates rule runners |
| `rules/identityRules.ts` | IED identity checks |
| `rules/communicationRules.ts` | Communication section checks |
| `rules/gooseRules.ts` | GOOSE-specific checks |
| `rules/controlBlockRules.ts` | Control block checks |
| `schemaValidator.ts` | xmllint-wasm XSD validation |
| `landsnet/checks.ts` | All 26 LNET/IEC checks |
| `landsnet/runLandsnetValidation.ts` | Entry point → `LandsnetValidationReport` |
| `landsnet/buildDictionaries.ts` | MMS/GOOSE/SV dictionaries from model |
| `checkDescriptions.ts` | Human-readable summaries for all 26 checks |

### SLD (Single Line Diagram)

| Path | Responsibility |
|------|---------------|
| `src/sld/types.ts` | `SldModel`, `SldVoltageLevel`, `SldBay`, `SldEquipment` |
| `src/sld/parseSld.ts` | Parses `<Substation>` XML into `SldModel` |
| `src/sld/layout.ts` | Double-busbar pixel layout computation |
| `src/sld/symbols.tsx` | IEC 60617 SVG symbols |

### Diff / Compare

| Path | Responsibility |
|------|---------------|
| `src/diff/buildIndex.ts` | Indexes IEDs, datasets, control blocks, flows |
| `src/diff/computeDiff.ts` | Produces `DiffResult` (added/modified/removed) |
| `src/diff/report.ts` | Builds diff JSON for export |
| `src/diff/applyDiffDecorations.ts` | Annotates graph nodes with change status |

### Design system

- `src/design-tokens.css` — all CSS custom properties (dark-pro palette)
- `src/styles.css` — all component styles (no CSS modules)
- Accent colours: GOOSE `#a78bfa` (purple), SV `#fb923c` (orange), MMS `#38bdf8` (cyan)

---

## Python CLI

| Module | Responsibility |
|--------|---------------|
| `scd_validator.py` | CLI entry point |
| `scd_parser.py` | XML parsing → `ParseOutput` dataclass |
| `scd_validations.py` | 26 validation checks |
| `scd_export.py` | CSV export |
| `scd_utils.py` | IP/MAC/APPID helpers |
| `validation_config.json` | Configurable thresholds |

---

## Validation rule codes

| Prefix | Range | Scope |
|--------|-------|-------|
| `SCL_XSD_001` | — | XML schema validity |
| `LNET_` | 001–018 | Landsnet site-specific rules |
| `IEC_` | 001–008 | General IEC 61850 structural checks |

---

## Test suite

| Stack | Count | Command |
|-------|-------|---------|
| TypeScript (Vitest) | 37 | `npm run test` |
| Python (pytest) | 38 | `python3 -m pytest tests/ -v` |
