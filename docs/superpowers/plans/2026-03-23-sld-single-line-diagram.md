# SLD (Single Line Diagram) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Single Line Diagram (SLD/Einlínurit) view that parses the `<Substation>` section of IEC 61850 SCD files and renders a scrollable SVG schematic with IEC 60617 symbols and IED chips per bay.

**Architecture:** Parse `<Substation>` XML into a typed `SldModel` in a new `src/sld/` module; compute double-busbar layout positions in `layout.ts`; render pure React+SVG in `SubstationDiagram.tsx` with pan/zoom. Wire into App.tsx as a full-width panel (same pattern as `NetworkVisualizerPanel`).

**Tech Stack:** React 18, TypeScript strict, pure SVG (no D3/ReactFlow/Mermaid), Vitest for tests.

**Symbol note:** OpenSCD's SLD icons (`icons.ts`) are 24×24 filled toolbar icons, not IEC 60617 schematic symbols. Use the fallback stroke-based spec (60×100 viewBox, currentColor strokes, blade+pivot geometry).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/sld/types.ts` | Create | Domain types: EquipmentKind, SldEquipment, SldBay, SldVoltageLevel, SldModel |
| `src/sld/parseSld.ts` | Create | Parse `<Substation>` XML → SldModel |
| `src/sld/layout.ts` | Create | Compute pixel x/y for double-busbar layout |
| `src/sld/symbols.tsx` | Create | IEC 60617 SVG symbol React components |
| `src/components/SubstationDiagram.tsx` | Create | Full SVG canvas with pan/zoom, voltage filter |
| `src/model/types.ts` | Modify | Add `sld?: SldModel` to `SclModel` |
| `src/parser/sclParser.ts` | Modify | Call `parseSld()` and attach to returned model |
| `src/App.tsx` | Modify | Add `'sld'` to AppMode, add to nav items, render panel, add to isReportTab |
| `src/styles.css` | Modify | Add `.sld-*` CSS classes |

---

## Task 1: Domain types

**Files:**
- Create: `src/sld/types.ts`

- [ ] Create `src/sld/types.ts` with exact content from spec:

```typescript
export type EquipmentKind =
  | 'CBR' | 'DIS' | 'GG' | 'CTR' | 'VTR' | 'IFL' | 'GV' | 'BAY' | 'BUS';

export interface SldEquipment {
  name: string;
  kind: EquipmentKind;
  desc?: string;
  ieds: string[];
}

export interface SldBay {
  name: string;
  desc?: string;
  voltageLevel: string;
  nominalVoltage: number;
  equipment: SldEquipment[];
  col: number;
}

export interface SldVoltageLevel {
  name: string;
  nominalVoltage: number;
  bays: SldBay[];
  color: string;
}

export interface SldModel {
  substationName: string;
  voltageLevels: SldVoltageLevel[];
}
```

- [ ] Run: `npx tsc --noEmit` — expect no errors

---

## Task 2: Parser

**Files:**
- Create: `src/sld/parseSld.ts`

- [ ] Create `src/sld/parseSld.ts`:

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
  [200, '#4ade80'],
  [100, '#f87171'],
  [10,  '#fbbf24'],
  [0,   '#94a3b8'],
];

function voltageColor(kv: number): string {
  for (const [threshold, color] of VOLTAGE_COLORS) {
    if (kv >= threshold) return color;
  }
  return '#94a3b8';
}

function getEls(parent: Element, ns: string, tag: string): Element[] {
  const nsEls = Array.from(parent.getElementsByTagNameNS(ns, tag));
  return nsEls.length > 0 ? nsEls : Array.from(parent.getElementsByTagName(tag));
}

