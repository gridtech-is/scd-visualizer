# App Features

The browser app has nine view modes, accessible from the left icon bar after loading a file.

---

## Dashboard

The default view after loading a file. Displays:
- Animated stat cards (IED count, dataset count, GOOSE/SV/Report counts)
- Health gauge (percentage of checks passing)
- Bandwidth donut chart by protocol
- Top-5 IEDs by estimated Mbps
- Revision timeline from the SCL `<History>` section

---

## Visualizer (Graph)

An interactive ReactFlow graph showing IED-to-IED communication flows.

- **Nodes** represent IEDs
- **Edges** represent GOOSE, SV, or Report subscriptions, colour-coded:
  - Purple — GOOSE
  - Orange — Sampled Values
  - Cyan — MMS/Reports
- Click a node or edge to open the **Inspector Panel** (right pane) with Summary, Dataset, Diff, and XML tabs

### Subscription Matrix

A sub-view of the Visualizer showing a publisher × subscriber matrix with three protocol tabs: GOOSE, SV, and Reports.

---

## Issues (Validation)

Shows the results of all validation checks. Two sub-views:

### Validation Matrix
A grid of 26 checks (rows) × IEDs (columns). Each cell shows PASS, FAIL, or N/A.
Click a check name to open a popup with a full description, examples, and fix hint.

### Issues List
A flat list of all issues, filterable by severity (error / warning) and sortable by IED.

Issues can be **waived** per check code. Waived checks are persisted in `localStorage`.

---

## Network

A ReactFlow topology view focused on network infrastructure.

- Nodes represent IEDs and network switches
- Edge thickness and colour indicate estimated traffic load
- Toggle **traffic heat map** to colour nodes from cold (low load) to fire (high load)
- Traffic legend overlay shows the Mbps scale

---

## Statistics

Detailed traffic and configuration statistics:
- IED traffic bar chart (estimated Mbps per IED)
- Dataset size histogram
- Protocol summary table
- Full revision history with "Show all N revisions" toggle

---

## Addresses

Four tabbed sub-views:
1. **IP Addresses** — ConnectedAP IP and subnet per IED
2. **GOOSE** — GSEControl addresses (VLAN, APPID, MAC)
3. **Sampled Values** — SampledValueControl addresses
4. **Reports** — ReportControl list

---

## IED Explorer

A two-pane explorer:
- Left: IED list with search filter
- Right: Expandable tree — IED → LogicalDevice → LN0 (DataSets, GOOSE controls, SV controls, Reports) → other Logical Nodes with DO/DA from DataTypeTemplates

---

## Version / History

- SCL `<Header>` information card (version, revision, tool, company)
- Full `<History>` table of all `<Hitem>` entries
- Lock badge if the file contains a Helinks private namespace (`hlx`)

---

## Single Line Diagram (SLD)

An IEC 60617 single line diagram rendered from the `<Substation>` section.

- **Pan**: drag the canvas
- **Zoom**: scroll wheel
- **Fit**: double-click canvas or use the fit button
- **Voltage filter pills**: show/hide voltage levels
- **IED chips**: each equipment bay shows associated IED names

### Supported equipment symbols

| Type code | Symbol | Equipment |
|-----------|--------|-----------|
| `CBR` | Blade + arc | Circuit breaker |
| `DIS` | Blade only | Disconnector |
| `GG` | Blade + earth | Earth switch |
| `CTR` | Circle + marks | Current transformer |
| `VTR` | Two circles | Voltage transformer |
| `IFL` | Diagonal | Infeeder / line |
| `GV` | Box | Generic valve |

---

## Export

Click **Export** in the top bar to download:
- **Excel workbook** — IP addresses, GOOSE signals, SV signals, Report signals, validation issues
- **CSV** — GOOSE matrix, SV matrix, detailed flows, protocol summary, validation issues, diff changes
- **Landsnet JSON** — compliance report in Landsnet format
- **PDF report** — generated via `npm run report:pdf`
