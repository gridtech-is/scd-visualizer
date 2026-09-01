# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend (TypeScript/React)
```bash
npm install          # install dependencies
npm run dev          # start Vite dev server
npm run build        # tsc -b && vite build (type-check + bundle)
npm run test         # run all Vitest tests once
npm run test:watch   # run Vitest in watch mode
npm run report:pdf   # generate PDF report via scripts/generate-scd-report.mjs
```

Run a single test file:
```bash
npx vitest run src/validation/runValidation.test.ts
```

### Python CLI
```bash
python3 scd_validator.py --input path/to/file.scd --out-dir ./out
python3 -m pytest tests/ -v
python3 -m pytest tests/test_integration.py::test_iec001 -v
```

## Architecture

This is a dual-stack project: a **React/TypeScript browser app** and a **Python CLI** that share the same IEC 61850 SCD/SCL parsing and validation domain.

### TypeScript frontend

**Data flow:** `File → parseSclDocument() → SclModel → UI state → rendered panels`

- `src/parser/sclParser.ts` — parses SCD XML into `SclModel` (ieds, subNetworks, gseControls, svControls, edges, substations, dataTypeTemplates, sld, header); calls `parseSld()` wrapped in try/catch
- `src/model/types.ts` — all TypeScript domain types; `SclModel` is the central data structure. Also defines `SclHeaderModel`, `HitemModel`, `DataTypeTemplatesModel` (includes `enumTypes` Map and `duplicateTypeIds[]`). `SclModel` includes `sld?: SldModel`.
- `src/state/uiStore.tsx` — React context: selection/focus/filter state
- `src/state/validationStore.tsx` — React context: validation issues + sub-view state (`'matrix' | 'list'`, default `'matrix'`)
- `src/state/useModelValidation.ts` — triggers `runValidation()` + `runLandsnetValidation()` + `runSchemaValidation()` when model changes
- `src/state/useSclFiles.ts` — file loading state: `model`, `baselineModel`, `newModel`, `fileName`, `baselineName`, `newName`
- `src/state/useCompareState.ts` — diff computation: `computeDiff(baselineModel, newModel)` → `DiffResult`

**Validation pipeline:**
- `src/validation/validators.ts` — orchestrates structural rule runners
- `src/validation/rules/` — generic rules: `identityRules`, `communicationRules`, `gooseRules`, `controlBlockRules`
- `src/validation/schemaValidator.ts` — xmllint-wasm XSD validation; auto-detects SCL edition (2007B vs 2007B4); WASM loaded with 128MB initial memory
- `src/validation/checkDescriptions.ts` — English summaries/details/examples for all 32 checks; used by ValidationMatrix popup
- `src/validation/landsnet/checks.ts` — **32 checks**: LNET_001–020 + IEC_001–016
- `src/validation/landsnet/runLandsnetValidation.ts` — entry point; returns `LandsnetValidationReport`
- `src/validation/landsnet/buildDictionaries.ts` — builds MMS/GOOSE/SV dictionaries from model

**App modes** (`appMode` state in App.tsx, exported as `AppMode` type):

| Mode | Icon | Component | Notes |
|------|------|-----------|-------|
| `dashboard` | ◈ | DashboardWorkspace | **Default after file load**; animated stat cards, health gauge, bandwidth donut, top-5 IED bars, revision timeline |
| `visualizer` | ⬡ | GraphCanvas + SubscriptionMatrix | `graphSubView` sub-state: `'visualizer' \| 'subscriptions'` |
| `issues` | ✓ | ValidationMatrix / IssuesWorkspace | sub-view via `validationStore`: `'matrix' \| 'list'` |
| `network` | ⋯ | NetworkVisualizerPanel | full-width; traffic heat map toggle; node/edge coloring by estimated Mbps |
| `statistics` | ≡ | StatisticsWorkspace | full-width; IED traffic bars, histogram, revision timeline |
| `addresses` | ⊞ | AddressesTable | 4 sub-views: IP Addresses, GOOSE, Sampled Values, Reports |
| `ied` | ◈ | IedExplorer | two-pane: IED list + expandable tree |
| `version` | ◑ | VersionPanel | Header info card + full History table, lock badge |
| `sld` | ⏚ | SubstationDiagram | Single Line Diagram; pan/zoom SVG canvas; IEC 60617 symbols; IED chips per equipment; voltage filter pills; auto-fit on load; double-click canvas to fit |