export function parseSld(doc: Document): SldModel | null {
  const substationEl =
    doc.getElementsByTagNameNS(SCL_NS, 'Substation')[0] ??
    doc.getElementsByTagName('Substation')[0];
  if (!substationEl) return null;

  const substationName = substationEl.getAttribute('name') ?? 'Substation';
  const voltageLevels: SldVoltageLevel[] = [];

  for (const vlEl of getEls(substationEl, SCL_NS, 'VoltageLevel')) {
    const vlName = vlEl.getAttribute('name') ?? '';
    let nominalVoltage = 0;
    const voltEl = vlEl.getElementsByTagName('Voltage')[0];
    if (voltEl?.textContent) nominalVoltage = parseFloat(voltEl.textContent) / 1000;
    const voltAttr = vlEl.getAttribute('volt');
    if (voltAttr) nominalVoltage = parseFloat(voltAttr) / 1000;

    const color = voltageColor(nominalVoltage);
    const bays: SldBay[] = [];
    let col = 0;

    for (const bayEl of getEls(vlEl, SCL_NS, 'Bay')) {
      const bayName = bayEl.getAttribute('name') ?? '';
      const bayDesc = bayEl.getAttribute('desc') ?? undefined;
      const equipment: SldEquipment[] = [];

      for (const [tag, kind] of Object.entries(EQUIPMENT_TAGS)) {
        for (const eqEl of getEls(bayEl, SCL_NS, tag)) {
          const eqName = eqEl.getAttribute('name') ?? '';
          const eqDesc = eqEl.getAttribute('desc') ?? undefined;
          const ieds: string[] = [];
          for (const ln of getEls(eqEl, SCL_NS, 'LNode')) {
            const ied = ln.getAttribute('iedName');
            if (ied && ied !== 'None' && !ieds.includes(ied)) ieds.push(ied);
          }
          equipment.push({ name: eqName, kind, desc: eqDesc, ieds });
        }
      }

      bays.push({ name: bayName, desc: bayDesc, voltageLevel: vlName, nominalVoltage, equipment, col: col++ });
    }

    voltageLevels.push({ name: vlName, nominalVoltage, bays, color });
  }

  return { substationName, voltageLevels };
}
```

- [ ] Run: `npx tsc --noEmit` — expect no errors

---

## Task 3: Layout algorithm

**Files:**
- Create: `src/sld/layout.ts`

- [ ] Create `src/sld/layout.ts`:

```typescript
import type { SldVoltageLevel } from './types';

export const BAY_WIDTH = 120;
export const ROW_HEIGHT = 110;
export const BUS_Y_TOP = 60;
export const BUS_Y_BOT = 180;
export const SYMBOL_SIZE = 60;
export const SYMBOL_HEIGHT = 80;
export const VL_HEADER_HEIGHT = 48;
export const IED_CHIP_HEIGHT = 22;
export const IED_CHIP_GAP = 4;
export const LEFT_MARGIN = 80;

export interface LayoutVoltageLevel {
  name: string;
  color: string;
  nominalVoltage: number;
  yOffset: number;         // top of this VL section in canvas coords
  totalHeight: number;     // height of this VL section
  busYTop: number;         // absolute Y of top busbar
  busYBot: number;         // absolute Y of bottom busbar
  busWidth: number;        // total horizontal span
  bays: LayoutBay[];
}

export interface LayoutBay {
  name: string;
  col: number;
  x: number;               // center X of bay column
  equipment: LayoutEquipment[];
}

export interface LayoutEquipment {
  name: string;
  kind: string;
  desc?: string;
  ieds: string[];
  x: number;
  y: number;               // center Y of symbol
  chipStartY: number;      // Y where IED chips begin
}

