# SLD (Single Line Diagram) — Full Implementation Prompt for Claude Code

> Copy everything below this line into a Claude Code session in the SCD Visualizer project root.

---

## Task

Add a **Single Line Diagram (SLD / Einlínurit)** view to the existing SCD Visualizer React/TypeScript app.
The diagram must parse the `<Substation>` section of IEC 61850 SCD/SCL files and render a correct,
scrollable SVG single-line diagram using IEC 60617 graphical symbols, with IEDs shown per bay.

---

## Step 0 — Get OpenSCD SVG symbols

OpenSCD (https://github.com/openscd/open-scd) has a reference SVG symbol library for SLD.
Clone only the relevant folder:

```bash
npx degit openscd/open-scd/src/editors/singlelinediagram /tmp/openscd-sld
```

Then look at the files in `/tmp/openscd-sld/` — specifically any `*symbol*`, `*Symbol*`, or `*.svg` files.
Understand how they define their symbols (web components, SVG `<symbol>` elements, or inline SVG paths).
Extract the SVG path/shape data for: **CBR, DIS, GG, CTR, VTR, IFL** and any bus/line symbols.

If `npx degit` fails, try:
```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/openscd/open-scd.git /tmp/openscd-repo
cd /tmp/openscd-repo
git sparse-checkout set src/editors/singlelinediagram
```

Study the extracted symbols before writing any code. The goal is to use OpenSCD's exact SVG geometry
so that symbols match the IEC 60617 standard as implemented by an established open-source tool.

---

## Symbol specification (fallback if OpenSCD symbols unavailable)

If OpenSCD's symbols cannot be extracted, implement the following SVG symbols in a 60×100 viewBox
(all strokes use `currentColor`, width 2, linecap `round`). Terminal points are at (30,0) top and (30,100) bottom.

### DIS — Disconnector (IEC 60617 ref 7-2-01)
- Vertical conductor top: line (30,0)→(30,35)
- Pivot dot: filled circle r=3 at (30,36)
- Blade: line from (30,36) rotated −30° around pivot, length 22px (open position)
- Vertical conductor bottom: line (30,65)→(30,100)
- **NO circle at the lower (fixed contact) end**

### CBR — Circuit Breaker (IEC 60617 ref 7-2-04)
- Identical to DIS above EXCEPT: add a 6-point star (✱) at the fixed contact end (lower end of blade travel)
- Star center: approximately (21, 68) — where the blade tip rests when open
- Star: 3 crossing lines of length 10px each through the center point, at 0°, 60°, 120°
- Stroke width 1.8 for star lines

### GG — Earthing Switch (IEC 60617 ref 7-2-03)
- Pivot dot: filled circle r=3 at (30,31)
- Blade: line from (30,31) rotated −45° around pivot, length ~22px
- Earth symbol centered at (30,65):
  - Wide bar: line (10,65)→(50,65), stroke-width 2.5
  - Middle bar: line (16,72)→(44,72), stroke-width 2
  - Narrow bar: line (22,79)→(38,79), stroke-width 1.5
- No bottom terminal; top terminal line (30,0)→(30,31)

### CTR — Current Transformer (IEC 60617 ref 7-5-01)
- Vertical conductor through center
- Circle r=10 centered at (30,50)
- Two small parallel lines crossing the conductor inside the circle (representing windings)

### VTR — Voltage Transformer (IEC 60617 ref 7-5-02)
- Vertical conductor
- Circle r=10 centered at (30,50)
- Two nested arcs inside the circle

### BUS — Busbar segment
- Thick horizontal line, stroke-width 4, full row width

### IFL — Line / Feeder termination
- Vertical conductor line (30,0)→(30,80)
- Diagonal line at bottom right: represents outgoing line

---

## Architecture

### New files to create

```
src/sld/
  types.ts           — SLD domain types
  parseSld.ts        — parse <Substation> XML into SldModel
  layout.ts          — compute x/y positions for double-busbar layout
  symbols.tsx        — React SVG symbol components
src/components/
  SubstationDiagram.tsx   — main SLD canvas component
  SldToolbar.tsx          — zoom, pan-reset, voltage filter controls
```

### Modify existing files

- `src/model/types.ts` — add `SldModel` export (or keep in `src/sld/types.ts`)
- `src/App.tsx` — add `'sld'` to the `AppMode` union type; add SLD tab to mode switcher
- `src/components/TopBar.tsx` — add SLD icon button (use `⏚` or grid icon)
- `src/parser/sclParser.ts` — call `parseSld()` and attach result to `SclModel` as `model.sld?: SldModel`

---

## src/sld/types.ts

```typescript
export type EquipmentKind =
  | 'CBR' | 'DIS' | 'GG' | 'CTR' | 'VTR' | 'IFL' | 'GV' | 'BAY' | 'BUS';

export interface SldEquipment {
  name: string;
  kind: EquipmentKind;
  desc?: string;
  /** IED names bound via <LNode> */
  ieds: string[];
}

export interface SldBay {
  name: string;
  desc?: string;
  voltageLevel: string;
  nominalVoltage: number;   // kV, parsed from <VoltageLevel volt="..."/>
  equipment: SldEquipment[];
  /** position assigned by layout algorithm */
  col: number;
}

export interface SldVoltageLevel {
  name: string;
  nominalVoltage: number;
  bays: SldBay[];
  /** color token for this voltage level */
  color: string;
}

export interface SldModel {
  substationName: string;
  voltageLevels: SldVoltageLevel[];
}
```

---

## src/sld/parseSld.ts

Parse the `<Substation>` element from the already-available `Document` (same DOM the main parser uses).
Use `document.getElementsByTagNameNS('*', 'Substation')` or the SCL namespace.

```typescript
import type { SldModel, SldVoltageLevel, SldBay, SldEquipment, EquipmentKind } from './types';

const SCL_NS = 'http://www.iec.ch/61850/2003/SCL';

const EQUIPMENT_TAGS: Record<string, EquipmentKind> = {
  Breaker: 'CBR',
  Disconnector: 'DIS',
  GroundDisconnector: 'GG',
  CurrentTransformer: 'CTR',
  VoltageTransformer: 'VTR',
  PowerTransformer: 'VTR',
  Line: 'IFL',
  SeriesCapacitor: 'GV',
};

const VOLTAGE_COLORS: Array<[number, string]> = [
  [200, '#4ade80'],  // 220kV → green
  [100, '#f87171'],  // 132kV → red
  [10,  '#fbbf24'],  // 11kV  → yellow
  [0,   '#94a3b8'],  // fallback → slate
];

function voltageColor(kv: number): string {
  for (const [threshold, color] of VOLTAGE_COLORS) {
    if (kv >= threshold) return color;
  }
  return '#94a3b8';
}

export function parseSld(doc: Document): SldModel | null {
  const substationEl = doc.getElementsByTagNameNS(SCL_NS, 'Substation')[0]
    ?? doc.getElementsByTagName('Substation')[0];
  if (!substationEl) return null;

  const substationName = substationEl.getAttribute('name') ?? 'Substation';
  const voltageLevels: SldVoltageLevel[] = [];

  const vlEls = substationEl.getElementsByTagNameNS(SCL_NS, 'VoltageLevel').length > 0
    ? substationEl.getElementsByTagNameNS(SCL_NS, 'VoltageLevel')
    : substationEl.getElementsByTagName('VoltageLevel');

  for (const vlEl of Array.from(vlEls)) {
    const vlName = vlEl.getAttribute('name') ?? '';
    // Voltage in V under <Voltage> child or volt attribute
    let nominalVoltage = 0;
    const voltEl = vlEl.getElementsByTagName('Voltage')[0];
    if (voltEl?.textContent) {
      nominalVoltage = parseFloat(voltEl.textContent) / 1000; // V→kV
    }
    const voltAttr = vlEl.getAttribute('volt');
    if (voltAttr) nominalVoltage = parseFloat(voltAttr) / 1000;

    const color = voltageColor(nominalVoltage);
    const bays: SldBay[] = [];

    const bayEls = vlEl.getElementsByTagNameNS(SCL_NS, 'Bay').length > 0
      ? vlEl.getElementsByTagNameNS(SCL_NS, 'Bay')
      : vlEl.getElementsByTagName('Bay');

    let col = 0;
    for (const bayEl of Array.from(bayEls)) {
      const bayName = bayEl.getAttribute('name') ?? '';
      const bayDesc = bayEl.getAttribute('desc') ?? undefined;
      const equipment: SldEquipment[] = [];

      for (const [tag, kind] of Object.entries(EQUIPMENT_TAGS)) {
        const eqEls = bayEl.getElementsByTagNameNS(SCL_NS, tag).length > 0
          ? bayEl.getElementsByTagNameNS(SCL_NS, tag)
          : bayEl.getElementsByTagName(tag);

        for (const eqEl of Array.from(eqEls)) {
          const eqName = eqEl.getAttribute('name') ?? '';
          const eqDesc = eqEl.getAttribute('desc') ?? undefined;

          // Collect IED names from <LNode iedName="..."> children
          const ieds: string[] = [];
          const lnodes = eqEl.getElementsByTagNameNS(SCL_NS, 'LNode').length > 0
            ? eqEl.getElementsByTagNameNS(SCL_NS, 'LNode')
            : eqEl.getElementsByTagName('LNode');
          for (const ln of Array.from(lnodes)) {
            const ied = ln.getAttribute('iedName');
            if (ied && ied !== 'None' && !ieds.includes(ied)) ieds.push(ied);
          }

          equipment.push({ name: eqName, kind, desc: eqDesc, ieds });
        }
      }

      bays.push({
        name: bayName,
        desc: bayDesc,
        voltageLevel: vlName,
        nominalVoltage,
        equipment,
        col: col++,
      });
    }

    voltageLevels.push({ name: vlName, nominalVoltage, bays, color });
  }

  return { substationName, voltageLevels };
}
```

---

## src/sld/symbols.tsx

Each symbol is a React component accepting `{ color: string; size?: number }`.
All symbols render in a normalized 60×100 coordinate space;
the parent scales via a wrapping `<g transform="scale(...)">`.

Implement these components (using SVG geometry from OpenSCD if available, otherwise use the
fallback geometry specified above):

- `<CbrSymbol color size />`
- `<DisSymbol color size />`
- `<GgSymbol color size />`
- `<CtrSymbol color size />`
- `<VtrSymbol color size />`
- `<IflSymbol color size />`

Also export:
```typescript
export function getSymbol(kind: EquipmentKind): React.FC<SymbolProps> { ... }
```

---

## src/components/SubstationDiagram.tsx

Full SVG canvas with pan+zoom.

### Layout constants
```typescript
const BAY_WIDTH = 120;       // px per bay column
const ROW_HEIGHT = 110;      // px per equipment row
const BUS_Y_TOP = 60;        // top busbar Y (bus A)
const BUS_Y_BOT = 180;       // bottom busbar Y (bus B)
const SYMBOL_HEIGHT = 80;    // px
const VL_HEADER_HEIGHT = 40; // px for voltage level label
const IED_CHIP_HEIGHT = 22;  // px per IED chip below equipment
```

### Layout algorithm (double busbar, vertical bays)
Each voltage level renders as a horizontal section:
1. Draw two horizontal busbars (A and B) spanning all bay columns
2. For each bay, draw a vertical feeder column:
   - Vertical bus coupler line from BUS_A down through equipment to BUS_B
   - Each `SldEquipment` item stacked vertically, symbol centered in the column
   - IED chip(s) shown below the equipment symbol as small rounded-rect labels
3. Stack voltage levels vertically with `VL_HEADER_HEIGHT` gap between them

### Equipment rendering order within a bay column
Sort equipment so CBR and DIS appear between the busbars; CTR and VTR appear on the feeder side;
GG appears branching to the side or below busbars.

### IED chips
For each equipment item with `ieds.length > 0`, render small chips:
```svg
<rect rx="3" fill="#1e293b" stroke={voltageColor} stroke-width="1" width="80" height="18"/>
<text fill={voltageColor} font-size="9" font-family="monospace">{iedName}</text>
```

### Pan & zoom
Use `useState` for `{ x, y, scale }` transform.
Apply via `<g transform={`translate(${x},${y}) scale(${scale})`}>`.
Handle `onWheel` → zoom centered on cursor.
Handle `onMouseDown/Move/Up` → pan.
Add toolbar buttons: zoom in (+), zoom out (−), reset (⌂), fit-to-screen.

### Voltage level filter
Add a row of toggle buttons above the canvas, one per voltage level, colored with their voltage color.
Clicking hides/shows that voltage level's section.

### Component structure
```tsx
export default function SubstationDiagram({ model }: { model: SclModel }) {
  const sld = model.sld;
  if (!sld) return <EmptyState message="No <Substation> section found in this file." />;
  // ... render
}
```

---

## Integration into App.tsx

### 1. Add to AppMode union
```typescript
export type AppMode =
  | 'dashboard' | 'visualizer' | 'issues' | 'network'
  | 'statistics' | 'addresses' | 'ied' | 'version'
  | 'sld';   // ← add this
```

### 2. Add nav button in TopBar
After the existing mode buttons, add:
```tsx
<NavButton
  mode="sld"
  icon="⏚"
  label="Single Line"
  active={appMode === 'sld'}
  onClick={() => setAppMode('sld')}
/>
```
Use the earth/ground symbol `⏚` (U+23DA) or an inline SVG icon showing two horizontal bars.

### 3. Add panel render in ThreePaneLayout / App render
```tsx
{appMode === 'sld' && (
  <SubstationDiagram model={activeModel} />
)}
```
The SLD panel should be full-width (no left/right pane), similar to NetworkVisualizerPanel.

### 4. Wire parseSld into sclParser.ts
In `src/parser/sclParser.ts`, import `parseSld` and add to the returned model:
```typescript
import { parseSld } from '../sld/parseSld';
// inside parseSclDocument():
const sld = parseSld(doc);
return { ..., sld };
```
Add `sld?: SldModel` to the `SclModel` interface in `src/model/types.ts`.

---

## Styling

Add to `src/styles.css`:

```css
/* ── SLD Canvas ─────────────────────────────── */
.sld-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0f172a;
  overflow: hidden;
}

.sld-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #1e293b;
  border-bottom: 1px solid #334155;
  flex-shrink: 0;
}

.sld-vl-filter {
  display: flex;
  gap: 6px;
  margin-left: auto;
}

.sld-vl-pill {
  padding: 2px 10px;
  border-radius: 999px;
  border: 1.5px solid currentColor;
  background: transparent;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  opacity: 0.5;
  transition: opacity 0.15s;
}
.sld-vl-pill.active { opacity: 1; background: color-mix(in srgb, currentColor 15%, transparent); }

.sld-canvas-wrap {
  flex: 1;
  overflow: hidden;
  position: relative;
  cursor: grab;
}
.sld-canvas-wrap.panning { cursor: grabbing; }

.sld-canvas-wrap svg {
  display: block;
  width: 100%;
  height: 100%;
}

.sld-vl-label {
  font-size: 13px;
  font-weight: 700;
  font-family: monospace;
  letter-spacing: 0.05em;
}

.sld-bay-label {
  font-size: 10px;
  fill: #94a3b8;
  font-family: monospace;
}

.sld-ied-chip text {
  dominant-baseline: middle;
  text-anchor: middle;
}
```

---

## Test case — NJA substation

After implementation, load `2026-01-22-NJA-2007B-V5-R000.scd`.
The SLD tab should show:

| Voltage level | Color  | Bays expected                                    |
|---------------|--------|--------------------------------------------------|
| D_ (220 kV)   | Green  | 0ADA10, 0ADB10, SP1_, SN2_, NJA_                |
| E_ (132 kV)   | Red    | 0AEA10, 0AEB10, SP1_, FI1_, TT2_, NJ2_, RN1_, NJ3_, NJA_ |
| K_ (11 kV)    | Yellow | SP1_, 0BBA10                                    |

Bay SP1_ (220kV) must show: GS100 (CBR), GS210/220/270/310/320/330 (DIS), CE900_CT (CTR), CE900_VT (VTR).
IED chips on those equipment items: EW011, EW811, EW812, EW821, EW822 (whichever are linked via LNode).

---

## Quality requirements

1. **TypeScript strict** — no `any`, all types explicit
2. **No new npm dependencies** — pure React + SVG only (no D3, no Mermaid, no ReactFlow for SLD)
3. **Runs existing tests** — `npm run test` must still pass after changes
4. **Builds cleanly** — `npm run build` (tsc -b + vite) must succeed
5. **Symbols must match IEC 60617** — Use OpenSCD geometry if extractable; use the fallback spec above otherwise. The domain expert (20+ years IEC 61850) will review symbol correctness.
6. **Symbol correctness rules (non-negotiable)**:
   - CBR = same blade+pivot as DIS, plus a 6-point star (✱) at the fixed-contact end of the blade travel
   - DIS = blade + pivot dot; NO circle at the lower/fixed end
   - GG = blade + pivot dot; blade swings toward earth symbol (⏚), NOT away from it
7. **Performance** — diagram with 20+ bays must render smoothly; avoid re-computing layout on every render

---

## Deliverables checklist

- [ ] `/tmp/openscd-sld/` inspected; symbol geometry extracted or fallback used
- [ ] `src/sld/types.ts` created
- [ ] `src/sld/parseSld.ts` created and tested against NJA file
- [ ] `src/sld/symbols.tsx` created with correct IEC 60617 symbols
- [ ] `src/sld/layout.ts` created with double-busbar algorithm
- [ ] `src/components/SubstationDiagram.tsx` created with pan/zoom
- [ ] `src/components/SldToolbar.tsx` created
- [ ] `AppMode` union updated in `src/App.tsx`
- [ ] TopBar nav button added
- [ ] SLD panel wired into full-width render slot
- [ ] `parseSld` called in `sclParser.ts`, result attached to `SclModel`
- [ ] `SclModel` type extended with `sld?: SldModel`
- [ ] Styles added to `src/styles.css`
- [ ] `npm run test` passes
- [ ] `npm run build` passes
- [ ] NJA SCD file loads and shows correct 3-voltage-level diagram with IED chips