**Startup screen** (`src/components/StartupScreen.tsx`):
- Shown when `!model && !error`; two main cards (Open / Compare) + optional "Continue last session" card
- Animated SVG background: 10 hex nodes + thin connector lines + 6 traveling pulse circles (3 GOOSE, 2 SV, 1 MMS) using CSS `offset-path` animation
- Drag-and-drop: `onDragOver/onDrop` extracts `e.dataTransfer.files[0]` → `onDropFile(file)`; `startup-drag-active` class applied while dragging
- Last session: read from `localStorage('vm-last-session')` on mount; shown if < 30 days old; saved in App.tsx 800ms after parse via `pendingLastSession` + `latestIssuesCountRef`

**Compare mode** is separate from `appMode`. Entered via TopBar "Compare" or startup screen:
- `compareVariant: 'single' | 'compare'` — drives `useCompareState`
- `compareViewFile: 'A' | 'B' | null` — overrides `activeModel`; shows "← Back to diff" banner
- `CompareAssignDialog` — modal asking if loaded file is A (old) or B (new)
- `pendingCompareSlot: 'A' | 'B' | null` — tracks which slot awaits second file

**Waived checks:**
- `waivedChecks: Set<string>` in App.tsx, persisted to `localStorage('vm-waived-checks')`
- Base code extraction from issue code: `parts[0]_parts[1]` via `issue.code.split('_')`
- `filteredIssues` feeds TopBar count, IssuesWorkspace, SubstationTree, and ValidationMatrix

**Lock detection:**
- `model.header.helinksLocked` — `true` if SCL root has `xmlns:hlx="http://www.helinks.com/SCL/Private"` (detected via `root.lookupNamespaceURI('hlx')` in parser)
- `locked` in App.tsx = `activeModel?.header?.helinksLocked ?? false` — passed to TopBar as read-only badge (🔒/🔓)

**File type badge:**
- Derived in App.tsx from file extension: `.scd`→`SCD`, `.cid`→`CID`, `.icd`→`ICD`, `.iid`→`IID`, `.ssd`→`SSD`, `.xml`→`XML`

**UI layout (dark-pro three-pane):**
- `src/App.tsx` — startup screen (no file) or `ThreePaneLayout`
- `src/components/TopBar.tsx` — logo, file badge + file type chip + lock badge, issue count, Load File, Compare, Export, Search
- `src/components/SubstationTree.tsx` — left pane; Substation→VoltageLevel→Bay→IED hierarchy with inline ✓/✗ badges
- `src/components/ValidationMatrix.tsx` — 32-check × IED grid; `CheckInfoPopup` on title click
- `src/components/DashboardWorkspace.tsx` — animated dashboard; uses `useCountUp()` hook for stat cards, SVG arc gauge, donut chart, stacked IED bars, revision timeline
- `src/components/IedExplorer.tsx` — IED list + tree: IED → LDevice → LN0 (DataSets, GOOSE, SV, Reports) + other LNs
- `src/components/AddressesTable.tsx` — 4 sub-view tabs
- `src/components/SubscriptionMatrix.tsx` — publisher×subscriber matrix with 3 protocol tabs: GOOSE, SV, Reports
- `src/components/GraphCanvas.tsx` — ReactFlow graph
- `src/components/InspectorPanel.tsx` — right pane: Summary/Dataset/Diff/XML tabs
- `src/components/NetworkVisualizerPanel.tsx` — ReactFlow network topology; `showHeat` toggle colors nodes (`net-node-cold/warm/hot/fire`) and edges by estimated Mbps; traffic legend overlay
- `src/components/VersionPanel.tsx` — Header info card + full History table; lock badge
- `src/components/SubstationDiagram.tsx` — SLD canvas: pan (drag), zoom (wheel, non-passive native listener), auto-fit on load, double-click to fit, pan bounds via `clampT()` (200px margin)
- `src/components/ThreePaneLayout.tsx` — drag-resizable, widths in localStorage