export function computeLayout(voltageLevels: SldVoltageLevel[]): LayoutVoltageLevel[] {
  const result: LayoutVoltageLevel[] = [];
  let yOffset = 0;

  for (const vl of voltageLevels) {
    const bayCount = Math.max(vl.bays.length, 1);
    const busWidth = LEFT_MARGIN + bayCount * BAY_WIDTH;

    // How many equipment rows max in any bay?
    const maxEquip = vl.bays.reduce((m, b) => Math.max(m, b.equipment.length), 0);
    const maxIeds = vl.bays.reduce((m, b) =>
      Math.max(m, b.equipment.reduce((n, e) => n + e.ieds.length, 0)), 0);

    const feederHeight = Math.max(maxEquip, 1) * ROW_HEIGHT + maxIeds * (IED_CHIP_HEIGHT + IED_CHIP_GAP);
    const totalHeight = VL_HEADER_HEIGHT + BUS_Y_BOT + 20 + feederHeight;

    const busYTop = yOffset + VL_HEADER_HEIGHT + BUS_Y_TOP;
    const busYBot = yOffset + VL_HEADER_HEIGHT + BUS_Y_BOT;

    const bays: LayoutBay[] = vl.bays.map((bay) => {
      const x = LEFT_MARGIN + bay.col * BAY_WIDTH + BAY_WIDTH / 2;
      let equipY = busYBot + ROW_HEIGHT;
      let chipY = 0;

      const equipment: LayoutEquipment[] = bay.equipment.map((eq) => {
        const y = equipY;
        chipY = y + SYMBOL_HEIGHT / 2 + 8;
        const chipCount = eq.ieds.length;
        equipY += ROW_HEIGHT + chipCount * (IED_CHIP_HEIGHT + IED_CHIP_GAP);
        return { ...eq, x, y, chipStartY: chipY };
      });

      return { name: bay.name, col: bay.col, x, equipment };
    });

    result.push({
      name: vl.name,
      color: vl.color,
      nominalVoltage: vl.nominalVoltage,
      yOffset,
      totalHeight,
      busYTop,
      busYBot,
      busWidth,
      bays,
    });

    yOffset += totalHeight + 32;
  }

  return result;
}
```

- [ ] Run: `npx tsc --noEmit` — expect no errors

---

## Task 4: SVG symbol components

**Files:**
- Create: `src/sld/symbols.tsx`

IEC 60617 stroke-based symbols in a 60×100 viewBox. `currentColor` strokes, width 2, linecap `round`. Terminal points at (30,0) top and (30,100) bottom.

- [ ] Create `src/sld/symbols.tsx`:

```tsx
import React from 'react';
import type { EquipmentKind } from './types';

export interface SymbolProps {
  color: string;
  size?: number;
}

const BASE_W = 60;
const BASE_H = 100;

// Shared blade+pivot geometry (open position, pivot at (30,36))
function BladePivot({ color }: { color: string }) {
  // pivot dot
  // blade rotated -30deg around (30,36), length 22px
  const rad = (-30 * Math.PI) / 180;
  const x2 = 30 + 22 * Math.sin(rad);
  const y2 = 36 + 22 * Math.cos(rad);
  return (
    <>
      <line x1="30" y1="0" x2="30" y2="35" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx="30" cy="36" r="3" fill={color} />
      <line x1="30" y1="36" x2={x2.toFixed(2)} y2={y2.toFixed(2)} stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="30" y1="65" x2="30" y2="100" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </>
  );
}

/** DIS — Disconnector (IEC 60617 ref 7-2-01): blade + pivot, no star */
export function DisSymbol({ color, size = BASE_H }: SymbolProps) {
  const scale = size / BASE_H;
  return (
    <svg viewBox={`0 0 ${BASE_W} ${BASE_H}`} width={BASE_W * scale} height={BASE_H * scale} overflow="visible">
      <BladePivot color={color} />
    </svg>
  );
}

/** CBR — Circuit Breaker (IEC 60617 ref 7-2-04): DIS + 6-point star at fixed contact */
export function CbrSymbol({ color, size = BASE_H }: SymbolProps) {
  const scale = size / BASE_H;
  // Star at (21, 68) — where blade tip rests when open
  const cx = 21; const cy = 68; const r = 6;
  const starLines = [0, 60, 120].map((deg) => {
    const a = (deg * Math.PI) / 180;
    return { x1: cx - r * Math.sin(a), y1: cy - r * Math.cos(a), x2: cx + r * Math.sin(a), y2: cy + r * Math.cos(a) };
  });
  return (
    <svg viewBox={`0 0 ${BASE_W} ${BASE_H}`} width={BASE_W * scale} height={BASE_H * scale} overflow="visible">
      <BladePivot color={color} />
      {starLines.map((l, i) => (
        <line key={i} x1={l.x1.toFixed(2)} y1={l.y1.toFixed(2)} x2={l.x2.toFixed(2)} y2={l.y2.toFixed(2)}
          stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      ))}
    </svg>
  );
}

/** GG — Earthing Switch (IEC 60617 ref 7-2-03): blade swings toward earth symbol */
export function GgSymbol({ color, size = BASE_H }: SymbolProps) {
  const scale = size / BASE_H;
  // Pivot at (30,31), blade -45deg (toward earth below)
  const rad = (-45 * Math.PI) / 180;
  const x2 = 30 + 22 * Math.sin(rad);
  const y2 = 31 + 22 * Math.cos(rad);
  return (
    <svg viewBox={`0 0 ${BASE_W} ${BASE_H}`} width={BASE_W * scale} height={BASE_H * scale} overflow="visible">
      <line x1="30" y1="0" x2="30" y2="30" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx="30" cy="31" r="3" fill={color} />
      <line x1="30" y1="31" x2={x2.toFixed(2)} y2={y2.toFixed(2)} stroke={color} strokeWidth="2" strokeLinecap="round" />
      {/* Earth symbol */}
      <line x1="10" y1="65" x2="50" y2="65" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="16" y1="72" x2="44" y2="72" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="22" y1="79" x2="38" y2="79" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** CTR — Current Transformer (IEC 60617 ref 7-5-01): conductor through circle + winding marks */
export function CtrSymbol({ color, size = BASE_H }: SymbolProps) {
  const scale = size / BASE_H;
  return (
    <svg viewBox={`0 0 ${BASE_W} ${BASE_H}`} width={BASE_W * scale} height={BASE_H * scale} overflow="visible">
      <line x1="30" y1="0" x2="30" y2="100" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx="30" cy="50" r="12" stroke={color} strokeWidth="2" fill="none" />
      <line x1="24" y1="45" x2="36" y2="45" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="24" y1="55" x2="36" y2="55" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** VTR — Voltage Transformer (IEC 60617 ref 7-5-02): two nested circles on conductor */
export function VtrSymbol({ color, size = BASE_H }: SymbolProps) {
  const scale = size / BASE_H;
  return (
    <svg viewBox={`0 0 ${BASE_W} ${BASE_H}`} width={BASE_W * scale} height={BASE_H * scale} overflow="visible">
      <line x1="30" y1="0" x2="30" y2="100" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx="30" cy="44" r="10" stroke={color} strokeWidth="2" fill="none" />
      <circle cx="30" cy="56" r="10" stroke={color} strokeWidth="2" fill="none" />
    </svg>
  );
}

/** IFL — Line / Feeder (IEC 60617): vertical conductor + diagonal at bottom */
export function IflSymbol({ color, size = BASE_H }: SymbolProps) {
  const scale = size / BASE_H;
  return (
    <svg viewBox={`0 0 ${BASE_W} ${BASE_H}`} width={BASE_W * scale} height={BASE_H * scale} overflow="visible">
      <line x1="30" y1="0" x2="30" y2="80" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="30" y1="80" x2="50" y2="100" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** GV — General / Series Capacitor: simple box symbol */
export function GvSymbol({ color, size = BASE_H }: SymbolProps) {
  const scale = size / BASE_H;
  return (
    <svg viewBox={`0 0 ${BASE_W} ${BASE_H}`} width={BASE_W * scale} height={BASE_H * scale} overflow="visible">
      <line x1="30" y1="0" x2="30" y2="40" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <rect x="18" y="40" width="24" height="20" stroke={color} strokeWidth="2" fill="none" />
      <line x1="30" y1="60" x2="30" y2="100" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const SYMBOL_MAP: Partial<Record<EquipmentKind, React.FC<SymbolProps>>> = {
  CBR: CbrSymbol,
  DIS: DisSymbol,
  GG: GgSymbol,
  CTR: CtrSymbol,
  VTR: VtrSymbol,
  IFL: IflSymbol,
  GV: GvSymbol,
};

export function getSymbol(kind: EquipmentKind): React.FC<SymbolProps> {
  return SYMBOL_MAP[kind] ?? IflSymbol;
}
```

- [ ] Run: `npx tsc --noEmit` — expect no errors

---

## Task 5: Extend SclModel and wire parser

**Files:**
- Modify: `src/model/types.ts`
- Modify: `src/parser/sclParser.ts`

- [ ] In `src/model/types.ts`, add to the `SclModel` interface:

```typescript
import type { SldModel } from '../sld/types';
// add to SclModel:
sld?: SldModel;
```

- [ ] In `src/parser/sclParser.ts`, at the top add:

```typescript
import { parseSld } from '../sld/parseSld';
```

Find the `parseSclDocument` return statement and add `sld: parseSld(doc) ?? undefined`. The raw `doc` (XMLDocument / Document) must be passed; check what variable holds the parsed DOM in that function.

- [ ] Run: `npx tsc --noEmit` — expect no errors

---

## Task 6: SubstationDiagram component

**Files:**
- Create: `src/components/SubstationDiagram.tsx`

- [ ] Create `src/components/SubstationDiagram.tsx`:

```tsx
import React, { useCallback, useMemo, useRef, useState } from 'react';
import type { SclModel } from '../model/types';
import { computeLayout } from '../sld/layout';
import { BAY_WIDTH, BUS_Y_BOT, BUS_Y_TOP, IED_CHIP_HEIGHT, IED_CHIP_GAP, LEFT_MARGIN, SYMBOL_SIZE, VL_HEADER_HEIGHT } from '../sld/layout';
import { getSymbol } from '../sld/symbols';

interface Transform { x: number; y: number; scale: number }

export default function SubstationDiagram({ model }: { model: SclModel | null }) {
  const sld = model?.sld;
  const [transform, setTransform] = useState<Transform>({ x: 40, y: 40, scale: 1 });
  const [panning, setPanning] = useState(false);
  const [hiddenVls, setHiddenVls] = useState<Set<string>>(new Set());
  const panStart = useRef<{ mx: number; my: number; tx: number; ty: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const layout = useMemo(
    () => (sld ? computeLayout(sld.voltageLevels) : []),
    [sld]
  );

  const toggleVl = useCallback((name: string) => {
    setHiddenVls(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setTransform(t => {
      const scale = Math.max(0.1, Math.min(8, t.scale * factor));
      return { scale, x: mx - (mx - t.x) * (scale / t.scale), y: my - (my - t.y) * (scale / t.scale) };
    });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setPanning(true);
    panStart.current = { mx: e.clientX, my: e.clientY, tx: transform.x, ty: transform.y };
  }, [transform]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!panning || !panStart.current) return;
    const dx = e.clientX - panStart.current.mx;
    const dy = e.clientY - panStart.current.my;
    setTransform(t => ({ ...t, x: panStart.current!.tx + dx, y: panStart.current!.ty + dy }));
  }, [panning]);

  const handleMouseUp = useCallback(() => { setPanning(false); panStart.current = null; }, []);

  const fitToScreen = useCallback(() => {
    if (!svgRef.current || layout.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const totalH = layout[layout.length - 1].yOffset + layout[layout.length - 1].totalHeight;
    const totalW = Math.max(...layout.map(l => l.busWidth));
    const scale = Math.min(rect.width / (totalW + 80), rect.height / (totalH + 80), 2);
    setTransform({ x: 40, y: 40, scale });
  }, [layout]);

  if (!sld) {
    return (
      <div className="sld-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 14 }}>
        No &lt;Substation&gt; section found in this file.
      </div>
    );
  }

  return (
    <div className="sld-root">
      {/* Toolbar */}
      <div className="sld-toolbar">
        <button className="btn" onClick={() => setTransform(t => ({ ...t, scale: t.scale * 1.2 }))} title="Zoom in">+</button>
        <button className="btn" onClick={() => setTransform(t => ({ ...t, scale: t.scale / 1.2 }))} title="Zoom out">−</button>
        <button className="btn" onClick={() => setTransform({ x: 40, y: 40, scale: 1 })} title="Reset">⌂</button>
        <button className="btn" onClick={fitToScreen} title="Fit">Fit</button>
        <span style={{ color: '#64748b', fontSize: 12 }}>{sld.substationName}</span>
        <div className="sld-vl-filter">
          {sld.voltageLevels.map(vl => (
            <button
              key={vl.name}
              className={`sld-vl-pill${hiddenVls.has(vl.name) ? '' : ' active'}`}
              style={{ color: vl.color, borderColor: vl.color }}
              onClick={() => toggleVl(vl.name)}
            >
              {vl.nominalVoltage > 0 ? `${vl.nominalVoltage.toFixed(0)} kV` : vl.name}
            </button>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div
        className={`sld-canvas-wrap${panning ? ' panning' : ''}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg ref={svgRef} width="100%" height="100%">
          <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
            {layout.filter(vl => !hiddenVls.has(vl.name)).map(vl => (
              <SldVoltageSection key={vl.name} vl={vl} />
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}

function SldVoltageSection({ vl }: { vl: ReturnType<typeof computeLayout>[number] }) {
  return (
    <g>
      {/* VL header label */}
      <text
        x={LEFT_MARGIN - 8}
        y={vl.yOffset + VL_HEADER_HEIGHT / 2 + 5}
        fill={vl.color}
        className="sld-vl-label"
        textAnchor="end"
      >
        {vl.nominalVoltage > 0 ? `${vl.nominalVoltage.toFixed(0)} kV` : vl.name}
      </text>

      {/* Top busbar */}
      <line
        x1={LEFT_MARGIN} y1={vl.busYTop}
        x2={vl.busWidth} y2={vl.busYTop}
        stroke={vl.color} strokeWidth="4" strokeLinecap="round"
      />
      {/* Bottom busbar */}
      <line
        x1={LEFT_MARGIN} y1={vl.busYBot}
        x2={vl.busWidth} y2={vl.busYBot}
        stroke={vl.color} strokeWidth="4" strokeLinecap="round"
      />

      {/* Bay columns */}
      {vl.bays.map(bay => (
        <SldBayColumn key={bay.name} bay={bay} vl={vl} />
      ))}
    </g>
  );
}

function SldBayColumn({
  bay,
  vl,
}: {
  bay: ReturnType<typeof computeLayout>[number]['bays'][number];
  vl: ReturnType<typeof computeLayout>[number];
}) {
  return (
    <g>
      {/* Bay label */}
      <text x={bay.x} y={vl.busYTop - 10} fill="#64748b" className="sld-bay-label" textAnchor="middle">
        {bay.name}
      </text>
      {/* Vertical feeder line from busbar down through equipment */}
      <line
        x1={bay.x} y1={vl.busYTop}
        x2={bay.x} y2={vl.busYBot}
        stroke={vl.color} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.4"
      />

      {/* Equipment symbols */}
      {bay.equipment.map((eq) => {
        const Sym = getSymbol(eq.kind as Parameters<typeof getSymbol>[0]);
        const symW = SYMBOL_SIZE;
        const symH = 80;
        return (
          <g key={eq.name}>
            {/* Connector line from last item / busbar */}
            <line
              x1={bay.x} y1={eq.y - symH / 2 - 10}
              x2={bay.x} y2={eq.y + symH / 2 + 10}
              stroke={vl.color} strokeWidth="1" opacity="0.3"
            />
            {/* Symbol centered on (eq.x, eq.y) */}
            <g transform={`translate(${eq.x - symW / 2}, ${eq.y - symH / 2})`}>
              <Sym color={vl.color} size={symH} />
            </g>
            {/* Equipment name */}
            <text x={eq.x + symW / 2 + 4} y={eq.y + 4} fill="#94a3b8" fontSize="9" fontFamily="monospace">
              {eq.name}
            </text>
            {/* IED chips */}
            {eq.ieds.map((ied, i) => (
              <g key={ied} className="sld-ied-chip"
                transform={`translate(${eq.x - 40}, ${eq.chipStartY + i * (IED_CHIP_HEIGHT + IED_CHIP_GAP)})`}
              >
                <rect rx="3" width="80" height={IED_CHIP_HEIGHT}
                  fill="#1e293b" stroke={vl.color} strokeWidth="1" />
                <text x="40" y={IED_CHIP_HEIGHT / 2}
                  fill={vl.color} fontSize="9" fontFamily="monospace"
                  textAnchor="middle" dominantBaseline="middle"
                >
                  {ied}
                </text>
              </g>
            ))}
          </g>
        );
      })}
    </g>
  );
}
```

- [ ] Run: `npx tsc --noEmit` — expect no errors

---

## Task 7: Add CSS styles

**Files:**
- Modify: `src/styles.css`

- [ ] Append to `src/styles.css` (at the end of file):

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
  opacity: 0.4;
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
.sld-canvas-wrap svg { display: block; width: 100%; height: 100%; }
.sld-vl-label { font-size: 13px; font-weight: 700; font-family: monospace; letter-spacing: 0.05em; }
.sld-bay-label { font-size: 10px; fill: #94a3b8; font-family: monospace; }
.sld-ied-chip text { dominant-baseline: middle; text-anchor: middle; }
```

---

## Task 8: Wire into App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] In `src/App.tsx`:

1. Add `'sld'` to the `AppMode` union:
```typescript
export type AppMode =
  | 'dashboard' | 'visualizer' | 'issues' | 'network'
  | 'statistics' | 'addresses' | 'ied' | 'version' | 'sld';
```

2. Add to `centerViewItems` array:
```typescript
{ id: 'sld', label: 'Single Line', icon: '⏚' },
```

3. Add `'sld'` to `isReportTab` (so sidebars auto-collapse):
```typescript
const isReportTab = appMode === 'issues' || ... || appMode === 'sld';
```

4. Add import at top:
```typescript
import SubstationDiagram from './components/SubstationDiagram';
```

5. Add render block after the Network view block:
```tsx
{/* SLD view */}
{appMode === 'sld' ? (
  <SubstationDiagram model={activeModel} />
) : null}
```

- [ ] Run: `npx tsc --noEmit` — expect no errors
- [ ] Run: `npm run test` — all tests pass
- [ ] Run: `npm run build` — clean build

---

## Task 9: Verify with NJA file

- [ ] Load `2026-01-22-NJA-2007B-V5-R000.scd` in the app
- [ ] Switch to Single Line tab (⏚)
- [ ] Confirm 3 voltage level sections appear with correct colors (green 220kV, red 132kV, yellow 11kV)
- [ ] Confirm bay names visible per voltage level
- [ ] Confirm equipment symbols render (CBR with star, DIS without, GG with earth symbol)
- [ ] Confirm IED chips appear under equipment with correct IED names
- [ ] Confirm pan with mouse drag works
- [ ] Confirm zoom with scroll wheel works
- [ ] Confirm voltage filter pills hide/show sections
- [ ] Confirm Fit button centers diagram