**Statistics:**
- `src/utils/scdStatistics.ts` — `computeScdStatistics(model)` → `ScdStatistics`; includes `iedTraffic: IedTrafficRow[]` (sorted by `estMbps`) and `revisionHistory: HitemModel[]`
- `src/components/StatisticsWorkspace.tsx` — collapsible sections; `HorizontalBarChart` (SVG), `DatasetSizeHistogram` (SVG column chart), `DictTable`, revision timeline with "Show all N revisions" toggle

**SLD (Single Line Diagram):**
- `src/sld/types.ts` — `SldModel`, `SldVoltageLevel`, `SldBay`, `SldEquipment`, `EquipmentKind`
- `src/sld/parseSld.ts` — parses `<Substation>` XML; uses `<ConductingEquipment type="CBR|DIS|GG|CTR|VTR|IFL|GV">`; `<Voltage multiplier="k">` means value is already in kV
- `src/sld/layout.ts` — `computeLayout()` → double-busbar pixel layout; constants: `BAY_WIDTH=120`, `BUS_Y_TOP=60`, `BUS_Y_BOT=180`, `LEFT_MARGIN=80`
- `src/sld/symbols.tsx` — IEC 60617 SVG symbols in 60×100 viewBox: `CbrSymbol` (blade+star), `DisSymbol` (blade only), `GgSymbol` (blade+earth), `CtrSymbol` (circle+marks), `VtrSymbol` (two circles), `IflSymbol` (diagonal), `GvSymbol` (box)

**Design system:**
- `src/design-tokens.css` — all CSS variables (bg `#0f172a`, surface `#1e293b`, accent `#38bdf8`, `--goose #a78bfa`, `--sv #fb923c`, `--mms #38bdf8`)
- `src/styles.css` — all component styles (no CSS modules)

### Python CLI

- `scd_parser.py` — parses SCD XML into `ParseOutput` using `xml.etree.ElementTree`
- `scd_validations.py` — **26 checks**: LNET_001–018 + IEC_001–008; loads thresholds from `validation_config.json`
- `scd_validator.py` — CLI entry; exit codes: 0=OK, 1=validation errors, 2=parse/IO error
- `scd_export.py` — writes CSV outputs
- `validation_config.json` — GOOSE/SV VLAN/timing thresholds
- `scd_utils.py` — IP/MAC/APPID helpers

**Python tests:** `tests/test_integration.py` (38 tests) covers parse→validate→export end-to-end.

**Worker serialization:**
- `src/workers/parseWorker.ts` — `SerializedSclModel` converts Maps to `Array<[k,v]>` for structured clone; `sld` passes through as plain object (no conversion needed); `dataTypeTemplates` includes `enumTypes` and `duplicateTypeIds`; when adding new Map fields update `SerializedSclModel`, `serializeModel()`, and `deserializeModel()`

### Validation rule codes

All issues use `LNET_XXX` or `IEC_XXX` codes. Schema issues use `SCL_XSD_001_*`.
Each issue has `severity: 'error' | 'warn'` and `fixHint: string` (actionable instruction, not "check rule X").

| Prefix | Range | Scope |
|--------|-------|-------|
| `SCL_XSD` | 001 | XML schema validity (xmllint-wasm) |
| `LNET_` | 001–020 | Landsnet site-specific rules |
| `IEC_`  | 001–016 | General IEC 61850 structural checks |

`IEC_003` routes by `serviceType`: `"GOOSE"` → GSEControl, `"SMV"` → SampledValueControl, `"Report"` → ReportControl.

### Compare / Diff

- `src/diff/buildIndex.ts` — `buildEntityIndex(model)` indexes IEDs, datasets, control blocks, communication, flows
- `src/diff/computeDiff.ts` — `computeDiff(a, b)` → `DiffResult` with added/modified/removed changes
- `src/diff/report.ts` — `buildDiffReport(diff)` for JSON export
- `src/diff/applyDiffDecorations.ts` — annotates graph nodes with change status

### Export

- `src/utils/exportCsv.ts` — GOOSE matrix, detailed flows, protocol summary, changes, validation CSV
- `src/utils/exportExcel.ts` — Excel workbook; honours `ExportSheetsOption` (`all | ip_only | signals_only`)
- `src/utils/exportLandsnetJson.ts` — Landsnet compliance JSON
